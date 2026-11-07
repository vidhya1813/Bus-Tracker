// The Express app, shared by the long-running server (index.js) and Vercel's serverless function (api/index.js).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { getOutbox } from './services/notify.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import bookingRoutes, { paymentsRouter, sweepHoldsIfDue } from './routes/bookings.js';
import driverRoutes from './routes/driver.js';
import adminRoutes from './routes/admin.js';

await initDb();

const app = express();
app.set('trust proxy', 1); // behind Vercel / a reverse proxy: real client IP for rate limits
app.use(helmet());
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  sweepHoldsIfDue();
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, demoMode: config.demoMode, realtime: config.serverless ? 'poll' : 'socket' }));
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentsRouter);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);

// See the emails/SMS that would have been sent (local dev, or the public demo database).
if (config.showDemoCodes) app.get('/api/dev/outbox', (req, res) => res.json(getOutbox()));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'That already exists' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
