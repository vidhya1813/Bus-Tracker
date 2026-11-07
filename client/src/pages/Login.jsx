// Login / sign up for two portals: passengers (/login) and drivers/conductors (/driver/login).
// Methods: email-or-mobile + password (with OTP-verified sign up and forgot password), one-time code, or Google.
import { useCallback, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import Scenery from '../components/Scenery.jsx';

const channelOf = (v) => (v.includes('@') ? 'email' : 'phone');

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  return s;
}
const STRENGTH = [
  ['Too short', '#e03131'],
  ['Weak', '#e8590c'],
  ['Fair', '#f59f00'],
  ['Good', '#66a80f'],
  ['Strong', '#2b8a3e'],
];

function PasswordField({ label, value, onChange, autoComplete, showMeter = false, id }) {
  const [show, setShow] = useState(false);
  const s = strength(value);
  const rules = [
    [value.length >= 8, '8 or more characters'],
    [/[A-Za-z]/.test(value) && /\d/.test(value), 'a letter and a number'],
  ];
  return (
    <label htmlFor={id}>
      {label}
      <span className="pw-field">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={showMeter ? 8 : 1}
          maxLength={128}
          required
        />
        <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? '🙈' : '👁️'}
        </button>
      </span>
      {showMeter && value && (
        <span className="pw-meter" aria-live="polite">
          <span className="pw-bar"><span style={{ width: `${(s / 4) * 100}%`, background: STRENGTH[s][1] }} /></span>
          <span className="small" style={{ color: STRENGTH[s][1] }}>{STRENGTH[s][0]}</span>
        </span>
      )}
      {showMeter && (
        <span className="pw-rules">
          {rules.map(([ok, text]) => (
            <span key={text} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {text}</span>
          ))}
        </span>
      )}
    </label>
  );
}

function DevCode({ code }) {
  if (!code) return null;
  return (
    <div className="notice">
      Demo mode (no SMS/email service connected): your code is <b className="mono">{code}</b>
    </div>
  );
}

function CodeInput({ value, onChange }) {
  return (
    <label>
      6-digit code
      <input
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="\d{6}"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        required
        autoFocus
      />
    </label>
  );
}

