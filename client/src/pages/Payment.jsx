// Mock payment gateway: no real money moves. Pick a method and simulate success or failure.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { clock12, niceDate, rupees } from '../utils.js';

const METHODS = [
  ['upi', '📲 UPI', 'Pay with any UPI app'],
  ['card', '💳 Debit / Credit card', 'Visa, RuPay, Mastercard'],
  ['netbanking', '🏦 Net banking', 'All major banks'],
];

function useCountdown(until) {
  const [left, setLeft] = useState(() => (until ? new Date(until) - Date.now() : 0));
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setLeft(new Date(until) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, left);
}

export default function Payment() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [b, setB] = useState(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const left = useCountdown(b?.holdExpiresAt);

  useEffect(() => {
    api(`/bookings/${bookingId}`)
      .then((d) => {
        if (d.status === 'confirmed') navigate(`/ticket/${bookingId}`, { replace: true });
        setB(d);
      })
      .catch((e) => setError(e.message));
  }, [bookingId, navigate]);

  const pay = async (outcome) => {
    setBusy(true);
    setError('');
    try {
      await api('/payments/mock', { method: 'POST', body: { bookingId, method, outcome } });
      navigate(`/ticket/${bookingId}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await api(`/bookings/${bookingId}/cancel`, { method: 'POST' }).catch(() => {});
    navigate(-1);
  };

  if (!b) return <div className="page">{error ? <div className="error-card">{error}</div> : <p className="center muted">Loading…</p>}</div>;

  const expired = b.status !== 'pending_payment' || left === 0;
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="page narrow">
      <div className="card gateway">
        <div className="gateway-head">
          <span>🔒 GovBus Pay <span className="pill">DEMO</span></span>
          {!expired && <span className="timer" aria-live="polite">Seats held: {mm}:{ss}</span>}
        </div>
        <div className="pay-summary">
          <div>
            <b>{b.from} → {b.to}</b>
            <div className="muted small">
              {niceDate(b.travelDate)} · {clock12(b.departure.time)} · {b.busTypeLabel} · Seats {b.seatNos.join(', ')}
            </div>
          </div>
          <div className="amount">{rupees(b.totalAmount)}</div>
        </div>

        {expired ? (
          <div className="error-card">Your seat hold has expired. Please go back and select seats again.</div>
        ) : (
          <>
            <fieldset className="methods">
              <legend>Choose payment method</legend>
              {METHODS.map(([k, label, hint]) => (
                <label key={k} className={`method ${method === k ? 'on' : ''}`}>
                  <input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)} />
                  <span>
                    <b>{label}</b>
                    <span className="muted small"> {hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="muted small">This is a demo gateway. No card or bank details are needed and no money is charged.</p>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => pay('success')} disabled={busy}>
              {busy ? 'Processing…' : `Pay ${rupees(b.totalAmount)}`}
            </button>
            <div className="row-between">
              <button className="linkish" onClick={() => pay('failure')} disabled={busy}>Simulate failed payment</button>
              <button className="linkish danger" onClick={cancel} disabled={busy}>Cancel booking</button>
            </div>
          </>
        )}
        {error && <div className="error-card" role="alert">{error}</div>}
      </div>
    </div>
  );
}
