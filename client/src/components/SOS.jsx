// Floating safety button: call emergency numbers or share a live-location link.
import { useEffect, useState } from 'react';
import { usePrefs } from '../prefs.jsx';

export function useSos() {
  return () => window.dispatchEvent(new Event('govbus:sos'));
}

export default function SOS() {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('govbus:sos', show);
    return () => window.removeEventListener('govbus:sos', show);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const share = () => {
    setMsg('');
    if (!navigator.geolocation) return setMsg('Location is not available on this device.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const url = `https://maps.google.com/?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`;
        const text = `I need help. My live location: ${url}`;
        try {
          if (navigator.share) await navigator.share({ title: 'SOS', text });
          else {
            await navigator.clipboard.writeText(text);
            setMsg(t('sos.shared'));
          }
        } catch {
          setMsg(url);
        }
      },
      () => setMsg('Please allow location access to share it.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <>
      <button type="button" className="sos-fab" onClick={() => setOpen(true)} aria-label="SOS emergency help">
        {t('sos.button')}
      </button>
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sos-title" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="card modal sos-modal pop-in">
            <h2 id="sos-title">🆘 {t('sos.title')}</h2>
            <p className="muted">{t('sos.sub')}</p>
            <div className="sos-grid">
              <a className="sos-call red" href="tel:112"><b>112</b><span>{t('sos.police')}</span></a>
              <a className="sos-call pink" href="tel:181"><b>181</b><span>{t('sos.women')}</span></a>
              <a className="sos-call green" href="tel:108"><b>108</b><span>{t('sos.ambulance')}</span></a>
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={share}>📍 {t('sos.share')}</button>
            {msg && <p className="notice small" role="status">{msg}</p>}
            <button type="button" className="btn btn-outline btn-block" onClick={() => setOpen(false)}>{t('sos.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}
