// Login Credentials page: the demo accounts for each role, with copy buttons and one-tap login.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { usePrefs } from '../prefs.jsx';
import Tilt from '../components/Tilt.jsx';

const ROLE_STYLE = {
  admin: { icon: '🛠️', color: '#7048e8' },
  driver: { icon: '🧑‍✈️', color: '#e8590c' },
  passenger: { icon: '🧳', color: '#157347' },
};

function CopyField({ label, value, secret = false }) {
  const [show, setShow] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard blocked: the value is visible to select by hand */
      setShow(true);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="cred-field">
      <span className="cred-label">{label}</span>
      <code className="cred-value">{show ? value : '•'.repeat(value.length)}</code>
      {secret && (
        <button type="button" className="cred-btn" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label}` : `Show ${label}`}>
          {show ? '🙈' : '👁️'}
        </button>
      )}
      <button type="button" className="cred-btn" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? '✅' : '📋'}
      </button>
    </div>
  );
}

export default function Credentials() {
  const { user, login, logout } = useAuth();
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api('/auth/demo-accounts')
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, []);

  const loginAs = async (a) => {
    setBusy(a.email);
    setError('');
    try {
      if (user) logout();
      login(await api('/auth/password/login', { method: 'POST', body: { identifier: a.email, password: a.password, portal: a.portal } }));
      navigate(a.lands);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page">
      {!user && (
        <Link to="/login" className="back-login">← Back to login</Link>
      )}
      <div className="cred-hero rise">
        <span className="cred-hero-icon" aria-hidden="true">🔑</span>
        <div>
          <h1>{t('cred.title')}</h1>
          <p>{t('cred.sub')}</p>
        </div>
      </div>

      {error && !accounts && (
        <div className="card">
          <p>{error}.</p>
          <p className="muted">
            This server uses a real database, so there are no shared demo accounts. <Link to="/login">Create your own account</Link> instead.
          </p>
        </div>
      )}
      {error && accounts && <div className="error-card" role="alert">{error}</div>}
      {!accounts && !error && <p className="center muted">Loading…</p>}

      {accounts && (
        <>
          {user && (
            <div className="notice small">
              You are logged in as <b>{user.name || user.email || user.phone}</b> ({user.role}). Tapping “Log in as…” switches account.
            </div>
          )}
          <div className="cred-grid">
            {accounts.map((a, i) => {
              const style = ROLE_STYLE[a.role] || ROLE_STYLE.passenger;
              return (
                <Tilt key={a.email} className="card cred-card rise" style={{ '--i': i, '--role': style.color }} max={6}>
                  <div className="cred-head">
                    <span className="cred-icon" aria-hidden="true">{style.icon}</span>
                    <div>
                      <h2>{a.title}</h2>
                      <span className="muted small">{a.name.replace(/\s*\(.*\)$/, '')}</span>
                    </div>
                    <span className="cred-portal">{a.portal === 'driver' ? 'Driver portal' : 'Passenger login'}</span>
                  </div>

                  <CopyField label="Email" value={a.email} />
                  {a.phone && <CopyField label="Mobile" value={a.phone} />}
                  <CopyField label="Password" value={a.password} secret />

                  <ul className="cred-can">
                    {a.can.map((c) => <li key={c}>{c}</li>)}
                  </ul>

                  <button type="button" className="btn btn-primary btn-block cred-go" onClick={() => loginAs(a)} disabled={!!busy}>
                    {busy === a.email ? 'Logging in…' : `${t('cred.loginAs')} ${a.title} →`}
                  </button>
                  <Link className="small center cred-manual" to={a.portal === 'driver' ? '/driver/login' : '/login'}>
                    or type them on the {a.portal === 'driver' ? 'Driver / Conductor' : 'passenger'} login page
                  </Link>
                </Tilt>
              );
            })}
          </div>

          <div className="card cred-notes">
            <h2>Good to know</h2>
            <ul>
              <li><b>One-time codes:</b> every account can also log in with the <i>One-time code</i> tab. In demo mode the code appears on screen, because no SMS or email service is connected.</li>
              <li><b>Your own account:</b> <Link to="/login">Create an account</Link> with any email or mobile number. It is verified with a code shown on screen.</li>
              <li><b>Payments are fake:</b> the gateway is a demo. No card or bank details are asked for and no money moves.</li>
              <li><b>Demo data resets:</b> these accounts live in a temporary demo database. Bookings may disappear when the server restarts.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
