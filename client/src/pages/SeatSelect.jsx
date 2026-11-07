import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useTripChannel } from '../socket.js';
import SeatMap from '../components/SeatMap.jsx';
import { clock12, duration, niceDate, rupees } from '../utils.js';

const MAX = 6;

export default function SeatSelect() {
  const { scheduleId, date } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [passengers, setPassengers] = useState({});
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const draftKey = `govbus_draft_${scheduleId}_${date}`;

  useEffect(() => {
    api(`/trips/${scheduleId}/${date}`)
      .then((d) => {
        setData(d);
        // Restore a draft saved before the login detour (only seats still free).
        try {
          const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
          sessionStorage.removeItem(draftKey);
          if (draft) {
            const free = new Set(d.seats.filter((s) => s.status === 'available').map((s) => s.seat_no));
            setSelected(draft.selected.filter((no) => free.has(no)));
            setPassengers(draft.passengers || {});
            if (draft.contactEmail) setContactEmail(draft.contactEmail);
            if (draft.contactPhone) setContactPhone(draft.contactPhone);
          }
        } catch {
          /* ignore */
        }
      })
      .catch((e) => setError(e.message));
  }, [scheduleId, date, draftKey]);

  useEffect(() => {
    if (user) {
      setContactEmail((v) => v || user.email || '');
      setContactPhone((v) => v || user.phone || '');
    }
  }, [user]);

  // Real-time: if someone else takes a seat I picked, drop it and tell me.
  useTripChannel(scheduleId, date, {
    seats: (msg) => {
      setData((d) => (d ? { ...d, seats: msg.seats } : d));
      if (submitting.current) return; // our own hold, we're leaving for payment
      setSelected((sel) => {
        const takenNow = sel.filter((no) => msg.seats.find((s) => s.seat_no === no)?.status !== 'available');
        if (takenNow.length) setNotice(`Seat ${takenNow.join(', ')} was just booked by someone else.`);
        return sel.filter((no) => !takenNow.includes(no));
      });
    },
  }, {
    seats: async () => ({ seats: (await api(`/trips/${scheduleId}/${date}`)).seats }),
  });

  const stops = data?.stops || [];
  const fromId = params.get('from') || stops[0]?.id;
  const toId = params.get('to') || stops[stops.length - 1]?.id;
  const fromStop = stops.find((s) => s.id === fromId);
  const toStop = stops.find((s) => s.id === toId);

  const fare = useMemo(() => {
    if (!fromStop || !toStop) return 0;
    const { routeFare, totalKm } = data.fare;
    const seg = toStop.distance_km - fromStop.distance_km;
    if (routeFare && totalKm) return Math.max(10, Math.round((routeFare * seg) / totalKm));
    return Math.max(10, toStop.fareFromOrigin - fromStop.fareFromOrigin);
  }, [data, fromStop, toStop]);

  if (error && !data) return <div className="page"><div className="error-card">{error}</div></div>;
  if (!data) return <div className="page center muted">Loading seats…</div>;

  const toggle = (no) => {
    setNotice('');
    setSelected((sel) => {
      if (sel.includes(no)) return sel.filter((x) => x !== no);
      if (sel.length >= MAX) {
        setNotice(`You can book up to ${MAX} seats at a time.`);
        return sel;
      }
      return [...sel, no];
    });
  };

  const setP = (no, field, value) =>
    setPassengers((p) => ({ ...p, [no]: { gender: 'female', ...p[no], [field]: value } }));

  const book = async (e) => {
    e.preventDefault();
    if (!user) {
      // Keep the seats and names while the passenger logs in.
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ selected, passengers, contactEmail, contactPhone }));
      } catch {
        /* storage blocked: they'll re-select */
      }
      navigate('/login', { state: { from: `/trip/${scheduleId}/${date}?${params}` } });
      return;
    }
    setBusy(true);
    setError('');
    submitting.current = true;
    try {
      const booking = await api('/bookings', {
        method: 'POST',
        body: {
          scheduleId,
          travelDate: date,
          fromStopId: fromStop.id,
          toStopId: toStop.id,
          passengers: selected.map((no) => ({ seatNo: no, name: '', age: '', gender: 'female', ...passengers[no] })),
          contactEmail,
          contactPhone: contactPhone.replace(/[\s-]/g, ''),
        },
      });
      navigate(`/pay/${booking.id}`);
    } catch (err) {
      submitting.current = false;
      setError(err.message);
      api(`/trips/${scheduleId}/${date}`).then(setData).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const { trip } = data;
  const dep = fromStop && fromStop.departure;
  const arr = toStop && toStop.departure;

  return (
    <div className="page">
      <button type="button" className="back linkish" onClick={() => navigate(-1)}>← Back</button>
      <div className="card trip-summary">
        <h1>{trip.routeName}</h1>
        <p className="muted">
          {trip.busTypeLabel} · Service {trip.serviceNo} · {trip.regNo} · {niceDate(date)}
        </p>
        <div className="from-to-select">
          <label>
            Boarding at
            <select value={fromId} onChange={(e) => setParams({ from: e.target.value, to: toId })}>
              {stops.slice(0, -1).map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {clock12(s.departure.time)}</option>
              ))}
            </select>
          </label>
          <label>
            Getting down at
            <select value={toId} onChange={(e) => setParams({ from: fromId, to: e.target.value })}>
              {stops.filter((s) => s.seq > (fromStop?.seq || 0)).map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {clock12(s.departure.time)}</option>
              ))}
            </select>
          </label>
        </div>
        {dep && arr && (
          <p className="journey-line">
            <b>{clock12(dep.time)}</b> {fromStop.name} → <b>{clock12(arr.time)}</b>
            {arr.dayOffset > dep.dayOffset && <sup className="plus-day">+1</sup>} {toStop.name} ·{' '}
            {duration(Math.round((new Date(toStop.departureAt) - new Date(fromStop.departureAt)) / 60000))} ·{' '}
            <b>{rupees(fare)}</b> per seat
          </p>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Choose seats</h2>
          <p className="muted small">Seats update live. Tap a seat to select it.</p>
          <SeatMap seats={data.seats} selected={selected} onToggle={toggle} />
        </div>

        <form className="card stack" onSubmit={book}>
          <h2>Passenger details</h2>
          {selected.length === 0 && <p className="muted">Select seats on the map to continue.</p>}
          {selected.map((no) => (
            <fieldset key={no} className="passenger">
              <legend>Seat {no}</legend>
              <label>
                Name
                <input required value={passengers[no]?.name || ''} onChange={(e) => setP(no, 'name', e.target.value)} placeholder="Passenger name" />
              </label>
              <div className="row">
                <label>
                  Age
                  <input required type="number" min="1" max="120" inputMode="numeric" value={passengers[no]?.age || ''} onChange={(e) => setP(no, 'age', e.target.value)} />
                </label>
                <label>
                  Gender
                  <select value={passengers[no]?.gender || 'female'} onChange={(e) => setP(no, 'gender', e.target.value)}>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
            </fieldset>
          ))}

          {selected.length > 0 && (
            <>
              <h3>Send ticket to</h3>
              <label>
                Mobile (SMS)
                <input type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 98765 43210" />
              </label>
              <label>
                Email
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@example.com" />
              </label>
              <div className="total-bar">
                <span>{selected.length} seat{selected.length > 1 ? 's' : ''}: {selected.join(', ')}</span>
                <b>{rupees(fare * selected.length)}</b>
              </div>
              <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
                {busy ? 'Holding seats…' : user ? 'Continue to payment' : 'Login to continue'}
              </button>
              <p className="muted small center">Seats are held for 10 minutes while you pay.</p>
            </>
          )}
          {notice && <div className="notice" role="status">{notice}</div>}
          {error && <div className="error-card" role="alert">{error}</div>}
        </form>
      </div>
    </div>
  );
}
