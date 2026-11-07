// Connecting journeys when there is no direct bus:
// "Take bus A to X, change, take bus B to your destination" (up to 2 changes).
import { query } from '../db/index.js';
import { localInstant, localClock, todayLocal, dayOfWeek } from './time.js';
import { SPEED_FACTOR, BUS_TYPE_LABEL, segmentFare } from './trips.js';

const MIN_CHANGE_MIN = 20; // time to walk to the next bay, have tea
const MAX_CHANGE_MIN = 8 * 60;
const MAX_TOTAL_MIN = 36 * 60;
const MAX_LEGS = 3;

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function loadNetwork() {
  const schedules = await query(
    `SELECT s.id, s.service_no, s.departure_time::text AS dep, s.days,
            r.id AS route_id, r.name AS route_name, b.reg_no, b.bus_type, b.total_seats, f.amount AS route_fare
       FROM schedules s
       JOIN routes r ON r.id = s.route_id AND r.active
       JOIN buses b ON b.id = s.bus_id AND b.active
       LEFT JOIN fares f ON f.route_id = r.id AND f.bus_type = b.bus_type
      WHERE s.active`,
  );
  const stops = await query(
    `SELECT id, route_id, seq, name, distance_km, minutes_from_start FROM stops ORDER BY route_id, seq`,
  );
  const byRoute = new Map();
  for (const s of stops) {
    if (!byRoute.has(s.route_id)) byRoute.set(s.route_id, []);
    byRoute.get(s.route_id).push(s);
  }
  // Interchange points: places served by 2+ routes.
  const routesAtPlace = new Map();
  for (const s of stops) {
    if (!routesAtPlace.has(s.name)) routesAtPlace.set(s.name, new Set());
    routesAtPlace.get(s.name).add(s.route_id);
  }
  const hubs = new Set([...routesAtPlace].filter(([, r]) => r.size > 1).map(([n]) => n));
  return {
    hubs,
    schedules: schedules.map((s) => {
      const st = byRoute.get(s.route_id) || [];
      return { ...s, stops: st, totalKm: st[st.length - 1]?.distance_km || 0 };
    }),
  };
}

const at = (sch, originDate, stopIdx) =>
  localInstant(originDate, sch.dep, Math.round(sch.stops[stopIdx].minutes_from_start * (SPEED_FACTOR[sch.bus_type] || 1)));

/** Every bus leaving `place` between winStart and winEnd. */
function departuresFrom(net, place, winStart, winEnd) {
  const out = [];
  const firstDate = todayLocal(winStart);
  for (const sch of net.schedules) {
    const idx = sch.stops.findIndex((s) => s.name === place);
    if (idx < 0 || idx === sch.stops.length - 1) continue;
    // A bus can pass this stop on the day after it left its origin.
    for (const originDate of [addDays(firstDate, -1), firstDate, addDays(firstDate, 1)]) {
      if (!sch.days.includes(String(dayOfWeek(originDate)))) continue;
      const dep = at(sch, originDate, idx);
      if (dep >= winStart && dep <= winEnd) out.push({ sch, originDate, fromIdx: idx, dep });
    }
  }
  return out;
}

function makeLeg({ sch, originDate, fromIdx, dep }, toIdx, arr) {
  const a = sch.stops[fromIdx];
  const b = sch.stops[toIdx];
  return {
    scheduleId: sch.id,
    routeId: sch.route_id,
    travelDate: originDate,
    serviceNo: sch.service_no,
    routeName: sch.route_name,
    regNo: sch.reg_no,
    busType: sch.bus_type,
    busTypeLabel: BUS_TYPE_LABEL[sch.bus_type],
    fromStopId: a.id,
    toStopId: b.id,
    from: a.name,
    to: b.name,
    departureAt: dep.toISOString(),
    arrivalAt: arr.toISOString(),
    departure: localClock(dep, todayLocal(dep)),
    arrival: localClock(arr, todayLocal(dep)),
    departureDate: todayLocal(dep),
    durationMinutes: Math.round((arr - dep) / 60000),
    distanceKm: Math.round(b.distance_km - a.distance_km),
    fare: segmentFare({ routeFare: sch.route_fare, totalKm: sch.totalKm, fromKm: a.distance_km, toKm: b.distance_km, busType: sch.bus_type }),
    totalSeats: sch.total_seats,
  };
}