export default function Login({ portal }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDriver = portal === 'driver';

  const [method, setMethod] = useState('password'); // password | otp
  const [view, setView] = useState('login'); // password views: login | signup | forgot
  const [step, setStep] = useState('enter'); // enter | code
  const [channel, setChannel] = useState('phone'); // OTP tab
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const after = location.state?.from || (isDriver ? '/driver' : '/');

  const finish = useCallback(
    (session) => {
      setDone(true);
      login(session);
      const staff = ['driver', 'admin'].includes(session.user.role);
      navigate(isDriver && staff ? '/driver' : after, { replace: true });
    },
    [login, navigate, isDriver, after],
  );
  const onGoogleError = useCallback((m) => setError(m), []);

  if (user && !done) return <Navigate to={after} replace />;

  const reset = (next = {}) => {
    setError('');
    setInfo('');
    setStep('enter');
    setCode('');
    setDevCode('');
    setPassword('');
    setConfirm('');
    if (next.method) setMethod(next.method);
    if (next.view) setView(next.view);
  };

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (purpose, ch) =>
    run(async () => {
      const r = await api('/auth/otp/send', { method: 'POST', body: { channel: ch, identifier, portal, purpose } });
      setIdentifier(r.identifier);
      setDevCode(r.devCode || '');
      setCode('');
      setStep('code');
      if (purpose === 'reset') setInfo(`If an account exists for ${r.identifier}, we have sent it a 6-digit code.`);
    });

  // ---- password: login
  const doLogin = (e) => {
    e.preventDefault();
    run(async () => finish(await api('/auth/password/login', { method: 'POST', body: { identifier, password, portal } })));
  };

  // ---- password: sign up
  const startSignup = (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords do not match.');
    if (strength(password) < 2 || !(/[A-Za-z]/.test(password) && /\d/.test(password))) {
      return setError('Please choose a stronger password: 8+ characters with a letter and a number.');
    }
    sendCode('register', channelOf(identifier));
  };
  const finishSignup = (e) => {
    e.preventDefault();
    run(async () =>
      finish(
        await api('/auth/password/register', {
          method: 'POST',
          body: { channel: channelOf(identifier), identifier, code, password, name, portal },
        }),
      ),
    );
  };

  // ---- password: forgot
  const startForgot = (e) => {
    e.preventDefault();
    sendCode('reset', channelOf(identifier));
  };
  const finishForgot = (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords do not match.');
    run(async () =>
      finish(await api('/auth/password/reset', { method: 'POST', body: { channel: channelOf(identifier), identifier, code, password, portal } })),
    );
  };

  // ---- OTP-only login
  const otpSend = (e) => {
    e?.preventDefault();
    sendCode('login', channel);
  };
  const otpVerify = (e) => {
    e.preventDefault();
    run(async () => finish(await api('/auth/otp/verify', { method: 'POST', body: { channel, identifier, code, portal, name: name || undefined } })));
  };

  const title = isDriver
    ? 'Driver / Conductor Login'
    : view === 'signup' && method === 'password'
      ? 'Create your account'
      : view === 'forgot' && method === 'password'
        ? 'Reset your password'
        : 'Welcome back';

  const identifierField = (
    <label>
      Email or mobile number
      <input
        type="text"
        inputMode="email"
        autoComplete="username"
        placeholder="name@example.com or 98765 43210"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
    </label>
  );

  return (
    <div className="page narrow">
      <div className={`card login-card ${isDriver ? 'driver-theme' : ''}`}>
        <Scenery compact />
        <h1>{title}</h1>
        <p className="muted">
          {isDriver
            ? 'For bus crew registered by the depot admin. Share live location and check tickets.'
            : view === 'signup'
              ? 'Sign up with your email or mobile number and a password. We will send a code to confirm it is yours.'
              : 'Log in to book tickets, see your trips and track your bus.'}
        </p>

        <div className="segmented" role="tablist" aria-label="Login method">
          <button type="button" role="tab" aria-selected={method === 'password'} className={method === 'password' ? 'on' : ''} onClick={() => reset({ method: 'password', view: 'login' })}>
            🔑 Password
          </button>
          <button type="button" role="tab" aria-selected={method === 'otp'} className={method === 'otp' ? 'on' : ''} onClick={() => reset({ method: 'otp' })}>
            📩 One-time code
          </button>
        </div>

        {/* ------------------------------ PASSWORD ------------------------------ */}
        {method === 'password' && view === 'login' && (
          <form onSubmit={doLogin} className="stack pop-in" key="login">
            {identifierField}
            <PasswordField id="pw-login" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
            <div className="row-between">
              <span />
              <button type="button" className="linkish" onClick={() => reset({ view: 'forgot' })}>Forgot password?</button>
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
            <p className="center">
              {isDriver ? 'First time here? ' : 'New to GovBus? '}
              <button type="button" className="linkish" onClick={() => reset({ view: 'signup' })}>
                {isDriver ? 'Set your password' : 'Create an account'}
              </button>
            </p>
          </form>
        )}

        {method === 'password' && view === 'signup' && step === 'enter' && (
          <form onSubmit={startSignup} className="stack pop-in" key="signup">
            {!isDriver && (
              <label>
                Full name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="As on your ID" required />
              </label>
            )}
            {identifierField}
            <PasswordField id="pw-new" label="Create password" value={password} onChange={setPassword} autoComplete="new-password" showMeter />
            <PasswordField id="pw-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm && password !== confirm && <span className="small warn">Passwords do not match yet</span>}
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending code…' : 'Send verification code'}</button>
            <p className="center">
              Already have an account?{' '}
              <button type="button" className="linkish" onClick={() => reset({ view: 'login' })}>Log in</button>
            </p>
          </form>
        )}

        {method === 'password' && view === 'signup' && step === 'code' && (
          <form onSubmit={finishSignup} className="stack pop-in" key="signup-code">
            <p>
              We sent a code to <b>{identifier}</b>.{' '}
              <button type="button" className="linkish" onClick={() => setStep('enter')}>Change</button>
            </p>
            <DevCode code={devCode} />
            <CodeInput value={code} onChange={setCode} />
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6}>{busy ? 'Creating…' : 'Create account'}</button>
            <button type="button" className="linkish" onClick={() => sendCode('register', channelOf(identifier))} disabled={busy}>Resend code</button>
          </form>
        )}

        {method === 'password' && view === 'forgot' && step === 'enter' && (
          <form onSubmit={startForgot} className="stack pop-in" key="forgot">
            <p className="muted small">Enter the email or mobile number on your account. We will send a code so you can choose a new password. (Signed up with OTP or Google? This also lets you add a password.)</p>
            {identifierField}
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
            <p className="center"><button type="button" className="linkish" onClick={() => reset({ view: 'login' })}>← Back to login</button></p>
          </form>
        )}

        {method === 'password' && view === 'forgot' && step === 'code' && (
          <form onSubmit={finishForgot} className="stack pop-in" key="forgot-code">
            {info && <p className="small muted">{info}</p>}
            <DevCode code={devCode} />
            <CodeInput value={code} onChange={setCode} />
            <PasswordField id="pw-reset" label="New password" value={password} onChange={setPassword} autoComplete="new-password" showMeter />
            <PasswordField id="pw-reset2" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6}>{busy ? 'Saving…' : 'Save password and log in'}</button>
            <button type="button" className="linkish" onClick={() => setStep('enter')}>Use a different email or mobile</button>
          </form>
        )}

        {/* -------------------------------- OTP -------------------------------- */}
        {method === 'otp' && step === 'enter' && (
          <form onSubmit={otpSend} className="stack pop-in" key="otp">
            <div className="chips" role="group" aria-label="Send code by">
              <button type="button" className={`chip ${channel === 'phone' ? 'on' : ''}`} onClick={() => setChannel('phone')}>📱 Mobile</button>
              <button type="button" className={`chip ${channel === 'email' ? 'on' : ''}`} onClick={() => setChannel('email')}>✉️ Email</button>
            </div>
            <label>
              {channel === 'phone' ? 'Mobile number' : 'Email address'}
              <input
                type={channel === 'phone' ? 'tel' : 'email'}
                inputMode={channel === 'phone' ? 'numeric' : 'email'}
                autoComplete={channel === 'phone' ? 'tel' : 'email'}
                placeholder={channel === 'phone' ? '98765 43210' : 'name@example.com'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </label>
            <p className="muted small">No password needed. New users get an account automatically.</p>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </form>
        )}

        {method === 'otp' && step === 'code' && (
          <form onSubmit={otpVerify} className="stack pop-in" key="otp-code">
            <p>
              We sent a 6-digit code to <b>{identifier}</b>.{' '}
              <button type="button" className="linkish" onClick={() => setStep('enter')}>Change</button>
            </p>
            <DevCode code={devCode} />
            <CodeInput value={code} onChange={setCode} />
            {!isDriver && (
              <label>
                Your name <span className="muted small">(for new accounts)</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Full name" />
              </label>
            )}
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify and continue'}</button>
            <button type="button" className="linkish" onClick={otpSend} disabled={busy}>Resend code</button>
          </form>
        )}

        {error && (
          <div className="error-card" role="alert">
            {error}
            {/wrong email\/mobile number or password/i.test(error) && (
              <div className="small">Signed up with a one-time code or Google? Use “Forgot password?” to set a password.</div>
            )}
          </div>
        )}

        <div className="divider"><span>or</span></div>
        <GoogleButton portal={portal} onSuccess={finish} onError={onGoogleError} />

        <p className="switch-portal">
          {isDriver ? (
            <>Passenger? <Link to="/login">Passenger login</Link></>
          ) : (
            <>Bus crew? <Link to="/driver/login">Driver / Conductor login</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
