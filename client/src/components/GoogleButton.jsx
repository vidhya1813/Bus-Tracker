// Google Identity Services button. Falls back to a local demo sign-in
// when no client ID is configured (server must be in non-production mode).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let s = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!s) {
      s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Could not load Google Sign-In')));
  });
}

export default function GoogleButton({ portal, onSuccess, onError }) {
  const { serverConfig } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || serverConfig.googleClientId;
  const ref = useRef(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoEmail, setDemoEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            try {
              onSuccess(await api('/auth/google', { method: 'POST', body: { credential, portal } }));
            } catch (e) {
              onError(e.message);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: Math.min(360, ref.current.offsetWidth || 320),
        });
      })
      .catch((e) => onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, portal, onSuccess, onError]);

  if (clientId) return <div ref={ref} className="google-slot" />;
  if (!serverConfig.googleDemo) return null;

  const submitDemo = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSuccess(await api('/auth/google/demo', { method: 'POST', body: { email: demoEmail, portal } }));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return demoOpen ? (
    <form onSubmit={submitDemo} className="google-demo">
      <p className="muted small">
        Demo Google sign-in (no Google Client ID configured yet). Enter the Gmail address to sign in as.
      </p>
      <input type="email" required value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} placeholder="you@gmail.com" aria-label="Google email" />
      <button className="btn btn-google" disabled={busy}>
        {busy ? 'Signing in…' : 'Continue'}
      </button>
    </form>
  ) : (
    <button type="button" className="btn btn-google" onClick={() => setDemoOpen(true)}>
      <GoogleG /> Continue with Google
    </button>
  );
}

const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
