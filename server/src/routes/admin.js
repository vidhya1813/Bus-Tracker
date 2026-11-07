// Admin: routes (with stops), buses, schedules, fares and driver accounts.
import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db/index.js';
import { ah, HttpError, requireAuth } from '../middleware/auth.js';
import { haversineKm } from '../services/geo.js';

const router = Router();
router.use(requireAuth('admin'));

const busType = z.enum(['ordinary', 'express', 'ac', 'sleeper']);
const del = (table) =>
  ah(async (req, res) => {
    try {
      const rows = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
      if (!rows.length) throw new HttpError(404, 'Not found');
    } catch (err) {
      if (err.code === '23503') throw new HttpError(409, 'In use by existing bookings. Deactivate it instead.');
      throw err;
    }
    res.json({ ok: true });
  });

// ----- Routes + stops -----
router.get(
  '/routes',
  ah(async (req, res) => {
    const routes = await query('SELECT * FROM routes ORDER BY code');
    const stops = await query('SELECT * FROM stops ORDER BY route_id, seq');
    res.json(routes.map((r) => ({ ...r, stops: stops.filter((s) => s.route_id === r.id) })));
  }),
);

router.post(
  '/routes',
  ah(async (req, res) => {
    const body = z
      .object({
        code: z.string().trim().min(1).max(10),
        name: z.string().trim().min(3).max(80),
        avgSpeedKmh: z.number().min(10).max(100).default(56),
        stops: z
          .array(
            z.object({
              name: z.string().trim().min(2).max(60),
              lat: z.coerce.number().min(-90).max(90),
              lng: z.coerce.number().min(-180).max(180),
            }),
          )
          .min(2, 'A route needs at least 2 stops'),
      })
      .parse(req.body);

    const route = await tx(async (t) => {
      const [r] = await t.query('INSERT INTO routes (code, name) VALUES ($1,$2) RETURNING *', [body.code, body.name]);
      let km = 0;
      let min = 0;
      for (let i = 0; i < body.stops.length; i++) {
        const s = body.stops[i];
        if (i > 0) {
          const p = body.stops[i - 1];
          const seg = haversineKm(p.lat, p.lng, s.lat, s.lng) * 1.12;
          km += seg;
          min += Math.round((seg / body.avgSpeedKmh) * 60) + 5;
        }
        await t.query(
          'INSERT INTO stops (route_id, seq, name, lat, lng, distance_km, minutes_from_start) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [r.id, i + 1, s.name, s.lat, s.lng, Math.round(km * 10) / 10, min],
        );
      }
      return r;
    });
    res.status(201).json(route);
  }),
);

router.patch(
  '/routes/:id',
  ah(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    res.json(await one('UPDATE routes SET active = $2 WHERE id = $1 RETURNING *', [req.params.id, active]));
  }),
);
router.delete('/routes/:id', del('routes'));

// ----- Buses -----
router.get('/buses', ah(async (req, res) => res.json(await query('SELECT * FROM buses ORDER BY reg_no'))));

router.post(
  '/buses',
  ah(async (req, res) => {
    const body = z
      .object({
        regNo: z.string().trim().toUpperCase().min(4).max(20),
        busType,
        layout: z.enum(['2x2', '2x3', '1x2']),
        totalSeats: z.coerce.number().int().min(1).max(80),
        depot: z.string().trim().max(60).optional(),
      })
      .parse(req.body);
    res.status(201).json(
      await one('INSERT INTO buses (reg_no, bus_type, layout, total_seats, depot) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
        body.regNo,
        body.busType,
        body.layout,
        body.totalSeats,
        body.depot || null,
      ]),
    );
  }),
);
router.patch(
  '/buses/:id',
  ah(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    res.json(await one('UPDATE buses SET active = $2 WHERE id = $1 RETURNING *', [req.params.id, active]));
  }),
);
router.delete('/buses/:id', del('buses'));

// ----- Schedules -----
router.get(
  '/schedules',
  ah(async (req, res) =>
    res.json(
      await query(
        `SELECT s.*, s.departure_time::text AS departure_time, r.code AS route_code, r.name AS route_name, b.reg_no, b.bus_type
           FROM schedules s JOIN routes r ON r.id = s.route_id JOIN buses b ON b.id = s.bus_id
          ORDER BY r.code, s.departure_time`,
      ),
    ),
  ),
);

