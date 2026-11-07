import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePrefs, THEMES } from '../prefs.jsx';
import Scenery from '../components/Scenery.jsx';
import Tilt from '../components/Tilt.jsx';
import { useSos } from '../components/SOS.jsx';
import { clock12, duration, rupees, todayLocal, niceDate, STATUS_LABEL } from '../utils.js';

const TYPE_ICON = { ordinary: '🚌', express: '🚍', ac: '❄️', sleeper: '🛏️' };
const AMENITIES = {
  ordinary: ['🪑 2+3', '📡 GPS'],
  express: ['💺 2+2', '⚡ Fewer stops', '📡 GPS'],
  ac: ['❄️ AC', '🔌 Charging', '💧 Water', '📡 GPS'],
  sleeper: ['🛏️ Berth', '❄️ AC', '🧣 Blanket', '🔌 Charging', '📡 GPS'],
};
const SLOTS = [
  ['morning', '🌅', (h) => h >= 5 && h < 12],
  ['afternoon', '☀️', (h) => h >= 12 && h < 17],
  ['evening', '🌇', (h) => h >= 17 && h < 21],
  ['night', '🌙', (h) => h >= 21 || h < 5],
];
const POPULAR = [
  { from: 'Chennai', to: 'Ooty', emoji: '🌿', theme: 'nilgiri', en: ['Queen of Hills', 'Tea gardens & misty valleys'], ta: ['மலைகளின் அரசி', 'தேயிலைத் தோட்டங்கள் & பனி மூட்டம்'] },
  { from: 'Madurai', to: 'Rameswaram', emoji: '🛕', theme: 'gopuram', en: ['Island temple town', 'Across the Pamban sea'], ta: ['தீவுக் கோயில் நகரம்', 'பாம்பன் கடலைக் கடந்து'] },
  { from: 'Chennai', to: 'Kanyakumari', emoji: '🌅', theme: 'marina', en: ['Land’s end sunrise', 'Where three seas meet'], ta: ['முனைச் சூரிய உதயம்', 'முக்கடல் சங்கமம்'] },
  { from: 'Chennai', to: 'Puducherry', emoji: '🌊', theme: 'marina', en: ['East Coast Road', 'Shore temples of Mamallapuram'], ta: ['கிழக்குக் கடற்கரைச் சாலை', 'மாமல்லபுரம் கடற்கரைக் கோயில்'] },
  { from: 'Tiruchirappalli', to: 'Velankanni', emoji: '🌾', theme: 'kaveri', en: ['Kaveri delta', 'Paddy fields & Thanjavur'], ta: ['காவிரி டெல்டா', 'நெல் வயல்கள் & தஞ்சாவூர்'] },
  { from: 'Coimbatore', to: 'Ooty', emoji: '⛰️', theme: 'nilgiri', en: ['36 hairpin bends', 'Nilgiri ghat road'], ta: ['36 கொண்டை ஊசி வளைவுகள்', 'நீலகிரி மலைச் சாலை'] },
];

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const hourOf = (hhmm) => Number(hhmm.split(':')[0]);
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem('govbus_recent') || '[]');
  } catch {
    return [];
  }
};

