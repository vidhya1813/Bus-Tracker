import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useTripChannel } from '../socket.js';
import LiveMap from '../components/LiveMap.jsx';
import { clock12, niceDate } from '../utils.js';

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - new Date(ts)) / 1000));
  if (s < 60) return `${s} sec ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} hr ago`;
}

const etaClock = (iso) => clock12(new Date(iso).toTimeString().slice(0, 5));

export default function Track() {
  const { scheduleId, date } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api(`/track/${scheduleId}/${date}`).then(setData).catch((e) => setError(e.message));
  }, [scheduleId, date]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useTripChannel(
    scheduleId,
    date,
    {
      gps: ({ location, etas }) =>
        setData((d) => {
          if (!d || !location) return d;
          if (d.location && d.location.recorded_at === location.recorded_at) return d; // nothing new (polling)
          return { ...d, location, etas, trail: [...d.trail.slice(-199), { lat: location.lat, lng: location.lng }] };
        }),
    },
    {
      gps: async () => {
        const t = await api(`/track/${scheduleId}/${date}`);
        return { location: t.location, etas: t.etas };
      },
    },
    3000,
  );

  if (error) return <div className="page"><div className="error-card">{error}</div></div>;
  if (!data) return <div className="page center muted">Loading map…</div>;

  const { trip, stops, location, etas, trail } = data;
  const etaById = Object.fromEntries(etas.map((e) => [e.stopId, e]));
  const stale = location && now - new Date(location.recorded_at) > 2 * 60 * 1000;
  const nextStop = stops.find((s) => !etaById[s.id]?.passed && etaById[s.id]?.eta);

  return (
    <div className="page">
      <div className="card">
        <h1>{trip.routeName}</h1>
        <p className="muted">
          {trip.busTypeLabel} · Service {trip.serviceNo} · {trip.regNo} · {niceDate(trip.date)}
        </p>
        {location ? (
          <div className={`live-status ${stale ? 'stale' : 'live'}`} role="status" aria-live="polite">
            <span className="dot" /> {stale ? 'Last seen' : 'Live'} · updated {ago(location.recorded_at, now)}
            {location.speed_kmh != null && ` · ${Math.round(location.speed_kmh)} km/h`}
            {nextStop && (
              <div className="next-stop">
                Next stop: <b>{nextStop.name}</b> in <b>{etaById[nextStop.id].etaMinutes} min</b>
              </div>
            )}
          </div>
        ) : (
          <div className="notice">The bus has not started sharing its location yet. Scheduled timings are shown below.</div>
        )}
      </div>

      <LiveMap stops={stops} location={location} trail={trail} />

      <div className="card">
        <h2>Stops & arrival times</h2>
        <ol className="stop-list">
          {stops.map((s) => {
            const e = etaById[s.id];
            return (
              <li key={s.id} className={e?.passed ? 'passed' : nextStop?.id === s.id ? 'next' : ''}>
                <span className="stop-dot" aria-hidden="true" />
                <div className="stop-name">{s.name}</div>
                <div className="stop-times">
                  <span className="muted small">Scheduled {clock12(s.scheduled.time)}</span>
                  {e?.passed && <span className="small">Passed ✓</span>}
                  {!e?.passed && e?.eta && (
                    <span className="eta">
                      ETA {etaClock(e.eta)} <span className="muted small">({e.etaMinutes} min · {e.remainingKm} km)</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
