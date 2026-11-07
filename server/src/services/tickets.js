// E-ticket: signed QR token + email/SMS delivery.
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { one } from '../db/index.js';
import { sendEmail, sendSms } from './notify.js';
import { journeyTimes, BUS_TYPE_LABEL } from './trips.js';

const QR_PREFIX = 'GOVBUS1:';

export function ticketToken(booking) {
  return jwt.sign({ typ: 'ticket', bid: booking.id, pnr: booking.pnr }, config.jwtSecret);
}

/** Returns { bookingId, pnr } for a valid scanned QR payload, else null. */
export function verifyTicketPayload(payload) {
  const raw = String(payload || '').trim();
  if (!raw.startsWith(QR_PREFIX)) return null;
  try {
    const t = jwt.verify(raw.slice(QR_PREFIX.length), config.jwtSecret);
    return t.typ === 'ticket' ? { bookingId: t.bid, pnr: t.pnr } : null;
  } catch {
    return null;
  }
}

export const ticketQrDataUrl = (booking) =>
  QRCode.toDataURL(QR_PREFIX + ticketToken(booking), { margin: 1, width: 320, errorCorrectionLevel: 'M' });

/** Full booking details joined with route, bus and stops. */
export async function bookingDetails(bookingId) {
  const b = await one(
    `SELECT bk.*, bk.travel_date::text AS travel_date,
            s.service_no, s.departure_time::text AS departure_time,
            r.code AS route_code, r.name AS route_name,
            bu.reg_no, bu.bus_type,
            fs.name AS from_name, fs.minutes_from_start AS from_min,
            ts.name AS to_name, ts.minutes_from_start AS to_min
       FROM bookings bk
       JOIN schedules s ON s.id = bk.schedule_id
       JOIN routes r ON r.id = s.route_id
       JOIN buses bu ON bu.id = s.bus_id
       JOIN stops fs ON fs.id = bk.from_stop_id
       JOIN stops ts ON ts.id = bk.to_stop_id
      WHERE bk.id = $1`,
    [bookingId],
  );
  if (!b) return null;
  // Refunds complete automatically ~2 minutes after cancellation (mock gateway).
  if (b.refund_status === 'processing' && Date.now() - new Date(b.refund_initiated_at).getTime() > 120000) {
    b.refund_status = 'processed';
  }
  return {
    id: b.id,
    pnr: b.pnr,
    status: b.status,
    scheduleId: b.schedule_id,
    travelDate: b.travel_date,
    serviceNo: b.service_no,
    routeCode: b.route_code,
    routeName: b.route_name,
    regNo: b.reg_no,
    busType: b.bus_type,
    busTypeLabel: BUS_TYPE_LABEL[b.bus_type],
    from: b.from_name,
    to: b.to_name,
    ...journeyTimes({
      date: b.travel_date,
      departureTime: b.departure_time,
      fromMin: b.from_min,
      toMin: b.to_min,
      busType: b.bus_type,
    }),
    seatNos: b.seat_nos,
    passengers: b.passengers,
    contactEmail: b.contact_email,
    contactPhone: b.contact_phone,
    farePerSeat: b.fare_per_seat,
    totalAmount: b.total_amount,
    holdExpiresAt: b.hold_expires_at,
    refundAmount: b.refund_amount,
    refundStatus: b.refund_status,
    cancelledAt: b.cancelled_at,
    createdAt: b.created_at,
    userId: b.user_id,
  };
}

export async function sendTicket(details) {
  const qr = await ticketQrDataUrl(details);
  const when = `${details.travelDate} ${details.departure.time}`;
  const text = [
    `Your GovBus ticket is confirmed.`,
    `PNR: ${details.pnr}`,
    `${details.from} -> ${details.to}`,
    `Departs: ${when}  Arrives: ${details.arrival.time}${details.arrival.dayOffset ? ' (+1 day)' : ''}`,
    `Bus: ${details.serviceNo} ${details.busTypeLabel} (${details.regNo})`,
    `Seats: ${details.seatNos.join(', ')}`,
    `Paid: Rs ${details.totalAmount}`,
    `Show the QR code in this email to the conductor while boarding.`,
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px">
    <h2 style="color:#0b5cad">GovBus e-Ticket</h2>
    <p><b>PNR:</b> ${details.pnr}<br><b>${details.from} &rarr; ${details.to}</b><br>
    Departs ${when} &middot; Arrives ${details.arrival.time}<br>
    Bus ${details.serviceNo} ${details.busTypeLabel} (${details.regNo})<br>
    Seats: ${details.seatNos.join(', ')}<br>Paid: &#8377;${details.totalAmount}</p>
    <img src="cid:ticketqr" alt="Ticket QR code" width="220" height="220"/>
    <p>Show this QR code to the conductor while boarding.</p></div>`;

  await Promise.allSettled([
    sendEmail({
      to: details.contactEmail,
      subject: `GovBus ticket ${details.pnr}: ${details.from} to ${details.to}`,
      text,
      html,
      attachments: [{ filename: 'ticket-qr.png', path: qr, cid: 'ticketqr' }],
    }),
    sendSms({
      to: details.contactPhone,
      body: `GovBus PNR ${details.pnr}: ${details.from}-${details.to} ${when}, seats ${details.seatNos.join(',')}. Rs ${details.totalAmount} paid.`,
    }),
  ]).then((results) => results.forEach((r) => r.status === 'rejected' && console.error('Ticket delivery failed:', r.reason)));
}
