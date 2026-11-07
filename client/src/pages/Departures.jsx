// Bus-stand style departure board (LED look) for any town.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePrefs } from '../prefs.jsx';
import { clock12, todayLocal } from '../utils.js';

const TYPE_ICON = { ordinary: '🚌', express: '🚍', ac: '❄️', sleeper: '🛏️' };

export default function Departures() {
  const { t } = usePrefs();
  const [params, setParams] = useSearchParams();
  const [places, setPlaces] = useState([]);
  const [place, setPlace] = useState(params.get('place') || 'Chennai');
  const [date, setDate] = useState(params.get('date') || todayLocal());
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    api('/places').then(setPlaces).catch(() => {});
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const p = params.get('place') || 'Chennai';
    const d = params.get('date') || todayLocal();
    setError('');
    api(`/departures?${new URLSearchParams({ place: p, date: d })}`)
      .then((r) => {
        setBoard(r);
        if (r.place) setPlace(r.place);
      })
      .catch((e) => setError(e.message));
  }, [params]);

  const submit = (e) => {
    e.preventDefault();
    setParams({ place, date });
  };

  return (
    <div className="page">
      <div className="board-head">
        <div>
          <h1>🚏 {t('dep.title')}</h1>
          <p className="muted">{t('dep.sub')}</p>
        </div>
        <div className="led-clock mono" aria-label="Current time">{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      </div>

      <form className="card glass row" onSubmit={submit}>
        <datalist id="dep-places">
          {places.map((p) => <option key={p.name} value={p.name}>{p.ta}</option>)}
        </datalist>
        <label>
          {t('dep.place')}
          <input list="dep-places" value={place} onChange={(e) => setPlace(e.target.value)} required />
        </label>
        <label>
          {t('search.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <button className="btn btn-primary">{t('dep.show')}</button>
      </form>

      {error && <div className="error-card">{error}</div>}
      {board && !board.place && (
        <div className="card">
          {t('unknown.title', { input: params.get('place') })}{' '}
          {board.suggestions?.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setParams({ place: s, date })}>{s}</button>
          ))}
        </div>
      )}

      {board?.place && (
        <div className="led-board" role="table" aria-label={`Departures from ${board.place}`}>
          <div className="led-title">
            <span>{board.place.toUpperCase()}</span>
            <span>{new Date(`${board.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="led-row led-header" role="row">
            <span role="columnheader">{t('dep.time')}</span>
            <span role="columnheader">{t('dep.towards')}</span>
            <span role="columnheader" className="hide-sm">{t('dep.bus')}</span>
            <span role="columnheader">{t('dep.status')}</span>
            <span role="columnheader" />
          </div>
          {board.departures.length === 0 && <div className="led-empty">{t('dep.none')}</div>}
          {board.departures.map((d, i) => (
            <div key={`${d.scheduleId}-${d.travelDate}`} className={`led-row flip-in ${d.departed ? 'gone' : ''}`} role="row" style={{ '--i': i }}>
              <span className="led-time" role="cell">{clock12(d.departure.time)}</span>
              <span role="cell">
                <b className="led-dest">{d.towards}</b>
                {d.via.length > 0 && <small className="led-via">via {d.via.slice(0, 3).join(', ')}</small>}
              </span>
              <span className="hide-sm" role="cell">{TYPE_ICON[d.busType]} {d.busTypeLabel} · {d.serviceNo}</span>
              <span role="cell" className={d.departed ? 'led-gone' : 'led-ok'}>{d.departed ? t('dep.departed') : t('dep.onTime')}</span>
              <span role="cell" className="led-actions">
                <Link className="btn btn-sm btn-outline" to={`/track/${d.scheduleId}/${d.travelDate}`} aria-label="Track">📍</Link>
                {!d.departed && (
                  <Link className="btn btn-sm btn-primary" to={`/trip/${d.scheduleId}/${d.travelDate}?from=${d.fromStopId}&to=${d.toStopId}`}>{t('results.select')}</Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