router.post(
  '/schedules',
  ah(async (req, res) => {
    const body = z
      .object({
        serviceNo: z.string().trim().max(12).optional(),
        routeId: z.string().uuid(),
        busId: z.string().uuid(),
        departureTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
        days: z.string().regex(/^[0-6]{1,7}$/).default('0123456'),
      })
      .parse(req.body);
    res.status(201).json(
      await one(
        'INSERT INTO schedules (service_no, route_id, bus_id, departure_time, days) VALUES ($1,$2,$3,$4,$5) RETURNING *, departure_time::text AS departure_time',
        [body.serviceNo || null, body.routeId, body.busId, body.departureTime, body.days],
      ),
    );
  }),
);
router.patch(
  '/schedules/:id',
  ah(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    res.json(await one('UPDATE schedules SET active = $2 WHERE id = $1 RETURNING id, active', [req.params.id, active]));
  }),
);
router.delete('/schedules/:id', del('schedules'));

// ----- Fares -----
router.get(
  '/fares',
  ah(async (req, res) =>
    res.json(
      await query(
        `SELECT f.*, r.code AS route_code, r.name AS route_name FROM fares f JOIN routes r ON r.id = f.route_id ORDER BY r.code, f.amount`,
      ),
    ),
  ),
);
router.post(
  '/fares',
  ah(async (req, res) => {
    const body = z.object({ routeId: z.string().uuid(), busType, amount: z.coerce.number().int().min(1).max(100000) }).parse(req.body);
    res.status(201).json(
      await one(
        `INSERT INTO fares (route_id, bus_type, amount) VALUES ($1,$2,$3)
         ON CONFLICT (route_id, bus_type) DO UPDATE SET amount = EXCLUDED.amount RETURNING *`,
        [body.routeId, body.busType, body.amount],
      ),
    );
  }),
);
router.delete('/fares/:id', del('fares'));

// ----- Drivers (pre-registered so they can log in on the driver portal) -----
router.get(
  '/drivers',
  ah(async (req, res) =>
    res.json(
      await query(
        `SELECT u.id, u.name, u.email, u.phone, u.assigned_bus_id, u.last_login_at, b.reg_no
           FROM users u LEFT JOIN buses b ON b.id = u.assigned_bus_id
          WHERE u.role = 'driver' ORDER BY u.name`,
      ),
    ),
  ),
);
router.post(
  '/drivers',
  ah(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
        phone: z.string().trim().optional().or(z.literal('')),
        assignedBusId: z.string().uuid().optional().or(z.literal('')),
      })
      .parse(req.body);
    let phone = (body.phone || '').replace(/[^\d+]/g, '');
    if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
    if (!body.email && !phone) throw new HttpError(400, 'Enter an email or phone for the driver');
    const existing = await one('SELECT id, role FROM users WHERE email = $1 OR phone = $2', [body.email || null, phone || null]);
    if (existing?.role === 'admin') throw new HttpError(409, 'That account is an admin');
    const row = existing
      ? await one(
          `UPDATE users SET role = 'driver', name = $2, email = COALESCE($3, email), phone = COALESCE($4, phone), assigned_bus_id = $5
            WHERE id = $1 RETURNING id`,
          [existing.id, body.name, body.email || null, phone || null, body.assignedBusId || null],
        )
      : await one(`INSERT INTO users (name, email, phone, role, assigned_bus_id) VALUES ($1,$2,$3,'driver',$4) RETURNING id`, [
          body.name,
          body.email || null,
          phone || null,
          body.assignedBusId || null,
        ]);
    res.status(201).json(row);
  }),
);
router.delete(
  '/drivers/:id',
  ah(async (req, res) => {
    // Revoke driver access (keeps the account and its history as a passenger).
    await query(`UPDATE users SET role = 'passenger', assigned_bus_id = NULL WHERE id = $1 AND role = 'driver'`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ----- Overview -----
router.get(
  '/stats',
  ah(async (req, res) => {
    res.json(
      await one(`SELECT
        (SELECT count(*)::int FROM routes) AS routes,
        (SELECT count(*)::int FROM buses) AS buses,
        (SELECT count(*)::int FROM schedules) AS schedules,
        (SELECT count(*)::int FROM bookings WHERE status = 'confirmed') AS confirmed_bookings,
        ((SELECT COALESCE(sum(amount),0) FROM payments WHERE status = 'success')
          - (SELECT COALESCE(sum(refund_amount),0) FROM bookings WHERE status = 'cancelled'))::int AS revenue`),
    );
  }),
);

export default router;
