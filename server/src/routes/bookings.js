// Booking flow: hold seats -> mock payment -> confirmed e-ticket. Plus history and cancellation.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db/index.js';
import { ah, HttpError, requireAuth } from '../middleware/auth.js';
import { getTrip, ensureSeats, listSeats, segmentFare, journeyTimes } from '../services/trips.js';
import { bookingDetails, sendTicket, ticketQrDataUrl } from '../services/tickets.js';
import { emitToTrip } from '../services/realtime.js';
import { sendEmail, sendSms } from '../services/notify.js';
import { checkTripParams } from './public.js';
import { todayLocal } from '../services/time.js';

const router = Router();
router.use(requireAuth());

const MAX_SEATS = 6;

const newPnr = () => `GB${crypto.randomInt(10_000_000, 99_999_999)}`;

async function broadcastSeats(scheduleId, date) {
  emitToTrip(scheduleId, date, 'seats', { scheduleId, date, seats: await listSeats(scheduleId, date) });
}

const bookingSchema = z.object({
  scheduleId: z.string().uuid(),
  travelDate: z.string(),
  fromStopId: z.string().uuid(),
  toStopId: z.string().uuid(),
  passengers: z
    .array(
      z.object({
        seatNo: z.string().min(1).max(5),
        name: z.string().trim().min(1, 'Enter passenger name').max(60),
        age: z.coerce.number().int().min(1, 'Enter a valid age').max(120),
        gender: z.enum(['female', 'male', 'other']),
      }),
    )
    .min(1, 'Select at least one seat')
    .max(MAX_SEATS, `You can book up to ${MAX_SEATS} seats at a time`),
  contactEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  contactPhone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Enter a valid mobile number').optional().or(z.literal('')),
});

// Step 1: hold seats for 10 minutes and create a pending booking.
router.post(
  '/',
  ah(async (req, res) => {
    const body = bookingSchema.parse(req.body);
    checkTripParams(body.scheduleId, body.travelDate);
    if (body.travelDate < todayLocal()) throw new HttpError(400, 'This date has passed');
    if (!body.contactEmail && !body.contactPhone) throw new HttpError(400, 'Enter an email or mobile number for your ticket');
    const seatNos = body.passengers.map((p) => p.seatNo);
    if (new Set(seatNos).size !== seatNos.length) throw new HttpError(400, 'Each passenger needs a different seat');

    const trip = await getTrip(body.scheduleId);
    if (!trip || !trip.active) throw new HttpError(404, 'Bus not found');
    const stops = await query('SELECT id, seq, distance_km, minutes_from_start FROM stops WHERE route_id = $1 ORDER BY seq', [trip.route_id]);
    const fromStop = stops.find((s) => s.id === body.fromStopId);
    const toStop = stops.find((s) => s.id === body.toStopId);
    if (!fromStop || !toStop || toStop.seq <= fromStop.seq) throw new HttpError(400, 'Invalid boarding or drop point');

    const times = journeyTimes({ date: body.travelDate, departureTime: trip.departure_time, fromMin: fromStop.minutes_from_start, toMin: toStop.minutes_from_start, busType: trip.bus_type });
    if (new Date(times.departureAt) < new Date()) throw new HttpError(400, 'This bus has already left your boarding point');

    const fare = await one('SELECT amount FROM fares WHERE route_id = $1 AND bus_type = $2', [trip.route_id, trip.bus_type]);
    const farePerSeat = segmentFare({
      routeFare: fare?.amount,
      totalKm: stops[stops.length - 1].distance_km,
      fromKm: fromStop.distance_km,
      toKm: toStop.distance_km,
      busType: trip.bus_type,
    });

    const booking = await tx(async (t) => {
      await ensureSeats(t, trip, body.travelDate);
      const rows = await t.query(
        `SELECT seat_no, status, held_until FROM seats
          WHERE schedule_id = $1 AND travel_date = $2 AND seat_no = ANY($3::text[]) FOR UPDATE`,
        [trip.id, body.travelDate, seatNos],
      );
      if (rows.length !== seatNos.length) throw new HttpError(400, 'One or more seats do not exist on this bus');
      const taken = rows.filter((r) => r.status === 'booked' || (r.status === 'held' && new Date(r.held_until) > new Date()));
      if (taken.length) {
        throw new HttpError(409, `Sorry, seat ${taken.map((r) => r.seat_no).join(', ')} was just taken. Please choose another.`);
      }
      const [b] = await t.query(
        `INSERT INTO bookings (pnr, user_id, schedule_id, travel_date, from_stop_id, to_stop_id, seat_nos, passengers,
                               contact_email, contact_phone, fare_per_seat, total_amount, hold_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + interval '${config.holdMinutes} minutes')
         RETURNING id`,
        [
          newPnr(),
          req.user.id,
          trip.id,
          body.travelDate,
          fromStop.id,
          toStop.id,
          seatNos,
          JSON.stringify(body.passengers),
          body.contactEmail || null,
          body.contactPhone || null,
          farePerSeat,
          farePerSeat * seatNos.length,
        ],
      );
      await t.query(
        `UPDATE seats SET status = 'held', booking_id = $4, held_until = now() + interval '${config.holdMinutes} minutes'
          WHERE schedule_id = $1 AND travel_date = $2 AND seat_no = ANY($3::text[])`,
        [trip.id, body.travelDate, seatNos, b.id],
      );
      return b;
    });

    await broadcastSeats(trip.id, body.travelDate);
    res.status(201).json(await bookingDetails(booking.id));
  }),
);

