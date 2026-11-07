import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name || '' }, config.jwtSecret, { expiresIn: '7d' });
}

/** requireAuth() for any logged-in user, requireAuth('admin') / ('driver','admin') for roles. */
export function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in' });
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.typ) throw new Error('wrong token type'); // ticket tokens are not sessions
      req.user = { id: payload.sub, role: payload.role, name: payload.name };
    } catch {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this page' });
    }
    next();
  };
}

/** Wrap async handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
