// Sample data: eight corridors across Tamil Nadu (hills, coast, delta, temple towns),
// both directions, one bus per listed type. Runs only when the routes table is empty.
import { haversineKm } from '../services/geo.js';
import { hashPassword } from '../services/passwords.js';

const CORRIDORS = [
  {
    code: '101',
    stops: [
      ['Chennai', 13.0694, 80.1948],
      ['Chengalpattu', 12.6921, 79.9766],
      ['Tindivanam', 12.234, 79.655],
      ['Villupuram', 11.9401, 79.4861],
      ['Ulundurpet', 11.689, 79.29],
      ['Perambalur', 11.234, 78.88],
      ['Tiruchirappalli', 10.805, 78.6856],
      ['Melur', 10.032, 78.338],
      ['Madurai', 9.945, 78.153],
    ],
    fares: { ordinary: 330, express: 420, ac: 650, sleeper: 820 },
    times: { ordinary: '06:00', express: '08:30', ac: '21:00', sleeper: '22:30' },
  },
  {
    code: '201',
    stops: [
      ['Chennai', 13.0694, 80.1948],
      ['Vellore', 12.9165, 79.1325],
      ['Krishnagiri', 12.5186, 78.2137],
      ['Dharmapuri', 12.1211, 78.1582],
      ['Salem', 11.6643, 78.146],
      ['Erode', 11.341, 77.7172],
      ['Tiruppur', 11.1085, 77.3411],
      ['Coimbatore', 11.0168, 76.9558],
    ],
    fares: { ordinary: 360, express: 450, ac: 700, sleeper: 880 },
    times: { ordinary: '05:30', express: '09:00', ac: '20:30', sleeper: '22:00' },
  },
  {
    code: '301',
    stops: [
      ['Madurai', 9.945, 78.153],
      ['Dindigul', 10.3673, 77.9803],
      ['Palani', 10.45, 77.52],
      ['Pollachi', 10.658, 77.008],
      ['Coimbatore', 11.0168, 76.9558],
    ],
    fares: { ordinary: 180, express: 230, ac: 360, sleeper: 450 },
    times: { ordinary: '07:00', express: '10:30', ac: '15:00', sleeper: '23:00' },
  },
  {
    code: '401', // Down south to the land's end
    stops: [
      ['Madurai', 9.945, 78.153],
      ['Virudhunagar', 9.585, 77.9579],
      ['Tirunelveli', 8.7139, 77.7567],
      ['Nagercoil', 8.1833, 77.4119],
      ['Kanyakumari', 8.0883, 77.5385],
    ],
    fares: { ordinary: 190, express: 240, ac: 380, sleeper: 460 },
    times: { ordinary: '06:30', express: '09:00', ac: '14:00', sleeper: '22:45' },
  },
  {
    code: '501', // Kaveri delta
    stops: [
      ['Tiruchirappalli', 10.805, 78.6856],
      ['Thanjavur', 10.787, 79.1378],
      ['Tiruvarur', 10.7726, 79.6368],
      ['Nagapattinam', 10.7672, 79.8449],
      ['Velankanni', 10.6806, 79.8508],
    ],
    fares: { ordinary: 110, express: 140, ac: 220 },
    times: { ordinary: '07:00', express: '11:30', ac: '16:00' },
  },
  {
    code: '601', // East Coast Road
    stops: [
      ['Chennai', 13.0694, 80.1948],
      ['Mamallapuram', 12.6208, 80.1945],
      ['Marakkanam', 12.1928, 79.944],
      ['Puducherry', 11.9416, 79.8083],
    ],
    fares: { ordinary: 150, express: 190, ac: 300 },
    times: { ordinary: '06:15', express: '08:00', ac: '13:30' },
  },
  {
    code: '701', // To the island temple town
    stops: [
      ['Madurai', 9.945, 78.153],
      ['Paramakudi', 9.5446, 78.5907],
      ['Ramanathapuram', 9.3639, 78.8395],
      ['Mandapam', 9.277, 79.125],
      ['Rameswaram', 9.2881, 79.3129],
    ],
    fares: { ordinary: 160, express: 200, ac: 320 },
    times: { ordinary: '05:45', express: '10:00', ac: '15:30' },
  },
  {
    code: '801', // Nilgiri ghat road
    stops: [
      ['Coimbatore', 11.0168, 76.9558],
      ['Mettupalayam', 11.299, 76.9346],
      ['Coonoor', 11.353, 76.7959],
      ['Ooty', 11.4102, 76.695],
    ],
    fares: { ordinary: 70, express: 95, ac: 160 },
    times: { ordinary: '06:00', express: '09:30', ac: '13:00' },
    avgKmh: 30, // hairpin bends
  },
];

