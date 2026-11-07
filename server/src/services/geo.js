// Geometry + ETA helpers. Stops are joined by straight segments; each stop
// carries its cumulative road distance (distance_km) used for progress/ETA.

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Project point P onto segment AB in a local flat approximation; returns t in [0,1] and distance (km).
function projectOnSegment(p, a, b) {
  const kx = Math.cos(rad((a.lat + b.lat) / 2)) * 111.32;
  const ky = 110.57;
  const ax = a.lng * kx, ay = a.lat * ky;
  const bx = b.lng * kx, by = b.lat * ky;
  const px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { t, dist: Math.hypot(px - cx, py - cy) };
}

/** How far along the route (km) the bus is, plus how far off the route it is. */
export function routeProgress(stops, lat, lng) {
  if (stops.length < 2) return { progressKm: 0, offRouteKm: 0, segment: 0 };
  let best = { dist: Infinity, progressKm: 0, segment: 0 };
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const { t, dist } = projectOnSegment({ lat, lng }, a, b);
    if (dist < best.dist) {
      best = { dist, progressKm: a.distance_km + t * (b.distance_km - a.distance_km), segment: i };
    }
  }
  return { progressKm: best.progressKm, offRouteKm: best.dist, segment: best.segment };
}

const DEFAULT_KMH = 45;

/** ETA for each stop. Passed stops get `passed: true`. */
export function stopEtas(stops, location, now = new Date()) {
  if (!location) return stops.map((s) => ({ stopId: s.id, passed: false, etaMinutes: null, eta: null }));
  const { progressKm } = routeProgress(stops, location.lat, location.lng);
  const speed = location.speed_kmh && location.speed_kmh > 8 ? Math.min(location.speed_kmh, 90) : DEFAULT_KMH;
  return stops.map((s) => {
    const remaining = s.distance_km - progressKm;
    if (remaining < 0.3) return { stopId: s.id, passed: true, etaMinutes: 0, eta: null };
    const minutes = Math.round((remaining / speed) * 60);
    return {
      stopId: s.id,
      passed: false,
      remainingKm: Math.round(remaining * 10) / 10,
      etaMinutes: minutes,
      eta: new Date(now.getTime() + minutes * 60000).toISOString(),
    };
  });
}
