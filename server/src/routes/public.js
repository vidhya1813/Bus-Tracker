// Public endpoints: places, search, seat map, live tracking.
import { Router } from 'express';
import { query, one, tx } from '../db/index.js';
import { ah, HttpError } from '../middleware/auth.js';
import { isValidDate, dayOfWeek, todayLocal } from '../services/time.js';
import { segmentFare, journeyTimes, getTrip, getRouteStops, ensureSeats, listSeats, BUS_TYPE_LABEL } from '../services/trips.js';
import { stopEtas } from '../services/geo.js';
import { resolvePlace, TAMIL_NAMES } from '../services/places.js';
import { findConnections, departuresBoard } from '../services/connections.js';
import { bookingDetails } from '../services/tickets.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const checkTripParams = (scheduleId, date) => {
  if (!UUID_RE.test(scheduleId)) throw new HttpError(400, 'Invalid bus');
  if (!isValidDate(date)) throw new HttpError(400, 'Invalid date');
};

const placeNames = async () => (await query(`SELECT DISTINCT name FROM stops ORDER BY name`)).map((r) => r.name);

router.get(
  '/places',
  ah(async (req, res) => {
    res.json((await placeNames()).map((name) => ({ name, ta: TAMIL_NAMES[name] || name })));
  }),
);

router.get(
  '/search',
  ah(async (req, res) => {
    const fromInput = String(req.query.from || '').trim();
    const toInput = String(req.query.to || '').trim();
    const date = String(req.query.date || todayLocal());
    if (!fromInput || !toInput) throw new HttpError(400, 'Please enter From and To places');
    if (!isValidDate(date)) throw new HttpError(400, 'Invalid date');
    if (date < todayLocal()) throw new HttpError(400, 'Please choose today or a future date');

    // Accept nicknames, Tamil names and small typos ("trichy", "கோவை", "Coimbatre").
    const names = await placeNames();
    const fromRes = resolvePlace(fromInput, names);
    const toRes = resolvePlace(toInput, names);
    if (!fromRes.name || !toRes.name) {
      return res.json({
        date,
        from: fromRes.name || fromInput,
        to: toRes.name || toInput,
        buses: [],
        connections: [],
        unknown: [
          ...(!fromRes.name ? [{ field: 'from', input: fromInput, suggestions: fromRes.suggestions }] : []),
          ...(!toRes.name ? [{ field: 'to', input: toInput, suggestions: toRes.suggestions }] : []),
        ],
      });
    }
    const from = fromRes.name;
    const to = toRes.name;
    if (from === to) throw new HttpError(400, 'From and To cannot be the same');

    const rows = await query(
      `SELECT s.id AS schedule_id, s.service_no, s.departure_time::text AS departure_time,
              r.id AS route_id, r.code AS route_code, r.name AS route_name,
              b.reg_no, b.bus_type, b.total_seats,
              fs.id AS from_stop_id, fs.name AS from_name, fs.distance_km AS from_km, fs.minutes_from_start AS from_min,
              ts.id AS to_stop_id, ts.name AS to_name, ts.distance_km AS to_km, ts.minutes_from_start AS to_min,
              (SELECT max(distance_km) FROM stops x WHERE x.route_id = r.id) AS total_km,
              f.amount AS route_fare,
              (SELECT count(*)::int FROM seats st
                 WHERE st.schedule_id = s.id AND st.travel_date = $3
                   AND (st.status = 'booked' OR (st.status = 'held' AND st.held_until > now()))) AS taken
         FROM schedules s
         JOIN routes r ON r.id = s.route_id AND r.active
         JOIN buses b ON b.id = s.bus_id AND b.active
         JOIN stops fs ON fs.route_id = r.id AND lower(fs.name) = lower($1)
         JOIN stops ts ON ts.route_id = r.id AND lower(ts.name) = lower($2) AND ts.seq > fs.seq
         LEFT JOIN fares f ON f.route_id = r.id AND f.bus_type = b.bus_type
        WHERE s.active AND position($4 in s.days) > 0`,
      [from, to, date, String(dayOfWeek(date))],
    );

    const now = Date.now();
    const buses = rows
      .map((r) => {
        const times = journeyTimes({ date, departureTime: r.departure_time, fromMin: r.from_min, toMin: r.to_min, busType: r.bus_type });
        return {
          scheduleId: r.schedule_id,
          serviceNo: r.service_no,
          routeCode: r.route_code,
          routeName: r.route_name,
          regNo: r.reg_no,
          busType: r.bus_type,
          busTypeLabel: BUS_TYPE_LABEL[r.bus_type],
          fromStopId: r.from_stop_id,
          toStopId: r.to_stop_id,
          from: r.from_name,
          to: r.to_name,
          distanceKm: Math.round(r.to_km - r.from_km),
          fare: segmentFare({ routeFare: r.route_fare, totalKm: r.total_km, fromKm: r.from_km, toKm: r.to_km, busType: r.bus_type }),
          seatsLeft: r.total_seats - r.taken,
          totalSeats: r.total_seats,
          departed: new Date(times.departureAt).getTime() < now,
          ...times,
        };
      })
      .sort((a, b) => a.departureAt.localeCompare(b.departureAt));

    // No direct bus still to come today? Suggest journeys with a change.
    const anyBookable = buses.some((b) => !b.departed);
    const connections = anyBookable ? [] : await findConnections({ from, to, date });
    res.json({ date, from, to, buses, connections });
  }),
);

