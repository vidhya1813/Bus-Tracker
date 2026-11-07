export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/** "HH:MM" 24h -> "6:30 AM" (easier to read for everyone). */
export function clock12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function niceDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const STATUS_LABEL = {
  pending_payment: 'Payment pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
