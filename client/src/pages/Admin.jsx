// Admin console: routes + stops, buses, schedules, fares and driver accounts.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { rupees } from '../utils.js';

const TABS = ['Routes', 'Buses', 'Schedules', 'Fares', 'Drivers'];
const BUS_TYPES = ['ordinary', 'express', 'ac', 'sleeper'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useList(path) {
  const [rows, setRows] = useState([]);
  const reload = useCallback(() => api(path).then(setRows).catch(() => {}), [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [rows, reload];
}

export default function Admin() {
  const [tab, setTab] = useState('Routes');
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState(null);
  const [routes, reloadRoutes] = useList('/admin/routes');
  const [buses, reloadBuses] = useList('/admin/buses');
  const [schedules, reloadSchedules] = useList('/admin/schedules');
  const [fares, reloadFares] = useList('/admin/fares');
  const [drivers, reloadDrivers] = useList('/admin/drivers');

  const loadStats = useCallback(() => api('/admin/stats').then(setStats).catch(() => {}), []);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const run = async (fn, okText, reloadFn) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      reloadFn?.();
      loadStats();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e.message });
      return false;
    }
  };

  const remove = (path, reloadFn) => {
    if (window.confirm('Delete this item? This cannot be undone.')) run(() => api(path, { method: 'DELETE' }), 'Deleted.', reloadFn);
  };
  const toggle = (path, active, reloadFn) => run(() => api(path, { method: 'PATCH', body: { active } }), active ? 'Activated.' : 'Deactivated.', reloadFn);

  return (
    <div className="page">
      <h1>Admin</h1>
      {stats && (
        <div className="stats">
          <div><b>{stats.routes}</b><span>Routes</span></div>
          <div><b>{stats.buses}</b><span>Buses</span></div>
          <div><b>{stats.schedules}</b><span>Schedules</span></div>
          <div><b>{stats.confirmed_bookings}</b><span>Bookings</span></div>
          <div><b>{rupees(stats.revenue)}</b><span>Collected</span></div>
        </div>
      )}
      <div className="segmented scroll">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>
        ))}
      </div>
      {msg && <div className={msg.ok ? 'success-banner' : 'error-card'} role="status">{msg.text}</div>}

      {tab === 'Routes' && (
        <>
          <RouteForm onSubmit={(body) => run(() => api('/admin/routes', { method: 'POST', body }), 'Route added.', reloadRoutes)} />
          <div className="card">
            <h2>All routes</h2>
            <ul className="admin-list">
              {routes.map((r) => (
                <li key={r.id}>
                  <div>
                    <b>{r.code}</b> {r.name} {!r.active && <span className="pill muted">inactive</span>}
                    <div className="muted small">{r.stops.map((s) => s.name).join(' → ')} · {r.stops.at(-1)?.distance_km} km</div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-sm btn-outline" onClick={() => toggle(`/admin/routes/${r.id}`, !r.active, reloadRoutes)}>{r.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-sm btn-danger-outline" onClick={() => remove(`/admin/routes/${r.id}`, reloadRoutes)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'Buses' && (
        <>
          <SimpleForm
            title="Add bus"
            fields={[
              { name: 'regNo', label: 'Registration no.', placeholder: 'TN 01 N 2001' },
              { name: 'busType', label: 'Type', options: BUS_TYPES },
              { name: 'layout', label: 'Seat layout', options: ['2x2', '2x3', '1x2'], hint: '1x2 = sleeper' },
              { name: 'totalSeats', label: 'Seats', type: 'number', placeholder: '40' },
              { name: 'depot', label: 'Depot', placeholder: 'Chennai', required: false },
            ]}
            onSubmit={(body) => run(() => api('/admin/buses', { method: 'POST', body }), 'Bus added.', reloadBuses)}
          />
          <div className="card">
            <h2>All buses</h2>
            <ul className="admin-list">
              {buses.map((b) => (
                <li key={b.id}>
                  <div>
                    <b>{b.reg_no}</b> {b.bus_type} · {b.layout} · {b.total_seats} seats {!b.active && <span className="pill muted">inactive</span>}
                    <div className="muted small">Depot: {b.depot || '-'}</div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-sm btn-outline" onClick={() => toggle(`/admin/buses/${b.id}`, !b.active, reloadBuses)}>{b.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-sm btn-danger-outline" onClick={() => remove(`/admin/buses/${b.id}`, reloadBuses)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'Schedules' && (
        <>
          <ScheduleForm routes={routes} buses={buses} onSubmit={(body) => run(() => api('/admin/schedules', { method: 'POST', body }), 'Schedule added.', reloadSchedules)} />
          <div className="card">
            <h2>All schedules</h2>
            <ul className="admin-list">
              {schedules.map((s) => (
                <li key={s.id}>
                  <div>
                    <b>{s.departure_time.slice(0, 5)}</b> {s.route_code} {s.route_name} {!s.active && <span className="pill muted">inactive</span>}
                    <div className="muted small">
                      {s.service_no} · {s.reg_no} ({s.bus_type}) · {s.days.length === 7 ? 'Daily' : s.days.split('').map((d) => DAY_NAMES[d]).join(', ')}
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-sm btn-outline" onClick={() => toggle(`/admin/schedules/${s.id}`, !s.active, reloadSchedules)}>{s.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-sm btn-danger-outline" onClick={() => remove(`/admin/schedules/${s.id}`, reloadSchedules)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'Fares' && (
        <>
          <SimpleForm
            title="Set fare (full route, per seat)"
            fields={[
              { name: 'routeId', label: 'Route', options: routes.map((r) => [r.id, `${r.code} ${r.name}`]) },
              { name: 'busType', label: 'Bus type', options: BUS_TYPES },
              { name: 'amount', label: 'Fare (₹)', type: 'number', placeholder: '350' },
            ]}
            note="Passengers travelling part of the route pay in proportion to distance."
            onSubmit={(body) => run(() => api('/admin/fares', { method: 'POST', body }), 'Fare saved.', reloadFares)}
          />
          <div className="card">
            <h2>Fares</h2>
            <table className="pax">
              <thead><tr><th>Route</th><th>Type</th><th>Fare</th><th /></tr></thead>
              <tbody>
                {fares.map((f) => (
                  <tr key={f.id}>
                    <td>{f.route_code} {f.route_name}</td>
                    <td>{f.bus_type}</td>
                    <td>{rupees(f.amount)}</td>
                    <td><button className="btn btn-sm btn-danger-outline" onClick={() => remove(`/admin/fares/${f.id}`, reloadFares)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Drivers' && (
        <>
          <SimpleForm
            title="Register driver / conductor"
            note="Only registered crew can log in on the Driver portal (OTP or Google with this email)."
            fields={[
              { name: 'name', label: 'Name', placeholder: 'Full name' },
              { name: 'email', label: 'Email (for Google / email OTP)', type: 'email', required: false },
              { name: 'phone', label: 'Mobile', type: 'tel', required: false },
              { name: 'assignedBusId', label: 'Assigned bus (optional)', options: [['', 'Any bus'], ...buses.map((b) => [b.id, `${b.reg_no} (${b.bus_type})`])], required: false },
            ]}
            onSubmit={(body) => run(() => api('/admin/drivers', { method: 'POST', body }), 'Driver registered.', reloadDrivers)}
          />
          <div className="card">
            <h2>Drivers</h2>
            <ul className="admin-list">
              {drivers.map((d) => (
                <li key={d.id}>
                  <div>
                    <b>{d.name}</b>
                    <div className="muted small">
                      {[d.email, d.phone].filter(Boolean).join(' · ')} · Bus: {d.reg_no || 'any'} · {d.last_login_at ? 'has logged in' : 'never logged in'}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger-outline" onClick={() => remove(`/admin/drivers/${d.id}`, reloadDrivers)}>Remove access</button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function SimpleForm({ title, fields, onSubmit, note }) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.options ? (Array.isArray(f.options[0]) ? f.options[0][0] : f.options[0]) ?? '' : '']));
  const [v, setV] = useState(initial);
  // Fill select defaults once option lists load (e.g. routes from the API).
  useEffect(() => {
    setV((cur) => {
      const next = { ...cur };
      fields.forEach((f) => {
        if (f.options && !cur[f.name] && f.options.length) next[f.name] = Array.isArray(f.options[0]) ? f.options[0][0] : f.options[0];
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.map((f) => f.options?.length).join()]);

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...v };
    fields.forEach((f) => {
      if (f.type === 'number') body[f.name] = Number(body[f.name]);
    });
    if (await onSubmit(body)) setV(initial());
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label} {f.hint && <span className="muted small">({f.hint})</span>}
            {f.options ? (
              <select value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                {f.options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
              </select>
            ) : (
              <input type={f.type || 'text'} required={f.required !== false} placeholder={f.placeholder} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button className="btn btn-primary">Save</button>
    </form>
  );
}

function RouteForm({ onSubmit }) {
  const blank = { name: '', lat: '', lng: '' };
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stops, setStops] = useState([{ ...blank }, { ...blank }]);
  const setStop = (i, k, val) => setStops((s) => s.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit({ code, name, stops: stops.map((s) => ({ name: s.name, lat: Number(s.lat), lng: Number(s.lng) })) });
    if (ok) {
      setCode('');
      setName('');
      setStops([{ ...blank }, { ...blank }]);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Add route</h2>
      <p className="muted small">Add stops in travel order. Distances and timings are worked out from the coordinates (you can copy them from any map app).</p>
      <div className="form-grid">
        <label>Route code<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="401" /></label>
        <label>Route name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Salem - Madurai" /></label>
      </div>
      {stops.map((s, i) => (
        <div key={i} className="stop-row">
          <span className="stop-num">{i + 1}</span>
          <input required placeholder="Stop name" value={s.name} onChange={(e) => setStop(i, 'name', e.target.value)} aria-label={`Stop ${i + 1} name`} />
          <input required placeholder="Latitude" inputMode="decimal" value={s.lat} onChange={(e) => setStop(i, 'lat', e.target.value)} aria-label={`Stop ${i + 1} latitude`} />
          <input required placeholder="Longitude" inputMode="decimal" value={s.lng} onChange={(e) => setStop(i, 'lng', e.target.value)} aria-label={`Stop ${i + 1} longitude`} />
          {stops.length > 2 && <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => setStops(stops.filter((_, j) => j !== i))} aria-label="Remove stop">✕</button>}
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn btn-outline" onClick={() => setStops([...stops, { ...blank }])}>+ Add stop</button>
        <button className="btn btn-primary">Save route</button>
      </div>
    </form>
  );
}

function ScheduleForm({ routes, buses, onSubmit }) {
  const [routeId, setRouteId] = useState('');
  const [busId, setBusId] = useState('');
  const [serviceNo, setServiceNo] = useState('');
  const [time, setTime] = useState('06:00');
  const [days, setDays] = useState('0123456');

  const toggleDay = (d) => {
    const s = new Set(days.split(''));
    s.has(String(d)) ? s.delete(String(d)) : s.add(String(d));
    setDays([...s].sort().join(''));
  };

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ routeId: routeId || routes[0]?.id, busId: busId || buses[0]?.id, serviceNo, departureTime: time, days });
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Add schedule</h2>
      <div className="form-grid">
        <label>Route
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.code} {r.name}</option>)}
          </select>
        </label>
        <label>Bus
          <select value={busId} onChange={(e) => setBusId(e.target.value)}>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.reg_no} ({b.bus_type})</option>)}
          </select>
        </label>
        <label>Service no.<input value={serviceNo} onChange={(e) => setServiceNo(e.target.value)} placeholder="101X" /></label>
        <label>Departure time<input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="chips" role="group" aria-label="Running days">
        {DAY_NAMES.map((d, i) => (
          <button key={d} type="button" className={`chip ${days.includes(String(i)) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
        ))}
      </div>
      <button className="btn btn-primary" disabled={!days}>Save schedule</button>
    </form>
  );
}
