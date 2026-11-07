import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProd: env.NODE_ENV === 'production',
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret',
  tzOffset: env.TZ_OFFSET || '+05:30',
  databaseUrl: env.DATABASE_URL || '',
  adminIdentifiers: (env.ADMIN_IDENTIFIERS || 'admin@govbus.test')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'GovBus <no-reply@govbus.test>',
  },
  twilio: {
    sid: env.TWILIO_ACCOUNT_SID || '',
    token: env.TWILIO_AUTH_TOKEN || '',
    from: env.TWILIO_FROM || '',
  },
  holdMinutes: 10,
};

// Demo mode: no real database configured -> in-memory Postgres with seed data.
config.demoMode = !config.databaseUrl;
// Running as a Vercel serverless function (no WebSockets, no background timers).
config.serverless = !!env.VERCEL;
// Show one-time codes on screen when no SMS/email service is set up: always in local dev and
// in demo mode; on a real database only if SHOW_DEMO_CODES=true (public demos only!).
config.showDemoCodes = !config.isProd || config.demoMode || env.SHOW_DEMO_CODES === 'true';

if (config.isProd && config.jwtSecret === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
