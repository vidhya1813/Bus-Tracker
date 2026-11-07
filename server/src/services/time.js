import { config } from '../config.js';

const offsetMinutes = (() => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(config.tzOffset);
  if (!m) return 330;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
})();

/** Today's date (YYYY-MM-DD) in the app's local timezone. */
export function todayLocal(now = new Date()) {
  return new Date(now.getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

/** Day of week (0=Sun) for a YYYY-MM-DD date. */
export function dayOfWeek(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime());
}

/** Absolute instant for local `date` + "HH:MM[:SS]" + extra minutes. */
export function localInstant(date, time, plusMinutes = 0) {
  const [h, m] = time.split(':').map(Number);
  const base = new Date(`${date}T00:00:00Z`).getTime() + (h * 60 + m + plusMinutes - offsetMinutes) * 60000;
  return new Date(base);
}

/** Format an instant as local "HH:MM" plus day offset from `date`. */
export function localClock(instant, date) {
  const local = new Date(instant.getTime() + offsetMinutes * 60000);
  const hhmm = local.toISOString().slice(11, 16);
  const dayDiff = Math.round(
    (new Date(local.toISOString().slice(0, 10)).getTime() - new Date(date).getTime()) / 86400000,
  );
  return { time: hhmm, dayOffset: dayDiff };
}