/** Itineraries with 1–2 changes from `from` to `to`, leaving on `date` (local). */
export async function findConnections({ from, to, date, limit = 6 }) {
  const net = await loadNetwork();
  const dayStart = localInstant(date, '00:00');
  const dayEnd = localInstant(date, '23:59');
  const now = new Date();
  const start = now > dayStart ? now : dayStart;
  if (start > dayEnd) return [];

  const found = [];
  const explore = (place, winStart, winEnd, legs, visited, usedRoutes) => {
    for (const d of departuresFrom(net, place, winStart, winEnd)) {
      if (usedRoutes.has(d.sch.route_id)) continue;
      for (let j = d.fromIdx + 1; j < d.sch.stops.length; j++) {
        const stop = d.sch.stops[j];
        if (visited.has(stop.name)) break; // would go back through a place we've already been
        const arr = at(d.sch, d.originDate, j);
        const total = (arr - (legs[0] ? new Date(legs[0].departureAt) : d.dep)) / 60000;
        if (total > MAX_TOTAL_MIN) break;
        if (stop.name === to) {
          if (legs.length > 0) found.push([...legs, makeLeg(d, j, arr)]);
          break;
        }
        if (net.hubs.has(stop.name) && legs.length + 1 < MAX_LEGS) {
          explore(
            stop.name,
            new Date(arr.getTime() + MIN_CHANGE_MIN * 60000),
            new Date(arr.getTime() + MAX_CHANGE_MIN * 60000),
            [...legs, makeLeg(d, j, arr)],
            new Set([...visited, stop.name]),
            new Set([...usedRoutes, d.sch.route_id]),
          );
        }
      }
    }
  };
  explore(from, start, dayEnd, [], new Set([from]), new Set());

  // Best first: shortest door-to-door time, where each change "costs" 45 minutes, then earlier arrival, then cheaper.
  const minutes = (it) => (new Date(it[it.length - 1].arrivalAt) - new Date(it[0].departureAt)) / 60000;
  const score = (it) => [
    Math.round(minutes(it) + 45 * (it.length - 1)),
    new Date(it[it.length - 1].arrivalAt).getTime(),
    it.reduce((s, l) => s + l.fare, 0),
  ];
  found.sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return 0;
  });

  // Keep variety: no two options with the same first bus and the same change points.
  const seen = new Set();
  const picked = [];
  const bestScore = found.length ? score(found[0])[0] : 0;
  for (const it of found) {
    if (score(it)[0] > bestScore * 1.8 + 60) break; // far worse than the best: don't suggest it
    const key = `${it[0].scheduleId}|${it.map((l) => l.to).join('>')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= limit) break;
  }

  // Seats left per leg (whole-trip inventory).
  for (const it of picked) {
    for (const leg of it) {
      const [{ taken }] = await query(
        `SELECT count(*)::int AS taken FROM seats WHERE schedule_id = $1 AND travel_date = $2
           AND (status = 'booked' OR (status = 'held' AND held_until > now()))`,
        [leg.scheduleId, leg.travelDate],
      );
      leg.seatsLeft = leg.totalSeats - taken;
    }
  }

  const options = picked.map((legs) => {
    const first = legs[0];
    const last = legs[legs.length - 1];
    return {
      tags: [],
      legs,
      changes: legs.slice(1).map((l, i) => ({
        at: l.from,
        waitMinutes: Math.round((new Date(l.departureAt) - new Date(legs[i].arrivalAt)) / 60000),
      })),
      totalFare: legs.reduce((s, l) => s + l.fare, 0),
      departureAt: first.departureAt,
      arrivalAt: last.arrivalAt,
      departure: first.departure,
      arrival: localClock(new Date(last.arrivalAt), date),
      totalMinutes: Math.round((new Date(last.arrivalAt) - new Date(first.departureAt)) / 60000),
    };
  });

  // Badges: fastest, cheapest, earliest arrival, fewest changes.
  const tag = (label, pick) => {
    if (!options.length) return;
    const best = options.reduce((a, b) => (pick(b) < pick(a) ? b : a));
    best.tags.push(label);
  };
  tag('fastest', (o) => o.totalMinutes);
  tag('cheapest', (o) => o.totalFare);
  tag('earliest', (o) => new Date(o.arrivalAt).getTime());
  tag('fewestChanges', (o) => o.legs.length * 1e6 + o.totalMinutes);
  return options;
}

/** Departure board: every bus leaving a place on a local date. */
export async function departuresBoard(place, date) {
  const net = await loadNetwork();
  const list = departuresFrom(net, place, localInstant(date, '00:00'), localInstant(date, '23:59'));
  const now = Date.now();
  return list
    .sort((a, b) => a.dep - b.dep)
    .map((d) => {
      const last = d.sch.stops.length - 1;
      const leg = makeLeg(d, last, at(d.sch, d.originDate, last));
      return { ...leg, towards: d.sch.stops[last].name, via: d.sch.stops.slice(d.fromIdx + 1, last).map((s) => s.name), departed: d.dep.getTime() < now };
    });
}
