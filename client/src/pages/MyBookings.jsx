import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { clock12, niceDate, rupees, STATUS_LABEL } from '../utils.js';

export default function MyBookings() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('upcoming');
  const [confirming, setConfirming] = useState(null); // { booking, refund }

  const load = useCallback(() => {
    api('/bookings').then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Refresh while any refund is processing so the status flips by itself.
  useEffect(() => {
    if (!list?.some((b) => b.refundStatus === 'processing')) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [list, load]);

  const askCancel = async (b) => {
    setError('');
    try {
      const { refund } = await api(`/bookings/${b.id}/refund-quote`);
      setConfirming({ booking: b, refund });
    } catch (e) {
      setError(e.message);
    }
  };

  const doCancel = async () => {
    try {
      await api(`/bookings/${confirming.booking.id}/cancel`, { method: 'POST' });
      setConfirming(null);
      load();
    } catch (e) {
      setError(e.message);
      setConfirming(null);
    }
  };

  if (!list) return <div className="page center muted">{error || 'Loading your tickets…'}</div>;

  const now = Date.now();
  const visible = list.filter((b) => {
    if (b.status === 'expired') return false;
    const upcoming = new Date(b.arrivalAt).getTime() > now && b.status !== 'cancelled';
    return tab === 'upcoming' ? upcoming : !upcoming;
  });

  return (
    <div className="page">
      <h1>My Tickets</h1>
      <div className="segmented">
        <button className={tab === 'upcoming' ? 'on' : ''} onClick={() => setTab('upcoming')}>Upcoming</button>
        <button className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past & cancelled</button>
      </div>
      {error && <div className="error-card" role="alert">{error}</div>}
      {visible.length === 0 && (
        <div className="card center">
          {tab === 'upcoming' ? <>No upcoming trips. <Link to="/">Book a bus</Link></> : 'Nothing here yet.'}
        </div>
      )}
      <ul className="bus-list">
        {visible.map((b) => (
          <li key={b.id} className="card booking-card">
            <div className="row-between">
              <b>{b.from} → {b.to}</b>
              <span className={`status s-${b.status}`}>{STATUS_LABEL[b.status]}</span>
            </div>
            <div className="muted">
              {niceDate(b.travelDate)} · {clock12(b.departure.time)} · {b.busTypeLabel} · Seats {b.seatNos.join(', ')}
            </div>
            <div className="muted small">PNR <span className="mono">{b.pnr}</span> · {rupees(b.totalAmount)}</div>
            {b.status === 'cancelled' && (
              <div className={`refund r-${b.refundStatus}`}>
                Refund {rupees(b.refundAmount)}: {b.refundStatus === 'processed' ? 'Credited to your account ✅' : 'Processing ⏳'}
              </div>
            )}
            <div className="actions">
              {b.status === 'pending_payment' && <Link className="btn btn-primary" to={`/pay/${b.id}`}>Complete payment</Link>}
              {b.status === 'confirmed' && <Link className="btn btn-outline" to={`/ticket/${b.id}`}>View ticket</Link>}
              {b.status === 'confirmed' && tab === 'upcoming' && (
                <>
                  <Link className="btn btn-outline" to={`/track/${b.scheduleId}/${b.travelDate}`}>📍 Track</Link>
                  <button className="btn btn-danger-outline" onClick={() => askCancel(b)}>Cancel</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="card modal">
            <h2 id="cancel-title">Cancel ticket {confirming.booking.pnr}?</h2>
            {confirming.refund ? (
              <p>
                You will get <b>{rupees(confirming.refund.amount)}</b> back ({Math.round(confirming.refund.pct * 100)}% of{' '}
                {rupees(confirming.booking.totalAmount)}). This cannot be undone.
              </p>
            ) : (
              <p>Tickets cannot be cancelled less than 2 hours before departure.</p>
            )}
            <div className="row-between">
              <button className="btn btn-outline" onClick={() => setConfirming(null)}>Keep ticket</button>
              {confirming.refund && <button className="btn btn-danger" onClick={doCancel}>Yes, cancel</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
