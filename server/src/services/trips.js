// Fares, journey timings and seat layouts for a trip (schedule + travel date).
import { query, one } from '../db/index.js';
import { localInstant, localClock } from './time.js';

// Ordinary buses stop more often, so they take a little longer.
export const SPEED_FACTOR = { ordinary: 1.15, express: 1, ac: 1, sleeper: 1.05 };
const FALLBACK_RATE_PER_KM = { ordinary: 0.75, express: 0.95, ac: 1.45, sleeper: 1.8 };
export const BUS_TYPE_LABEL = { ordinary: 'Ordinary', express: 'Express', ac: 'AC Seater', sleeper: 'AC Sleeper' };

export function segmentFare({ routeFare, totalKm, fromKm, toKm, busType }) {
  const seg = Math.max(0, toKm - fromKm);
  const raw = routeFare && totalKm ? (routeFare * seg) / totalKm : seg * FALLBACK_RATE_PER_KM[busType];
  return Math.max(10, Math.round(raw));
}

/** Departure/arrival instants for boarding at `fromMin` and leaving at `toMin` (minutes after origin). */
export function journeyTimes({ date, departureTime, fromMin, toMin, busType }) {
  const f = SPEED_FACTOR[busType] || 1;
  const dep = localInstant(date, departureTime, Math.round(fromMin * f));
  const arr = localInstant(date, departureTime, Math.round(toMin * f));
  return {
    departureAt: dep.toISOString(),
    arrivalAt: arr.toISOString(),
    departure: localClock(dep, date),
    arrival: localClock(arr, date),
    durationMinutes: Math.round((arr - dep) / 60000),
  };
}

/** Seat grid for a layout. Column gaps (aisle) are left out of col_no on purpose. */
export function generateSeatLayout(layout, totalSeats) {
  const seats = [];
  if (layout === '1x2') {
    // Sleeper: lower + upper deck, 1 berth | aisle | 2 berths
    const perDeck = Math.ceil(totalSeats / 2);
    const cols = [0, 2, 3];
    for (const deck of ['L', 'U']) {
      for (let i = 0; i < perDeck && seats.length < totalSeats; i++) {
        seats.push({ seat_no: `${deck}${i + 1}`, deck, row_no: Math.floor(i / 3), col_no: cols[i % 3] });
      }
    }
    return seats;
  }
  const cols = layout === '2x3' ? [0, 1, 3, 4, 5] : [0, 1, 3, 4];
  for (let i = 0; i < totalSeats; i++) {
    seats.push({ seat_no: String(i + 1), deck: null, row_no: Math.floor(i / cols.length), col_no: cols[i % cols.length] });
  }
  return seats;
}

/** Load schedule + route + bus for a trip. */
export async function getTrip(scheduleId) {
  return one(
    `SELECT s.id, s.service_no, s.departure_time::text AS departure_time, s.days, s.active,
            r.id AS route_id, r.code AS route_code, r.name AS route_name,
            b.id AS bus_id, b.reg_no, b.bus_type, b.layout, b.total_seats
       FROM schedules s JOIN routes r ON r.id = s.route_id JOIN buses b ON b.id = s.bus_id
      WHERE s.id = $1`,
    [scheduleId],
  );
}

export async function getRouteStops(routeId) {
  return query(
    `SELECT id, seq, name, lat, lng, distance_km, minutes_from_start FROM stops WHERE route_id = $1 ORDER BY seq`,
    [routeId],
  );
}

/** Create the seat inventory for a trip the first time anyone looks at it. */
export async function ensureSeats(db, trip, travelDate) {
  const [{ n }] = await db.query(
    'SELECT count(*)::int AS n FROM seats WHERE schedule_id = $1 AND travel_date = $2',
    [trip.id, travelDate],
  );
  if (n > 0) return;
  const layout = generateSeatLayout(trip.layout, trip.total_seats);
  const values = [];
  const params = [];
  layout.forEach((s, i) => {
    const o = i * 6;
    values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`);
    params.push(trip.id, travelDate, s.seat_no, s.deck, s.row_no, s.col_no);
  });
  await db.query(
    `INSERT INTO seats (schedule_id, travel_date, seat_no, deck, row_no, col_no) VALUES ${values.join(',')}
     ON CONFLICT (schedule_id, travel_date, seat_no) DO NOTHING`,
    params,
  );
}

/** Public seat view: expired holds count as available. */
export async function listSeats(scheduleId, travelDate) {
  return query(
    `SELECT seat_no, deck, row_no, col_no, boarded,
            CASE WHEN status = 'held' AND held_until < now() THEN 'available' ELSE status END AS status
       FROM seats WHERE schedule_id = $1 AND travel_date = $2
      ORDER BY deck NULLS FIRST, row_no, col_no`,
    [scheduleId, travelDate],
  );
}
