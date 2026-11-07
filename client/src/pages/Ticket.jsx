// E-ticket as a 3D flip card: journey details on the front, boarding QR on the back.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { clock12, duration, niceDate, rupees, STATUS_LABEL } from '../utils.js';

const icsTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function downloadCalendar(t) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GovBus//Ticket//EN',
    'BEGIN:VEVENT',
    `UID:${t.pnr}@govbus`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(t.departureAt)}`,
    `DTEND:${icsTime(t.arrivalAt)}`,
    `SUMMARY:Bus ${t.from} to ${t.to} (PNR ${t.pnr})`,
    `DESCRIPTION:${t.busTypeLabel} ${t.serviceNo} (${t.regNo}). Seats ${t.seatNos.join(', ')}.`,
    `LOCATION:${t.from} bus stand`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your bus leaves in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `govbus-${t.pnr}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Ticket() {
  const { bookingId } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  useEffect(() => {
    api(`/bookings/${bookingId}`).then(setT).catch((e) => setError(e.message));
  }, [bookingId]);

  if (error) return <div className="page"><div className="error-card">{error}</div></div>;
  if (!t) return <div className="page center muted">Loading ticket…</div>;

  const share = async () => {
    const text = `GovBus ticket ${t.pnr}: ${t.from} → ${t.to}, ${niceDate(t.travelDate)} ${clock12(t.departure.time)}, ${t.busTypeLabel} ${t.serviceNo}, seats ${t.seatNos.join(', ')}. Track: ${window.location.origin}/track/${t.scheduleId}/${t.travelDate}`;
    try {
      if (navigator.share) await navigator.share({ title: `Ticket ${t.pnr}`, text });
      else {
        await navigator.clipboard.writeText(text);
        setShareMsg('Ticket details copied. Paste them in WhatsApp or SMS.');
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="page narrow">
      {t.status === 'confirmed' && (
        <div className="success-banner" role="status">
          ✅ Booking confirmed! Ticket sent to {[t.contactPhone, t.contactEmail].filter(Boolean).join(' and ')}.
        </div>
      )}

      <div className="flip-scene">
        <div className={`flip-card ${flipped ? 'flipped' : ''}`}>
          <article className="card ticket flip-face flip-front" aria-hidden={flipped}>
            <header className="ticket-head">
              <div>
                <div className="muted small">E-TICKET · PNR</div>
                <div className="pnr mono">{t.pnr}</div>
              </div>
              <span className={`status s-${t.status}`}>{STATUS_LABEL[t.status]}</span>
            </header>

            <div className="ticket-route">
              <div>
                <div className="time">{clock12(t.departure.time)}</div>
                <div className="place">{t.from}</div>
              </div>
              <div className="dur">
                {duration(t.durationMinutes)}
                <div className="line"><span className="line-bus">🚌</span></div>
              </div>
              <div className="right">
                <div className="time">{clock12(t.arrival.time)}{t.arrival.dayOffset > 0 && <sup className="plus-day">+1</sup>}</div>
                <div className="place">{t.to}</div>
              </div>
            </div>

            <dl className="ticket-grid">
              <div><dt>Date</dt><dd>{niceDate(t.travelDate)}</dd></div>
              <div><dt>Bus</dt><dd>{t.busTypeLabel}</dd></div>
              <div><dt>Service</dt><dd>{t.serviceNo}</dd></div>
              <div><dt>Bus no.</dt><dd>{t.regNo}</dd></div>
              <div><dt>Seats</dt><dd>{t.seatNos.join(', ')}</dd></div>
              <div><dt>Fare paid</dt><dd>{rupees(t.totalAmount)}</dd></div>
            </dl>

            <table className="pax">
              <thead><tr><th>Seat</th><th>Passenger</th><th>Age</th></tr></thead>
              <tbody>
                {t.passengers.map((p) => (
                  <tr key={p.seatNo}><td>{p.seatNo}</td><td>{p.name}</td><td>{p.age} {p.gender[0].toUpperCase()}</td></tr>
                ))}
              </tbody>
            </table>

            {t.status === 'cancelled' && (
              <div className="notice">
                Cancelled. Refund {rupees(t.refundAmount)} — {t.refundStatus === 'processed' ? 'credited ✅' : 'processing ⏳'}
              </div>
            )}
            {t.qr && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => setFlipped(true)}>
                🔳 Show boarding QR
              </button>
            )}
          </article>

          {t.qr && (
            <article className="card ticket flip-face flip-back" aria-hidden={!flipped}>
              <div className="muted small">Show this to the conductor</div>
              <div className="pnr mono">{t.pnr}</div>
              <div className="qr">
                <img src={t.qr} alt={`QR code for ticket ${t.pnr}`} width="240" height="240" />
              </div>
              <p><b>{t.from} → {t.to}</b><br />Seats {t.seatNos.join(', ')}</p>
              <button type="button" className="btn btn-outline btn-block" onClick={() => setFlipped(false)}>↩ Ticket details</button>
            </article>
          )}
        </div>
      </div>

      <div className="ticket-actions">
        <Link className="btn btn-outline" to={`/track/${t.scheduleId}/${t.travelDate}`}>📍 Track my bus</Link>
        {t.status === 'confirmed' && <button className="btn btn-outline" onClick={share}>📤 Share</button>}
        {t.status === 'confirmed' && <button className="btn btn-outline" onClick={() => downloadCalendar(t)}>📅 Add to calendar</button>}
        <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Print</button>
        <Link className="btn btn-outline" to="/bookings">🎫 My tickets</Link>
      </div>
      {shareMsg && <p className="notice small center">{shareMsg}</p>}
    </div>
  );
}
