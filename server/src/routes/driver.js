// Driver / conductor: pick today's trip, share GPS, see passengers, mark boarded.
import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../db/index.js';
import { ah, HttpError, requireAuth } from '../middleware/auth.js';
import { todayLocal, dayOfWeek, isValidDate } from '../services/time.js';
import { getTrip, getRouteStops, journeyTimes, BUS_TYPE_LABEL } from '../services/trips.js';
import { stopEtas, routeProgress } from '../services/geo.js';
import { emitToTrip } from '../services/realtime.js';
import { verifyTicketPayload } from '../services/tickets.js';
import { checkTripParams } from './public.js';

const router = Router();
router.use(requireAuth('driver', 'admin'));

/** Drivers with an assigned bus may only operate that bus. */
async function assertCanOperate(req, trip) {
  if (req.user.role === 'admin') return;
  const me = await one('SELECT assigned_bus_id FROM users WHERE id = $1', [req.user.id]);
  if (me?.assigned_bus_id && me.assigned_bus_id !== trip.bus_id) {
    throw new HttpError(403, 'This bus is not assigned to you');
  }
}

router.get(
  '/trips',
  ah(async (req, res) => {
    const date = isValidDate(String(req.query.date)) ? String(req.query.date) : todayLocal();
    const me = await one('SELECT assigned_bus_id FROM users WHERE id = $1', [req.user.id]);
    const rows = await query(
      `SELECT s.id, s.service_no, s.departure_time::text AS departure_time, r.name AS route_name,
              b.reg_no, b.bus_type, b.id AS bus_id
         FROM schedules s JOIN routes r ON r.id = s.route_id JOIN buses b ON b.id = s.bus_id
        WHERE s.active AND position($1 in s.days) > 0 AND ($2::uuid IS NULL OR b.id = $2::uuid)
        ORDER BY s.departure_time`,
      [String(dayOfWeek(date)), req.user.role === 'admin' ? null : me?.assigned_bus_id || null],
    );
    res.json({
      date,
      trips: rows.map((r) => ({
        scheduleId: r.id,
        serviceNo: r.service_no,
        routeName: r.route_name,
        regNo: r.reg_no,
        busType: r.bus_type,
        busTypeLabel: BUS_TYPE_LABEL[r.bus_type],
        departureTime: r.departure_time.slice(0, 5),
      })),
    });
  }),
);

const gpsSchema = z.object({
  scheduleId: z.string().uuid(),
  travelDate: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(200).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
});

router.post(
  '/gps',
  ah(async (req, res) => {
    const body = gpsSchema.parse(req.body);
    checkTripParams(body.scheduleId, body.travelDate);
    const trip = await getTrip(body.scheduleId);
    if (!trip) throw new HttpError(404, 'Bus not found');
    await assertCanOperate(req, trip);

    const location = await one(
      `INSERT INTO gps_locations (schedule_id, travel_date, driver_id, lat, lng, speed_kmh, heading)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING lat, lng, speed_kmh, heading, recorded_at`,
      [trip.id, body.travelDate, req.user.id, body.lat, body.lng, body.speedKmh ?? null, body.heading ?? null],
    );
    const stops = await getRouteStops(trip.route_id);
    const etas = stopEtas(stops, location);
    const { offRouteKm } = routeProgress(stops, body.lat, body.lng);
    emitToTrip(trip.id, body.travelDate, 'gps', { location, etas });
    res.json({ ok: true, etas, offRouteKm: Math.round(offRouteKm * 10) / 10 });
  }),
);

router.get(
  '/trips/:scheduleId/:date/passengers',
  ah(async (req, res) => {
    const { scheduleId, date } = req.params;
    checkTripParams(scheduleId, date);
    const trip = await getTrip(scheduleId);
    if (!trip) throw new HttpError(404, 'Bus not found');
    await assertCanOperate(req, trip);
    res.json(await tripPassengers(trip, date));
  }),
);

async function tripPassengers(trip, date) {
  const rows = await query(
    `SELECT bk.id, bk.pnr, bk.passengers, fs.name AS from_name, ts.name AS to_name, fs.minutes_from_start AS from_min,
            se.seat_no, se.boarded
       FROM bookings bk
       JOIN seats se ON se.booking_id = bk.id
       JOIN stops fs ON fs.id = bk.from_stop_id
       JOIN stops ts ON ts.id = bk.to_stop_id
      WHERE bk.schedule_id = $1 AND bk.travel_date = $2 AND bk.status = 'confirmed'
      ORDER BY fs.seq, se.seat_no`,
    [trip.id, date],
  );
  return rows.map((r) => {
    const p = r.passengers.find((x) => x.seatNo === r.seat_no) || {};
    return {
      bookingId: r.id,
      pnr: r.pnr,
      seatNo: r.seat_no,
      name: p.name,
      age: p.age,
      gender: p.gender,
      from: r.from_name,
      to: r.to_name,
      boardingTime: journeyTimes({ date, departureTime: trip.departure_time, fromMin: r.from_min, toMin: r.from_min, busType: trip.bus_type }).departure.time,
      boarded: r.boarded,
    };
  });
}

// Mark boarded by scanned QR, by PNR, or a single seat toggle.
router.post(
  '/board',
  ah(async (req, res) => {
    const body = z
      .object({
        scheduleId: z.string().uuid(),
        travelDate: z.string(),
        qr: z.string().optional(),
        pnr: z.string().trim().toUpperCase().optional(),
        seatNo: z.string().optional(),
        boarded: z.boolean().default(true),
      })
      .parse(req.body);
    checkTripParams(body.scheduleId, body.travelDate);
    const trip = await getTrip(body.scheduleId);
    if (!trip) throw new HttpError(404, 'Bus not found');
    await assertCanOperate(req, trip);

    let bookingFilter;
    if (body.qr) {
      const t = verifyTicketPayload(body.qr);
      if (!t) throw new HttpError(400, 'Invalid or fake ticket QR code');
      bookingFilter = { col: 'id', val: t.bookingId };
    } else if (body.pnr) {
      bookingFilter = { col: 'pnr', val: body.pnr };
    } else if (!body.seatNo) {
      throw new HttpError(400, 'Scan a QR code or enter a PNR');
    }

    let updated;
    if (bookingFilter) {
      const bk = await one(`SELECT id, schedule_id, travel_date::text AS travel_date, status FROM bookings WHERE ${bookingFilter.col} = $1`, [bookingFilter.val]);
      if (!bk) throw new HttpError(404, 'Ticket not found');
      if (bk.schedule_id !== trip.id || bk.travel_date !== body.travelDate) throw new HttpError(400, 'This ticket is for a different bus or date');
      if (bk.status !== 'confirmed') throw new HttpError(400, `Ticket is ${bk.status.replace('_', ' ')}`);
      updated = await query(
        `UPDATE seats SET boarded = $2 WHERE booking_id = $1 ${body.seatNo ? 'AND seat_no = $3' : ''} RETURNING seat_no`,
        body.seatNo ? [bk.id, body.boarded, body.seatNo] : [bk.id, body.boarded],
      );
    } else {
      updated = await query(
        `UPDATE seats SET boarded = $4 WHERE schedule_id = $1 AND travel_date = $2 AND seat_no = $3 AND status = 'booked' RETURNING seat_no`,
        [trip.id, body.travelDate, body.seatNo, body.boarded],
      );
    }
    if (!updated.length) throw new HttpError(404, 'No booked seat matched');
    res.json({ ok: true, seats: updated.map((r) => r.seat_no), passengers: await tripPassengers(trip, body.travelDate) });
  }),
);

export default router;