router.get(
  '/departures',
  ah(async (req, res) => {
    const date = String(req.query.date || todayLocal());
    if (!isValidDate(date)) throw new HttpError(400, 'Invalid date');
    const { name, suggestions } = resolvePlace(String(req.query.place || ''), await placeNames());
    if (!name) return res.json({ place: null, suggestions, date, departures: [] });
    res.json({ place: name, date, departures: await departuresBoard(name, date) });
  }),
);

// Public PNR status: no passenger names or contact details.
router.get(
  '/pnr/:pnr',
  ah(async (req, res) => {
    const pnr = String(req.params.pnr).trim().toUpperCase();
    if (!/^GB\d{8}$/.test(pnr)) throw new HttpError(400, 'PNR looks like GB12345678');
    const row = await one('SELECT id FROM bookings WHERE pnr = $1', [pnr]);
    if (!row) throw new HttpError(404, 'No ticket found with that PNR');
    const b = await bookingDetails(row.id);
    res.json({
      pnr: b.pnr,
      status: b.status,
      from: b.from,
      to: b.to,
      travelDate: b.travelDate,
      departure: b.departure,
      arrival: b.arrival,
      busTypeLabel: b.busTypeLabel,
      serviceNo: b.serviceNo,
      regNo: b.regNo,
      seatCount: b.seatNos.length,
      scheduleId: b.scheduleId,
      refundStatus: b.refundStatus,
    });
  }),
);

router.get(
  '/trips/:scheduleId/:date',
  ah(async (req, res) => {
    const { scheduleId, date } = req.params;
    checkTripParams(scheduleId, date);
    const trip = await getTrip(scheduleId);
    if (!trip) throw new HttpError(404, 'Bus not found');
    const stops = await getRouteStops(trip.route_id);
    await tx((t) => ensureSeats(t, trip, date));
    const seats = await listSeats(scheduleId, date);
    const fare = await one('SELECT amount FROM fares WHERE route_id = $1 AND bus_type = $2', [trip.route_id, trip.bus_type]);
    const totalKm = stops[stops.length - 1]?.distance_km || 0;
    res.json({
      trip: {
        scheduleId: trip.id,
        serviceNo: trip.service_no,
        routeCode: trip.route_code,
        routeName: trip.route_name,
        regNo: trip.reg_no,
        busType: trip.bus_type,
        busTypeLabel: BUS_TYPE_LABEL[trip.bus_type],
        layout: trip.layout,
        departureTime: trip.departure_time,
        date,
      },
      stops: stops.map((s) => ({
        ...s,
        ...journeyTimes({ date, departureTime: trip.departure_time, fromMin: s.minutes_from_start, toMin: s.minutes_from_start, busType: trip.bus_type }),
        fareFromOrigin: segmentFare({ routeFare: fare?.amount, totalKm, fromKm: 0, toKm: s.distance_km, busType: trip.bus_type }),
      })),
      fare: { routeFare: fare?.amount ?? null, totalKm },
      seats,
    });
  }),
);

router.get(
  '/track/:scheduleId/:date',
  ah(async (req, res) => {
    const { scheduleId, date } = req.params;
    checkTripParams(scheduleId, date);
    const trip = await getTrip(scheduleId);
    if (!trip) throw new HttpError(404, 'Bus not found');
    const stops = await getRouteStops(trip.route_id);
    const location = await one(
      `SELECT lat, lng, speed_kmh, heading, recorded_at FROM gps_locations
        WHERE schedule_id = $1 AND travel_date = $2 ORDER BY recorded_at DESC LIMIT 1`,
      [scheduleId, date],
    );
    const trail = await query(
      `SELECT lat, lng FROM (SELECT lat, lng, recorded_at FROM gps_locations
         WHERE schedule_id = $1 AND travel_date = $2 ORDER BY recorded_at DESC LIMIT 200) t ORDER BY recorded_at`,
      [scheduleId, date],
    );
    res.json({
      trip: {
        scheduleId: trip.id,
        serviceNo: trip.service_no,
        routeName: trip.route_name,
        regNo: trip.reg_no,
        busType: trip.bus_type,
        busTypeLabel: BUS_TYPE_LABEL[trip.bus_type],
        date,
      },
      stops: stops.map((s) => ({
        ...s,
        scheduled: journeyTimes({ date, departureTime: trip.departure_time, fromMin: s.minutes_from_start, toMin: s.minutes_from_start, busType: trip.bus_type }).departure,
      })),
      location,
      trail,
      etas: stopEtas(stops, location),
    });
  }),
);

export default router;