const BUS_SPECS = {
  ordinary: { layout: '2x3', total_seats: 45 },
  express: { layout: '2x2', total_seats: 40 },
  ac: { layout: '2x2', total_seats: 36 },
  sleeper: { layout: '1x2', total_seats: 30 },
};

const ROAD_FACTOR = 1.12; // straight line -> road distance
const AVG_KMH = 56;
const DWELL_MIN = 5;

function buildStops(raw, avgKmh = AVG_KMH) {
  let km = 0;
  let minutes = 0;
  return raw.map(([name, lat, lng], i) => {
    if (i > 0) {
      const [, plat, plng] = raw[i - 1];
      const seg = haversineKm(plat, plng, lat, lng) * ROAD_FACTOR;
      km += seg;
      minutes += Math.round((seg / avgKmh) * 60) + DWELL_MIN;
    }
    return { seq: i + 1, name, lat, lng, distance_km: Math.round(km * 10) / 10, minutes_from_start: minutes };
  });
}

// Demo-mode only (in-memory DB): let the sample staff accounts use password login too.
// Never applied to a real database by `npm run db:setup`.
export const DEMO_PASSWORDS = {
  'admin@govbus.test': 'Admin@2026',
  'driver@govbus.test': 'Driver@2026',
  'passenger@govbus.test': 'Passenger@2026',
};

export async function seed({ query, tx, demo = false }) {
  const [{ n }] = await query('SELECT count(*)::int AS n FROM routes');
  if (n > 0) return false;

  await tx(async (t) => {
    let busCounter = 1001;
    for (const c of CORRIDORS) {
      for (const reverse of [false, true]) {
        const rawStops = reverse ? [...c.stops].reverse() : c.stops;
        const code = reverse ? String(Number(c.code) + 1) : c.code;
        const name = `${rawStops[0][0]} - ${rawStops[rawStops.length - 1][0]}`;
        const [route] = await t.query(
          `INSERT INTO routes (id, code, name) VALUES (md5('route:' || $1)::uuid, $1, $2) RETURNING id`,
          [code, name],
        );

        for (const s of buildStops(rawStops, c.avgKmh)) {
          await t.query(
            `INSERT INTO stops (id, route_id, seq, name, lat, lng, distance_km, minutes_from_start)
             VALUES (md5($8)::uuid, $1,$2,$3,$4,$5,$6,$7)`,
            [route.id, s.seq, s.name, s.lat, s.lng, s.distance_km, s.minutes_from_start, `stop:${code}:${s.seq}`],
          );
        }

        for (const [busType, amount] of Object.entries(c.fares)) {
          await t.query('INSERT INTO fares (route_id, bus_type, amount) VALUES ($1,$2,$3)', [route.id, busType, amount]);
          const spec = BUS_SPECS[busType];
          const regNo = `TN 01 N ${busCounter++}`;
          const [bus] = await t.query(
            `INSERT INTO buses (id, reg_no, bus_type, layout, total_seats, depot)
             VALUES (md5('bus:' || $1)::uuid, $1,$2,$3,$4,$5) RETURNING id`,
            [regNo, busType, spec.layout, spec.total_seats, rawStops[0][0]],
          );
          // Return trips leave a little later in the day.
          const [h, m] = c.times[busType].split(':').map(Number);
          const dep = reverse ? `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` : c.times[busType];
          const serviceNo = `${code}${busType[0].toUpperCase()}`;
          // Stable ids so demo links keep working after a server restart.
          await t.query(
            `INSERT INTO schedules (id, service_no, route_id, bus_id, departure_time) VALUES (md5('schedule:' || $1)::uuid, $1,$2,$3,$4)`,
            [serviceNo, route.id, bus.id, dep],
          );
        }
      }
    }

    // Demo accounts (log in with OTP; in demo mode the code is shown on screen).
    await t.query(`INSERT INTO users (name, email, role) VALUES ('Admin', 'admin@govbus.test', 'admin')`);
    await t.query(
      `INSERT INTO users (name, email, phone, role) VALUES ('Murugan (Driver)', 'driver@govbus.test', '+919000000001', 'driver')`,
    );
    if (demo) {
      await t.query(
        `INSERT INTO users (name, email, phone, role) VALUES ('Kavya (Passenger)', 'passenger@govbus.test', '+919000000002', 'passenger')`,
      );
      for (const [email, pw] of Object.entries(DEMO_PASSWORDS)) {
        await t.query('UPDATE users SET password_hash = $2 WHERE email = $1', [email, await hashPassword(pw)]);
      }
    }
  });
  return true;
}
