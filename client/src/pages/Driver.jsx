// Driver / conductor screen: choose today's trip, share GPS (real or simulated), check tickets.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { clock12, todayLocal } from '../utils.js';
import LiveMap from '../components/LiveMap.jsx';

const SEND_EVERY_MS = 5000;
const SIM_TICK_MS = 2000;
const SIM_KM_PER_TICK = 1.5; // fast-forward so a demo trip takes a few minutes

const toRad = (d) => (d * Math.PI) / 180;
function kmBetween(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

export default function Driver() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayLocal());
  const [trips, setTrips] = useState([]);
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [mode, setMode] = useState('off'); // off | gps | sim
  const [last, setLast] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [passengers, setPassengers] = useState([]);
  const [code, setCode] = useState('');
  const [boardMsg, setBoardMsg] = useState(null);
  const [scanning, setScanning] = useState(false);
  const stopRef = useRef(() => {});
  const videoRef = useRef(null);

  useEffect(() => {
    api(`/driver/trips?date=${date}`).then((d) => setTrips(d.trips)).catch((e) => setGpsError(e.message));
  }, [date]);

  const loadPassengers = useCallback(async (t) => {
    if (!t) return;
    setPassengers(await api(`/driver/trips/${t.scheduleId}/${date}/passengers`));
  }, [date]);

  const pickTrip = async (t) => {
    stopRef.current();
    setMode('off');
    setTrip(t);
    setLast(null);
    setBoardMsg(null);
    const tr = await api(`/track/${t.scheduleId}/${date}`);
    setStops(tr.stops);
    setLast(tr.location);
    loadPassengers(t);
  };

  const send = useCallback(
    async (pos) => {
      try {
        const r = await api('/driver/gps', { method: 'POST', body: { scheduleId: trip.scheduleId, travelDate: date, ...pos } });
        setLast({ ...pos, speed_kmh: pos.speedKmh, recorded_at: new Date().toISOString(), offRouteKm: r.offRouteKm });
        setGpsError('');
      } catch (e) {
        setGpsError(e.message);
      }
    },
    [trip, date],
  );

  const startGps = () => {
    if (!navigator.geolocation) return setGpsError('This device has no GPS / location support.');
    let lastSent = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - lastSent < SEND_EVERY_MS) return;
        lastSent = Date.now();
        send({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : null,
          heading: p.coords.heading ?? null,
        });
      },
      (err) => setGpsError(err.code === 1 ? 'Location permission denied. Allow location access in the browser.' : err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    stopRef.current = () => navigator.geolocation.clearWatch(id);
    setMode('gps');
  };

  const startSim = () => {
    // Drive along the stops from the origin, a fixed distance per tick.
    let seg = 0;
    let along = 0;
    const tick = () => {
      while (seg < stops.length - 1) {
        const a = stops[seg], b = stops[seg + 1];
        const len = kmBetween(a, b);
        if (along + SIM_KM_PER_TICK <= len) {
          along += SIM_KM_PER_TICK;
          const f = along / len;
          send({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, speedKmh: 52, heading: null });
          return;
        }
        along = along + SIM_KM_PER_TICK - len;
        seg += 1;
      }
      const end = stops[stops.length - 1];
      send({ lat: end.lat, lng: end.lng, speedKmh: 0, heading: null });
      stopRef.current();
      setMode('off');
    };
    tick();
    const id = setInterval(tick, SIM_TICK_MS);
    stopRef.current = () => clearInterval(id);
    setMode('sim');
  };

  const stopSharing = () => {
    stopRef.current();
    stopRef.current = () => {};
    setMode('off');
  };

  useEffect(() => () => stopRef.current(), []);

  const board = async (body) => {
    setBoardMsg(null);
    try {
      const r = await api('/driver/board', { method: 'POST', body: { scheduleId: trip.scheduleId, travelDate: date, ...body } });
      setPassengers(r.passengers);
      if (body.qr || body.pnr) setBoardMsg({ ok: true, text: `✅ Valid ticket. Seats ${r.seats.join(', ')} marked boarded.` });
      setCode('');
    } catch (e) {
      setBoardMsg({ ok: false, text: `❌ ${e.message}` });
    }
  };

  const submitCode = (e) => {
    e.preventDefault();
    const v = code.trim();
    if (!v) return;
    board(v.startsWith('GOVBUS1:') ? { qr: v } : { pnr: v });
  };

  // Camera QR scanning where the browser supports BarcodeDetector (e.g. Chrome on Android).
  const scan = async () => {
    if (!('BarcodeDetector' in window)) {
      setBoardMsg({ ok: false, text: 'QR scanning is not supported in this browser. Type the PNR instead.' });
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      setBoardMsg({ ok: false, text: 'Camera permission denied.' });
      return;
    }
    setScanning(true);
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    await new Promise((r) => setTimeout(r, 50));
    const video = videoRef.current;
    video.srcObject = stream;
    await video.play();
    const stopCam = () => {
      stream.getTracks().forEach((t) => t.stop());
      setScanning(false);
    };
    const started = Date.now();
    const loop = async () => {
      if (!stream.active) return;
      try {
        const [hit] = await detector.detect(video);
        if (hit?.rawValue) {
          stopCam();
          board({ qr: hit.rawValue });
          return;
        }
      } catch {
        /* keep trying */
      }
      if (Date.now() - started > 30000) return stopCam();
      requestAnimationFrame(loop);
    };
    loop();
  };

  const boardedCount = passengers.filter((p) => p.boarded).length;

  return (
    <div className="page">
      <h1>Hello, {user?.name || 'Driver'} 👋</h1>

      {!trip ? (
        <div className="card">
          <div className="row-between wrap">
            <h2>Choose your trip</h2>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Trip date" />
          </div>
          {trips.length === 0 && <p className="muted">No trips scheduled for this date.</p>}
          <ul className="trip-pick">
            {trips.map((t) => (
              <li key={t.scheduleId}>
                <button className="trip-btn" onClick={() => pickTrip(t)}>
                  <b>{clock12(t.departureTime)}</b> {t.routeName}
                  <span className="muted small">{t.busTypeLabel} · {t.serviceNo} · {t.regNo}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row-between wrap">
              <div>
                <h2>{trip.routeName}</h2>
                <p className="muted">{clock12(trip.departureTime)} · {trip.busTypeLabel} · {trip.regNo} · {date}</p>
              </div>
              <button className="btn btn-outline" onClick={() => { stopSharing(); setTrip(null); }}>Change trip</button>
            </div>

            <div className={`share-panel ${mode !== 'off' ? 'on' : ''}`}>
              {mode === 'off' ? (
                <>
                  <button className="btn btn-primary btn-lg btn-block" onClick={startGps}>📡 Start sharing live location</button>
                  <button className="btn btn-outline btn-block" onClick={startSim}>🧪 Simulate trip (demo)</button>
                </>
              ) : (
                <>
                  <div className="live-status live"><span className="dot" /> {mode === 'gps' ? 'Sharing phone GPS' : 'Simulating drive'} — passengers can see the bus</div>
                  <button className="btn btn-danger btn-lg btn-block" onClick={stopSharing}>⏹ Stop sharing</button>
                </>
              )}
              {last && (
                <p className="muted small">
                  Last sent: {last.lat.toFixed(5)}, {last.lng.toFixed(5)}
                  {last.offRouteKm > 2 && <span className="warn"> · {last.offRouteKm} km away from route</span>}
                </p>
              )}
              {gpsError && <div className="error-card" role="alert">{gpsError}</div>}
              <p className="muted small">Keep this screen open while driving. Location is sent every few seconds.</p>
            </div>
          </div>

          {stops.length > 0 && <LiveMap stops={stops} location={last} />}

          <div className="card">
            <div className="row-between">
              <h2>Check tickets</h2>
              <span className="pill">{boardedCount}/{passengers.length} boarded</span>
            </div>
            <form className="row" onSubmit={submitCode}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter PNR e.g. GB12345678" aria-label="PNR or QR text" />
              <button className="btn btn-primary">Verify</button>
              <button type="button" className="btn btn-outline" onClick={scan}>📷 Scan QR</button>
            </form>
            {scanning && <video ref={videoRef} className="scanner" playsInline muted />}
            {boardMsg && <div className={boardMsg.ok ? 'success-banner' : 'error-card'}>{boardMsg.text}</div>}

            {passengers.length === 0 ? (
              <p className="muted">No confirmed bookings on this trip yet.</p>
            ) : (
              <table className="pax">
                <thead><tr><th>Seat</th><th>Passenger</th><th>Boards at</th><th>Boarded</th></tr></thead>
                <tbody>
                  {passengers.map((p) => (
                    <tr key={p.seatNo} className={p.boarded ? 'boarded-row' : ''}>
                      <td><b>{p.seatNo}</b></td>
                      <td>{p.name}<div className="muted small">{p.age} {p.gender?.[0]?.toUpperCase()} · {p.pnr} · to {p.to}</div></td>
                      <td>{p.from}<div className="muted small">{clock12(p.boardingTime)}</div></td>
                      <td>
                        <input
                          type="checkbox"
                          className="big-check"
                          checked={p.boarded}
                          onChange={(e) => board({ seatNo: p.seatNo, boarded: e.target.checked })}
                          aria-label={`Seat ${p.seatNo} boarded`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button className="linkish" onClick={() => loadPassengers(trip)}>↻ Refresh list</button>
          </div>
        </>
      )}
    </div>
  );
}