export default function Search() {
  const { t, lang } = usePrefs();
  const [params, setParams] = useSearchParams();
  const [places, setPlaces] = useState([]);
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [date, setDate] = useState(params.get('date') || todayLocal());
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [swapSpin, setSwapSpin] = useState(0);
  const [recent, setRecent] = useState(readRecent);

  useEffect(() => {
    api('/places').then(setPlaces).catch(() => {});
  }, []);

  useEffect(() => {
    const f = params.get('from');
    const tt = params.get('to');
    const d = params.get('date') || todayLocal();
    if (!f || !tt) {
      setResult(null);
      return;
    }
    setFrom(f);
    setTo(tt);
    setDate(d);
    setLoading(true);
    setError('');
    api(`/search?${new URLSearchParams({ from: f, to: tt, date: d })}`)
      .then((r) => {
        setResult(r);
        if (!r.unknown) {
          const next = [{ from: r.from, to: r.to }, ...readRecent().filter((x) => !(x.from === r.from && x.to === r.to))].slice(0, 5);
          try {
            localStorage.setItem('govbus_recent', JSON.stringify(next));
          } catch {
            /* ignore */
          }
          setRecent(next);
        }
        setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      })
      .catch((e) => {
        setResult(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [params]);

  const go = (f, tt, d = date) => setParams({ from: f.trim(), to: tt.trim(), date: d });
  const submit = (e) => {
    e.preventDefault();
    go(from, to);
  };
  const swap = () => {
    setFrom(to);
    setTo(from);
    setSwapSpin((s) => s + 180);
  };

  const today = todayLocal();
  const quickDates = [
    [today, t('search.today')],
    [addDays(today, 1), t('search.tomorrow')],
    [addDays(today, 2), t('search.dayAfter')],
  ];
  const routesCount = 16;

  return (
    <div className="home">
      <section className="hero">
        <Scenery busLabel={to ? to.toUpperCase().slice(0, 14) : 'GOVBUS'}>
          <div className="hero-copy">
            <span className="kicker">{t('hero.kicker')}</span>
            <h1 className="hero-title">{t('hero.title')}</h1>
            <p className="hero-sub">{t('hero.sub')}</p>
          </div>
        </Scenery>

        <form onSubmit={submit} className="search-card glass" aria-label="Search buses">
          <datalist id="places">
            {places.map((p) => (
              <option key={p.name} value={p.name}>{p.ta}</option>
            ))}
          </datalist>
          <div className="from-to">
            <label className="field">
              <span className="field-label"><i className="dot-from" /> {t('search.from')}</span>
              <input list="places" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t('search.phFrom')} required autoComplete="off" />
            </label>
            <button type="button" className="swap" onClick={swap} aria-label={t('search.swap')} title={t('search.swap')} style={{ transform: `rotate(${swapSpin}deg)` }}>
              ⇅
            </button>
            <label className="field">
              <span className="field-label"><i className="dot-to" /> {t('search.to')}</span>
              <input list="places" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('search.phTo')} required autoComplete="off" />
            </label>
          </div>
          <div className="date-row">
            <div className="chips" role="group" aria-label={t('search.date')}>
              {quickDates.map(([d, label]) => (
                <button key={d} type="button" className={`chip ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="field date-field">
              <span className="field-label">📅 {t('search.date')}</span>
              <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>
          <button className="btn btn-primary btn-block btn-lg btn-shine">🔍 {t('search.button')}</button>
        </form>
      </section>

      <div className="page">
        {error && <div className="error-card" role="alert">{error}</div>}
        {loading && (
          <div className="loading-bus" role="status">
            <span className="mini-bus">🚌</span> {t('search.searching')}
          </div>
        )}

        {result && !loading && <Results result={result} onDate={(d) => go(result.from, result.to, d)} onPick={go} />}

        {!params.get('from') && (
          <HomeExtras places={places} routesCount={routesCount} recent={recent} lang={lang} onTrip={(f, tt) => go(f, tt, addDays(today, 1))} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- results */

function Results({ result, onDate, onPick }) {
  const { t } = usePrefs();
  const [sort, setSort] = useState('earliest');
  const [type, setType] = useState('all');
  const [slots, setSlots] = useState([]);

  const buses = useMemo(() => {
    let list = result.buses.filter((b) => type === 'all' || b.busType === type);
    if (slots.length) list = list.filter((b) => slots.some((s) => SLOTS.find((x) => x[0] === s)[2](hourOf(b.departure.time))));
    const cmp = {
      earliest: (a, b) => a.departureAt.localeCompare(b.departureAt),
      cheapest: (a, b) => a.fare - b.fare,
      fastest: (a, b) => a.durationMinutes - b.durationMinutes,
      seats: (a, b) => b.seatsLeft - a.seatsLeft,
    }[sort];
    return [...list].sort(cmp);
  }, [result, sort, type, slots]);

  const toggleSlot = (s) => setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const today = todayLocal();

  if (result.unknown) {
    return (
      <section id="results" className="card unknown-card pop-in">
        {result.unknown.map((u) => (
          <div key={u.field}>
            <h2>🤔 {t('unknown.title', { input: u.input })}</h2>
            {u.suggestions.length > 0 && (
              <p>
                {t('unknown.didYouMean')}{' '}
                {u.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    onClick={() => onPick(u.field === 'from' ? s : result.from, u.field === 'to' ? s : result.to, result.date)}
                  >
                    {s}
                  </button>
                ))}
              </p>
            )}
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id="results" className="results">
      <div className="results-head">
        <div>
          <h2 className="route-title">
            {result.from} <span className="arrow">➜</span> {result.to}
          </h2>
          <span className="muted">{niceDate(result.date)} · {t('results.buses', { n: result.buses.length })}</span>
        </div>
        <div className="day-nav">
          <button type="button" className="icon-btn" disabled={result.date <= today} onClick={() => onDate(addDays(result.date, -1))} aria-label={t('results.prevDay')}>‹</button>
          <span className="day-pill">{new Date(`${result.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          <button type="button" className="icon-btn" onClick={() => onDate(addDays(result.date, 1))} aria-label={t('results.nextDay')}>›</button>
        </div>
      </div>

      {result.buses.length > 0 && (
        <div className="filters card glass">
          <div className="chips" role="group" aria-label="Bus type">
            {['all', 'ordinary', 'express', 'ac', 'sleeper'].map((k) => (
              <button key={k} type="button" className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>
                {k !== 'all' && TYPE_ICON[k]} {t(`type.${k}`)}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Departure time">
            {SLOTS.map(([k, icon]) => (
              <button key={k} type="button" className={`chip ${slots.includes(k) ? 'on' : ''}`} onClick={() => toggleSlot(k)} aria-pressed={slots.includes(k)}>
                {icon} {t(`time.${k}`)}
              </button>
            ))}
          </div>
          <label className="sort">
            {t('results.sort')}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {['earliest', 'cheapest', 'fastest', 'seats'].map((k) => (
                <option key={k} value={k}>{t(`sort.${k}`)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {result.buses.length > 0 && buses.length === 0 && (
        <div className="card center">
          {t('results.none')}{' '}
          <button type="button" className="linkish" onClick={() => { setType('all'); setSlots([]); }}>{t('results.clear')}</button>
        </div>
      )}

      <ul className="bus-list">
        {buses.map((b, i) => (
          <li key={b.scheduleId} className="rise" style={{ '--i': i }}>
            <BusCard b={b} date={result.date} />
          </li>
        ))}
      </ul>

      {result.buses.length === 0 || result.connections.length > 0 ? (
        <Connections result={result} />
      ) : null}
    </section>
  );
}

function BusCard({ b, date }) {
  const { t } = usePrefs();
  const filled = Math.round(((b.totalSeats - b.seatsLeft) / b.totalSeats) * 100);
  return (
    <Tilt className={`card bus-card t-${b.busType} ${b.departed ? 'departed' : ''}`} max={5}>
      <div className="bus-top">
        <span className={`type-badge t-${b.busType}`}>{TYPE_ICON[b.busType]} {b.busTypeLabel}</span>
        <span className="muted small">{t('results.direct')} · {b.serviceNo} · {b.regNo}</span>
      </div>
      <div className="timeline">
        <div>
          <div className="time">{clock12(b.departure.time)}</div>
          <div className="place">{b.from}</div>
        </div>
        <div className="dur">
          <span>{duration(b.durationMinutes)}</span>
          <div className="line"><span className="line-bus">🚌</span></div>
          <span className="muted small">{b.distanceKm} km</span>
        </div>
        <div className="right">
          <div className="time">
            {clock12(b.arrival.time)}
            {b.arrival.dayOffset > 0 && <sup className="plus-day">+{b.arrival.dayOffset}</sup>}
          </div>
          <div className="place">{b.to}</div>
        </div>
      </div>
      <div className="amenities">{AMENITIES[b.busType].map((a) => <span key={a}>{a}</span>)}</div>
      <div className="bus-bottom">
        <div className="fare-block">
          <div className="fare">{rupees(b.fare)}</div>
          <div className="seatbar" title={`${filled}% booked`}><span style={{ width: `${filled}%` }} /></div>
          <div className={`small ${b.seatsLeft < 6 ? 'warn' : 'ok'}`}>{b.seatsLeft > 0 ? t('results.seatsLeft', { n: b.seatsLeft }) : t('results.full')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-outline" to={`/track/${b.scheduleId}/${date}`}>📍 {t('results.track')}</Link>
          {b.departed ? (
            <span className="pill muted">{t('results.departed')}</span>
          ) : (
            <Link className={`btn btn-primary ${b.seatsLeft === 0 ? 'disabled' : ''}`} to={`/trip/${b.scheduleId}/${date}?from=${b.fromStopId}&to=${b.toStopId}`}>
              {t('results.select')} →
            </Link>
          )}
        </div>
      </div>
    </Tilt>
  );
}

function Connections({ result }) {
  const { t } = usePrefs();
  const list = result.connections;
  if (!list.length) {
    return (
      <div className="card center pop-in">
        <div className="big-emoji" aria-hidden="true">🗺️</div>
        <p>{t('conn.none')}</p>
        <Link className="btn btn-outline" to={`/departures?place=${encodeURIComponent(result.from)}&date=${result.date}`}>
          🚏 {t('conn.tryBoard', { place: result.from })}
        </Link>
      </div>
    );
  }
  return (
    <div className="connections">
      <div className="conn-banner pop-in">
        <div className="conn-banner-icon" aria-hidden="true">🔁</div>
        <div>
          <h3>{t('conn.title')}</h3>
          <p>{t('conn.sub')}</p>
        </div>
      </div>
      <ul className="bus-list">
        {list.map((c, i) => (
          <li key={c.legs.map((l) => l.scheduleId).join('-')} className="rise" style={{ '--i': i }}>
            <Tilt className="card conn-card" max={4}>
              <div className="conn-head">
                <div className="tags">
                  {c.tags.map((tag) => <span key={tag} className={`tag tag-${tag}`}>{t(`tag.${tag}`)}</span>)}
                  <span className="tag tag-plain">{c.changes.length === 1 ? t('conn.changes1') : t('conn.changesN', { n: c.changes.length })}</span>
                </div>
                <div className="conn-total">
                  <b>{clock12(c.departure.time)} → {clock12(c.arrival.time)}{c.arrival.dayOffset > 0 && <sup className="plus-day">+{c.arrival.dayOffset}</sup>}</b>
                  <span className="muted small">{t('conn.total')} {duration(c.totalMinutes)} · <b className="fare-inline">{rupees(c.totalFare)}</b></span>
                </div>
              </div>

              <div className="path-strip" aria-hidden="true">
                {[c.legs[0].from, ...c.legs.map((l) => l.to)].map((p, k, arr) => (
                  <span key={p} className="path-node">
                    <span className={`node ${k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'hub'}`} />
                    <span className="node-name">{p}</span>
                    {k < arr.length - 1 && <span className="node-link" />}
                  </span>
                ))}
              </div>

              <ol className="legs">
                {c.legs.map((l, k) => (
                  <li key={l.scheduleId + k}>
                    {k > 0 && (
                      <div className="change-pill">
                        🔁 {t('conn.change', { place: l.from })} · ☕ {t('conn.wait', { t: duration(c.changes[k - 1].waitMinutes) })}
                      </div>
                    )}
                    <div className="leg">
                      <div className="leg-step">{t('conn.step', { n: k + 1 })}</div>
                      <div className="leg-main">
                        <div className="leg-times">
                          <b>{clock12(l.departure.time)}</b> {l.from} <span className="arrow">➜</span> <b>{clock12(l.arrival.time)}</b>
                          {l.arrival.dayOffset > 0 && <sup className="plus-day">+1</sup>} {l.to}
                        </div>
                        <div className="muted small">
                          <span className={`type-badge t-${l.busType}`}>{TYPE_ICON[l.busType]} {l.busTypeLabel}</span> {l.serviceNo} · {duration(l.durationMinutes)} · {rupees(l.fare)} ·{' '}
                          {l.seatsLeft > 0 ? t('results.seatsLeft', { n: l.seatsLeft }) : t('results.full')}
                          {l.departureDate !== result.date && ` · ${niceDate(l.departureDate)}`}
                        </div>
                      </div>
                      <div className="leg-actions">
                        <Link className="btn btn-sm btn-primary" to={`/trip/${l.scheduleId}/${l.travelDate}?from=${l.fromStopId}&to=${l.toStopId}`}>{t('conn.book')}</Link>
                        <Link className="btn btn-sm btn-outline" to={`/track/${l.scheduleId}/${l.travelDate}`}>📍</Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Tilt>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- home extras */

function HomeExtras({ places, routesCount, recent, lang, onTrip }) {
  const { t, setTheme } = usePrefs();
  const navigate = useNavigate();
  const openSos = useSos();
  const [panel, setPanel] = useState(null); // 'pnr' | 'types' | 'conc'

  const quick = [
    ['pnr', '🎫', () => setPanel(panel === 'pnr' ? null : 'pnr')],
    ['departures', '🚏', () => navigate('/departures')],
    ['track', '📍', () => navigate('/bookings')],
    ['types', '🚌', () => setPanel('types')],
    ['concessions', '🎟️', () => setPanel('conc')],
    ['safety', '🆘', openSos],
  ];

  return (
    <>
      <section className="stats-band rise">
        <div><b>{places.length || '37'}</b><span>{t('stats.towns')}</span></div>
        <div><b>{routesCount}</b><span>{t('stats.routes')}</span></div>
        <div><b>📡</b><span>{t('stats.live')}</span></div>
        <div><b>அ/A</b><span>{t('stats.langs')}</span></div>
      </section>

      <section>
        <h2 className="section-title">{t('quick.title')}</h2>
        <div className="quick-grid">
          {quick.map(([k, icon, fn], i) => (
            <Tilt as="button" type="button" key={k} className={`quick-card rise q-${k}`} style={{ '--i': i }} onClick={fn} max={12}>
              <span className="quick-icon" aria-hidden="true">{icon}</span>
              <b>{t(`quick.${k}`)}</b>
              <span className="muted small">{t(`quick.${k}Desc`)}</span>
            </Tilt>
          ))}
        </div>
        {panel === 'pnr' && <PnrCheck />}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">{t('recent.title')}</h2>
          <div className="chips">
            {recent.map((r) => (
              <button key={`${r.from}-${r.to}`} type="button" className="chip recent-chip" onClick={() => onTrip(r.from, r.to)}>
                🕘 {r.from} → {r.to}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">{t('popular.title')}</h2>
        <p className="muted">{t('popular.sub')}</p>
        <div className="trip-grid">
          {POPULAR.map((p, i) => {
            const sw = THEMES.find((x) => x.id === p.theme).swatch;
            const [title, sub] = p[lang] || p.en;
            return (
              <Tilt
                as="button"
                type="button"
                key={`${p.from}-${p.to}`}
                className="trip-card rise"
                style={{ '--i': i, background: `linear-gradient(150deg, ${sw[2]} 0%, ${sw[1]} 55%, ${sw[0]} 100%)` }}
                onClick={() => {
                  setTheme(p.theme);
                  onTrip(p.from, p.to);
                }}
                max={14}
              >
                <span className="trip-emoji" aria-hidden="true">{p.emoji}</span>
                <span className="trip-title">{title}</span>
                <span className="trip-sub">{sub}</span>
                <span className="trip-route">{p.from} → {p.to}</span>
              </Tilt>
            );
          })}
        </div>
      </section>

      {panel === 'types' && <TypesModal onClose={() => setPanel(null)} />}
      {panel === 'conc' && <ConcessionsModal onClose={() => setPanel(null)} />}
    </>
  );
}

function PnrCheck() {
  const { t } = usePrefs();
  const [pnr, setPnr] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const check = async (e) => {
    e.preventDefault();
    setErr('');
    setRes(null);
    try {
      setRes(await api(`/pnr/${encodeURIComponent(pnr.trim())}`));
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="card pnr-card pop-in">
      <form className="row" onSubmit={check}>
        <input value={pnr} onChange={(e) => setPnr(e.target.value.toUpperCase())} placeholder={t('pnr.placeholder')} aria-label="PNR" required />
        <button className="btn btn-primary">{t('pnr.check')}</button>
      </form>
      {err && <div className="error-card">{err}</div>}
      {res && (
        <div className="pnr-result">
          <div className="row-between">
            <b className="mono">{res.pnr}</b>
            <span className={`status s-${res.status}`}>{STATUS_LABEL[res.status]}</span>
          </div>
          <div className="pnr-route">{res.from} → {res.to}</div>
          <div className="muted">
            {niceDate(res.travelDate)} · {clock12(res.departure.time)} · {res.busTypeLabel} · {res.serviceNo} · {res.seatCount} seat(s)
          </div>
          {res.status === 'confirmed' && (
            <Link className="btn btn-outline btn-sm" to={`/track/${res.scheduleId}/${res.travelDate}`}>📍 {t('results.track')}</Link>
          )}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal wide pop-in">
        <div className="row-between">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TypesModal({ onClose }) {
  const { t } = usePrefs();
  const info = {
    ordinary: 'Stops at most towns. Lowest fare. Best for short trips.',
    express: 'Fewer stops, comfortable 2+2 push-back seats.',
    ac: 'Air-conditioned 2+2 seats, charging points, water bottle.',
    sleeper: 'AC berths with blanket for overnight journeys.',
  };
  return (
    <Modal title={t('types.title')} onClose={onClose}>
      <div className="types-grid">
        {Object.keys(AMENITIES).map((k) => (
          <Tilt key={k} className={`type-card t-${k}`} max={10}>
            <span className="type-icon" aria-hidden="true">{TYPE_ICON[k]}</span>
            <b>{t(`type.${k}`)}</b>
            <p className="small">{info[k]}</p>
            <div className="amenities">{AMENITIES[k].map((a) => <span key={a}>{a}</span>)}</div>
          </Tilt>
        ))}
      </div>
    </Modal>
  );
}

function ConcessionsModal({ onClose }) {
  const { t } = usePrefs();
  const items = [
    ['👩', 'Women', 'Free travel on ordinary town buses under the state scheme. Show at boarding.'],
    ['🎓', 'Students', 'Free or concessional passes issued through your school or college.'],
    ['🧓', 'Senior citizens', 'Concession passes where available. Ask at the depot counter.'],
    ['♿', 'Persons with disabilities', 'Free travel pass (with escort where eligible), issued by the district office.'],
  ];
  return (
    <Modal title={t('conc.title')} onClose={onClose}>
      <div className="conc-list">
        {items.map(([icon, title, text]) => (
          <div key={title} className="conc-item">
            <span className="conc-icon" aria-hidden="true">{icon}</span>
            <div><b>{title}</b><p className="small muted">{text}</p></div>
          </div>
        ))}
      </div>
      <p className="notice small">Rules vary by bus type and district. Applying for concessions online is planned for a later version.</p>
    </Modal>
  );
}