router.get(
  '/',
  ah(async (req, res) => {
    const rows = await query('SELECT id FROM bookings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json(await Promise.all(rows.map((r) => bookingDetails(r.id))));
  }),
);

async function ownBooking(req) {
  const b = await bookingDetails(req.params.id);
  if (!b || (b.userId !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Booking not found');
  return b;
}

router.get(
  '/:id',
  ah(async (req, res) => {
    const b = await ownBooking(req);
    res.json({ ...b, qr: b.status === 'confirmed' ? await ticketQrDataUrl(b) : null });
  }),
);

// Refund rule: >=24h before departure 90%, 12-24h 75%, 2-12h 50%, under 2h cannot cancel.
export function refundFor(totalAmount, departureAt, now = new Date()) {
  const hours = (new Date(departureAt) - now) / 3600000;
  if (hours < 2) return null;
  const pct = hours >= 24 ? 0.9 : hours >= 12 ? 0.75 : 0.5;
  return { pct, amount: Math.round(totalAmount * pct) };
}

router.get(
  '/:id/refund-quote',
  ah(async (req, res) => {
    const b = await ownBooking(req);
    res.json({ refund: b.status === 'confirmed' ? refundFor(b.totalAmount, b.departureAt) : null });
  }),
);

router.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const b = await ownBooking(req);
    if (b.status === 'pending_payment') {
      // Abandoning an unpaid booking just releases the hold.
      await tx(async (t) => {
        await t.query(`UPDATE bookings SET status = 'expired' WHERE id = $1 AND status = 'pending_payment'`, [b.id]);
        await t.query(`UPDATE seats SET status = 'available', booking_id = NULL, held_until = NULL WHERE booking_id = $1 AND status = 'held'`, [b.id]);
      });
      await broadcastSeats(b.scheduleId, b.travelDate);
      return res.json(await bookingDetails(b.id));
    }
    if (b.status !== 'confirmed') throw new HttpError(400, 'This ticket cannot be cancelled');
    const refund = refundFor(b.totalAmount, b.departureAt);
    if (!refund) throw new HttpError(400, 'Tickets cannot be cancelled less than 2 hours before departure');

    await tx(async (t) => {
      const [row] = await t.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), refund_amount = $2,
                refund_status = 'processing', refund_initiated_at = now()
          WHERE id = $1 AND status = 'confirmed' RETURNING id`,
        [b.id, refund.amount],
      );
      if (!row) throw new HttpError(409, 'Booking was already changed');
      await t.query(`UPDATE seats SET status = 'available', booking_id = NULL, held_until = NULL, boarded = false WHERE booking_id = $1`, [b.id]);
    });
    await broadcastSeats(b.scheduleId, b.travelDate);

    const msg = `GovBus PNR ${b.pnr} cancelled. Refund of Rs ${refund.amount} (${refund.pct * 100}%) will reach your original payment method.`;
    Promise.allSettled([
      sendEmail({ to: b.contactEmail, subject: `Ticket ${b.pnr} cancelled`, text: msg }),
      sendSms({ to: b.contactPhone, body: msg }),
    ]);
    res.json(await bookingDetails(b.id));
  }),
);

// ---------- Mock payment gateway ----------
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth());

paymentsRouter.post(
  '/mock',
  ah(async (req, res) => {
    const body = z
      .object({
        bookingId: z.string().uuid(),
        method: z.enum(['upi', 'card', 'netbanking']),
        outcome: z.enum(['success', 'failure']).default('success'),
      })
      .parse(req.body);
    const b = await bookingDetails(body.bookingId);
    if (!b || b.userId !== req.user.id) throw new HttpError(404, 'Booking not found');
    if (b.status === 'confirmed') return res.json({ ok: true, booking: b });
    if (b.status !== 'pending_payment' || new Date(b.holdExpiresAt) < new Date()) {
      throw new HttpError(410, 'Your seat hold expired. Please select seats again.');
    }

    const txnId = `MOCK${Date.now()}${crypto.randomInt(100, 999)}`;
    if (body.outcome === 'failure') {
      await query(
        `INSERT INTO payments (booking_id, user_id, amount, method, status, gateway_txn_id) VALUES ($1,$2,$3,$4,'failed',$5)`,
        [b.id, req.user.id, b.totalAmount, body.method, txnId],
      );
      throw new HttpError(402, 'Payment failed (simulated). No money was taken. You can try again.');
    }

    await tx(async (t) => {
      const [row] = await t.query(
        `UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL
          WHERE id = $1 AND status = 'pending_payment' AND hold_expires_at > now() RETURNING id`,
        [b.id],
      );
      if (!row) throw new HttpError(410, 'Your seat hold expired. Please select seats again.');
      await t.query(`UPDATE seats SET status = 'booked', held_until = NULL WHERE booking_id = $1`, [b.id]);
      await t.query(
        `INSERT INTO payments (booking_id, user_id, amount, method, status, gateway_txn_id) VALUES ($1,$2,$3,$4,'success',$5)`,
        [b.id, req.user.id, b.totalAmount, body.method, txnId],
      );
    });

    const confirmed = await bookingDetails(b.id);
    await broadcastSeats(b.scheduleId, b.travelDate);
    sendTicket(confirmed); // fire and forget: email + SMS with QR
    res.json({ ok: true, txnId, booking: confirmed });
  }),
);

// ---------- Release expired seat holds, finish mock refunds ----------
// Long-running server: every 30 s. Serverless (Vercel): piggy-backs on incoming requests.
let lastSweep = 0;
export function sweepHoldsIfDue() {
  if (Date.now() - lastSweep < 30000) return;
  lastSweep = Date.now();
  sweepHolds();
}

export async function sweepHolds() {
  {
    try {
      const released = await query(
        `UPDATE seats SET status = 'available', booking_id = NULL, held_until = NULL
          WHERE status = 'held' AND held_until < now()
          RETURNING schedule_id, travel_date::text AS travel_date`,
      );
      await query(`UPDATE bookings SET status = 'expired' WHERE status = 'pending_payment' AND hold_expires_at < now()`);
      await query(
        `UPDATE bookings SET refund_status = 'processed'
          WHERE refund_status = 'processing' AND refund_initiated_at < now() - interval '2 minutes'`,
      );
      const trips = new Set(released.map((r) => `${r.schedule_id}|${r.travel_date}`));
      for (const key of trips) {
        const [sid, date] = key.split('|');
        await broadcastSeats(sid, date);
      }
    } catch (err) {
      console.error('Hold sweeper failed:', err.message);
    }
  }
}

export function startHoldSweeper() {
  return setInterval(sweepHolds, 30000);
}

export default router;
