// Login / sign-up with email or mobile + password, email or phone OTP, and Google Sign-In.
// Two portals share these endpoints:
//   portal = "passenger": new users are created automatically as passengers.
//   portal = "driver":    the email/phone must already be registered as a driver by an admin.
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one } from '../db/index.js';
import { ah, HttpError, requireAuth, signSession } from '../middleware/auth.js';
import { sendEmail, sendSms, canDeliver } from '../services/notify.js';
import { hashPassword, verifyPassword, passwordProblem, DUMMY_HASH } from '../services/passwords.js';
import { DEMO_PASSWORDS } from '../db/seed.js';

const router = Router();
const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_15_MIN = 5;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

const portalSchema = z.enum(['passenger', 'driver']).default('passenger');

/** Normalise to lowercase email or E.164-ish phone (defaults to India +91 for 10 digits). */
function normalise(channel, raw) {
  const v = String(raw || '').trim();
  if (channel === 'email') {
    const email = v.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
    return email;
  }
  let digits = v.replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(digits)) digits = `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) digits = `+${digits}`;
  if (!/^\+\d{10,15}$/.test(digits)) throw new HttpError(400, 'Enter a valid mobile number');
  return digits;
}

const hashCode = (identifier, code) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`${identifier}:${code}`).digest('hex');

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

async function findUser(channel, identifier) {
  return one(`SELECT * FROM users WHERE ${channel === 'email' ? 'email' : 'phone'} = $1`, [identifier]);
}

/** Apply portal rules, create passengers on first login, promote configured admins. */
async function resolveLogin({ channel, identifier, portal, name, googleSub }) {
  let user = googleSub ? await one('SELECT * FROM users WHERE google_sub = $1', [googleSub]) : null;
  user ||= await findUser(channel, identifier);

  if (portal === 'driver') {
    if (!user || !['driver', 'admin'].includes(user.role)) {
      throw new HttpError(403, 'This account is not registered as a driver/conductor. Please contact your depot admin.');
    }
  }
  if (!user) {
    const col = channel === 'email' ? 'email' : 'phone';
    user = await one(`INSERT INTO users (${col}, name, google_sub) VALUES ($1, $2, $3) RETURNING *`, [
      identifier,
      name || null,
      googleSub || null,
    ]);
  }
  const promote = config.adminIdentifiers.includes(identifier) && user.role !== 'admin';
  user = await one(
    `UPDATE users SET last_login_at = now(),
            google_sub = COALESCE(google_sub, $2),
            name = COALESCE(name, $3),
            role = CASE WHEN $4 THEN 'admin' ELSE role END
      WHERE id = $1 RETURNING *`,
    [user.id, googleSub || null, name || null, promote],
  );
  return { token: signSession(user), user: publicUser(user) };
}

router.get('/config', (req, res) => {
  res.json({ googleClientId: config.googleClientId, demoMode: config.demoMode, googleDemo: !google && config.showDemoCodes });
});

/** Check a 6-digit code for this identifier and mark it used. Throws on failure. */
async function consumeOtp(identifier, code) {
  if (!/^\d{6}$/.test(String(code || ''))) throw new HttpError(400, 'Enter the 6-digit code');
  const otp = await one(`SELECT * FROM otp_codes WHERE identifier = $1 AND NOT used ORDER BY created_at DESC LIMIT 1`, [identifier]);
  if (!otp || new Date(otp.expires_at) < new Date()) throw new HttpError(400, 'Code expired. Please request a new one.');
  if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong attempts. Please request a new code.');
  const ok = crypto.timingSafeEqual(Buffer.from(otp.code_hash), Buffer.from(hashCode(identifier, code)));
  if (!ok) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw new HttpError(400, 'Wrong code. Please try again.');
  }
  await query('UPDATE otp_codes SET used = true WHERE id = $1', [otp.id]);
}

const NOT_DRIVER = 'This account is not registered as a driver/conductor. Please contact your depot admin.';

router.post(
  '/otp/send',
  ah(async (req, res) => {
    const body = z
      .object({
        channel: z.enum(['email', 'phone']),
        identifier: z.string(),
        portal: portalSchema,
        purpose: z.enum(['login', 'register', 'reset']).default('login'),
      })
      .parse(req.body);
    const identifier = normalise(body.channel, body.identifier);
    const existing = await findUser(body.channel, identifier);

    if (body.portal === 'driver' && (!existing || !['driver', 'admin'].includes(existing.role))) {
      throw new HttpError(403, NOT_DRIVER);
    }
    if (body.purpose === 'register' && existing?.password_hash) {
      throw new HttpError(409, 'An account with a password already exists. Please log in, or use "Forgot password".');
    }
    // Password reset: don't reveal whether an account exists; just don't send anything.
    if (body.purpose === 'reset' && !existing) {
      return res.json({ ok: true, identifier });
    }

    const [{ n }] = await query(
      `SELECT count(*)::int AS n FROM otp_codes WHERE identifier = $1 AND created_at > now() - interval '15 minutes'`,
      [identifier],
    );
    if (n >= MAX_SENDS_PER_15_MIN) throw new HttpError(429, 'Too many codes requested. Please wait 15 minutes.');

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await query(`UPDATE otp_codes SET used = true WHERE identifier = $1 AND NOT used`, [identifier]);
    await query(
      `INSERT INTO otp_codes (identifier, code_hash, expires_at) VALUES ($1, $2, now() + interval '${OTP_TTL_MIN} minutes')`,
      [identifier, hashCode(identifier, code)],
    );

    const what = { login: 'login', register: 'sign-up verification', reset: 'password reset' }[body.purpose];
    const message = `Your GovBus ${what} code is ${code}. It expires in ${OTP_TTL_MIN} minutes. Do not share it with anyone.`;
    if (body.channel === 'email') await sendEmail({ to: identifier, subject: `Your GovBus ${what} code`, text: message });
    else await sendSms({ to: identifier, body: message });

    // Without SMTP/Twilio (local demo) return the code so the UI can show it.
    const devCode = config.showDemoCodes && !canDeliver(body.channel) ? code : undefined;
    res.json({ ok: true, identifier, devCode });
  }),
);

router.post(
  '/otp/verify',
  ah(async (req, res) => {
    const body = z
      .object({
        channel: z.enum(['email', 'phone']),
        identifier: z.string(),
        code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
        portal: portalSchema,
        name: z.string().trim().max(80).optional(),
      })
      .parse(req.body);
    const identifier = normalise(body.channel, body.identifier);
    await consumeOtp(identifier, body.code);
    res.json(await resolveLogin({ channel: body.channel, identifier, portal: body.portal, name: body.name }));
  }),
);

// ---------- Email / mobile + password ----------
const MAX_FAILED = 5;
const LOCK_MIN = 15;
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const channelOf = (identifier) => (String(identifier).includes('@') ? 'email' : 'phone');
const checkPassword = (pw) => {
  const problem = passwordProblem(pw);
  if (problem) throw new HttpError(400, problem);
};

// Sign up: prove you own the email/mobile with an OTP, then set a password.
// Also lets an existing OTP/Google-only account add a password.
router.post(
  '/password/register',
  ah(async (req, res) => {
    const body = z
      .object({
        channel: z.enum(['email', 'phone']),
        identifier: z.string(),
        code: z.string(),
        password: z.string(),
        name: z.string().trim().max(80).optional(), // drivers already have a name from the admin
        portal: portalSchema,
      })
      .parse(req.body);
    if (body.portal === 'passenger' && !body.name) throw new HttpError(400, 'Enter your name');
    checkPassword(body.password);
    const identifier = normalise(body.channel, body.identifier);
    const existing = await findUser(body.channel, identifier);
    if (existing?.password_hash) throw new HttpError(409, 'An account with a password already exists. Please log in.');
    if (body.portal === 'driver' && (!existing || !['driver', 'admin'].includes(existing.role))) throw new HttpError(403, NOT_DRIVER);

    await consumeOtp(identifier, body.code);
    const session = await resolveLogin({ channel: body.channel, identifier, portal: body.portal, name: body.name });
    await query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', [
      session.user.id,
      await hashPassword(body.password),
    ]);
    res.status(201).json(session);
  }),
);

router.post(
  '/password/login',
  loginLimiter,
  ah(async (req, res) => {
    const body = z
      .object({ identifier: z.string().min(3, 'Enter your email or mobile number'), password: z.string().min(1, 'Enter your password').max(128), portal: portalSchema })
      .parse(req.body);
    const channel = channelOf(body.identifier);
    const identifier = normalise(channel, body.identifier);
    const user = await findUser(channel, identifier);

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      throw new HttpError(429, `Too many wrong passwords. Try again in ${mins} minute${mins > 1 ? 's' : ''}, or use "Forgot password".`);
    }

    // Always run the hash check so response time doesn't reveal whether the account exists.
    const ok = await verifyPassword(body.password, user?.password_hash || DUMMY_HASH);
    if (!ok || !user?.password_hash) {
      if (user) {
        await query(
          `UPDATE users SET
             failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
             locked_until  = CASE WHEN failed_logins + 1 >= $2 THEN now() + interval '${LOCK_MIN} minutes' ELSE locked_until END
           WHERE id = $1`,
          [user.id, MAX_FAILED],
        );
      }
      throw new HttpError(401, 'Wrong email/mobile number or password.');
    }

    await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    res.json(await resolveLogin({ channel, identifier, portal: body.portal }));
  }),
);

// Forgot password: OTP (sent with purpose "reset") + new password.
router.post(
  '/password/reset',
  ah(async (req, res) => {
    const body = z
      .object({ channel: z.enum(['email', 'phone']), identifier: z.string(), code: z.string(), password: z.string(), portal: portalSchema })
      .parse(req.body);
    checkPassword(body.password);
    const identifier = normalise(body.channel, body.identifier);
    await consumeOtp(identifier, body.code);
    const user = await findUser(body.channel, identifier);
    if (!user) throw new HttpError(400, 'Code expired. Please request a new one.');
    await query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', [
      user.id,
      await hashPassword(body.password),
    ]);
    res.json(await resolveLogin({ channel: body.channel, identifier, portal: body.portal }));
  }),
);

router.post(
  '/google',
  ah(async (req, res) => {
    const body = z.object({ credential: z.string().min(10), portal: portalSchema }).parse(req.body);
    if (!google) throw new HttpError(400, 'Google Sign-In is not configured on the server (GOOGLE_CLIENT_ID).');
    let payload;
    try {
      const ticket = await google.verifyIdToken({ idToken: body.credential, audience: config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new HttpError(401, 'Google sign-in failed. Please try again.');
    }
    if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'Your Google email is not verified.');
    res.json(
      await resolveLogin({
        channel: 'email',
        identifier: payload.email.toLowerCase(),
        portal: body.portal,
        name: payload.name,
        googleSub: payload.sub,
      }),
    );
  }),
);

// Local demo only: stands in for Google when no client ID is configured.
router.post(
  '/google/demo',
  ah(async (req, res) => {
    if (google || !config.showDemoCodes) throw new HttpError(404, 'Not available');
    const body = z.object({ email: z.string(), name: z.string().optional(), portal: portalSchema }).parse(req.body);
    const email = normalise('email', body.email);
    res.json(
      await resolveLogin({ channel: 'email', identifier: email, portal: body.portal, name: body.name, googleSub: `demo-${email}` }),
    );
  }),
);

// Demo mode only: the sample accounts, so testers can log in as each role.
// These exist only in the in-memory demo database; a real database never has them.
const DEMO_ROLES = {
  'admin@govbus.test': {
    portal: 'passenger',
    title: 'Admin',
    lands: '/admin',
    can: ['Add routes, stops, buses, schedules and fares', 'Register drivers and assign buses', 'See bookings and revenue'],
  },
  'driver@govbus.test': {
    portal: 'driver',
    title: 'Driver / Conductor',
    lands: '/driver',
    can: ["Pick today's trip and share live GPS (or simulate a drive)", 'Scan ticket QR codes or enter a PNR', 'Mark passengers as boarded'],
  },
  'passenger@govbus.test': {
    portal: 'passenger',
    title: 'Passenger',
    lands: '/',
    can: ['Search buses and connecting routes', 'Pick seats, pay (mock) and get a QR e-ticket', 'Track the bus live, cancel and get a refund'],
  },
};

router.get(
  '/demo-accounts',
  ah(async (req, res) => {
    if (!config.demoMode) throw new HttpError(404, 'Demo accounts are only available in demo mode');
    const users = await query(`SELECT name, email, phone, role FROM users WHERE email = ANY($1::text[])`, [Object.keys(DEMO_ROLES)]);
    res.json(
      Object.entries(DEMO_ROLES)
        .map(([email, info]) => {
          const u = users.find((x) => x.email === email);
          return u && { ...info, name: u.name, email, phone: u.phone, role: u.role, password: DEMO_PASSWORDS[email] };
        })
        .filter(Boolean),
    );
  }),
);

router.get(
  '/me',
  requireAuth(),
  ah(async (req, res) => {
    const u = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!u) throw new HttpError(401, 'Account not found');
    res.json({ user: publicUser(u) });
  }),
);

router.patch(
  '/me',
  requireAuth(),
  ah(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const u = await one('UPDATE users SET name = $2 WHERE id = $1 RETURNING *', [req.user.id, name]);
    res.json({ token: signSession(u), user: publicUser(u) });
  }),
);

export default router;
