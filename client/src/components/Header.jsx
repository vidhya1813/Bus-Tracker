import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { THEMES, usePrefs } from '../prefs.jsx';

function ThemePicker() {
  const { theme, setTheme, t } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const current = THEMES.find((x) => x.id === theme) || THEMES[0];
  return (
    <div className="theme-picker" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('theme.title')} title={t('theme.title')}>
        <span aria-hidden="true">{current.emoji}</span>
      </button>
      {open && (
        <div className="theme-pop" role="menu">
          <div className="theme-pop-title">{t('theme.title')}</div>
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === th.id}
              className={`theme-opt ${theme === th.id ? 'on' : ''}`}
              onClick={() => {
                setTheme(th.id);
                setOpen(false);
              }}
            >
              <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${th.swatch[2]} 0%, ${th.swatch[1]} 55%, ${th.swatch[0]} 100%)` }}>
                {th.emoji}
              </span>
              <span>{t(`theme.${th.id}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { user, logout, serverConfig } = useAuth();
  const { lang, setLang, large, setLarge, t } = usePrefs();
  const navigate = useNavigate();
  const isStaff = user && (user.role === 'driver' || user.role === 'admin');
  const doLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="GovBus home">
          <span className="brand-badge" aria-hidden="true">
            <span>GB</span>
          </span>
          <span className="brand-text">
            GovBus<small>{lang === 'ta' ? 'அரசுப் பேருந்து' : 'Tamil Nadu'}</small>
          </span>
        </Link>
        <nav className="nav desktop-only" aria-label="Main">
          <NavLink to="/" end>{t('nav.home')}</NavLink>
          <NavLink to="/departures">{t('nav.departures')}</NavLink>
          {user && <NavLink to="/bookings">{t('nav.tickets')}</NavLink>}
          {serverConfig.demoMode && <NavLink to="/credentials">🔑 {t('nav.credentials')}</NavLink>}
          {isStaff && <NavLink to="/driver">{t('nav.driver')}</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
        </nav>
        <div className="top-tools">
          <button type="button" className="lang-btn" onClick={() => setLang(lang === 'en' ? 'ta' : 'en')} aria-label="Change language / மொழியை மாற்று">
            <span className={lang === 'en' ? 'on' : ''}>EN</span>
            <span className={lang === 'ta' ? 'on' : ''}>தமிழ்</span>
          </button>
          <ThemePicker />
          <button type="button" className="icon-btn" onClick={() => setLarge(!large)} aria-pressed={large} title="Text size">
            {large ? 'A−' : 'A+'}
          </button>
          <span className="desktop-only">
            {user ? (
              <button type="button" className="pill-btn" onClick={doLogout}>{t('nav.logout')}</button>
            ) : (
              <Link to="/login" className="pill-btn">{t('nav.login')}</Link>
            )}
          </span>
        </div>
      </header>

      {/* App-style bottom navigation on phones */}
      <nav className="bottom-nav mobile-only" aria-label="Main">
        <NavLink to="/" end><span aria-hidden="true">🏠</span>{t('nav.home')}</NavLink>
        <NavLink to="/departures"><span aria-hidden="true">🚏</span>{t('nav.departures')}</NavLink>
        <NavLink to="/bookings"><span aria-hidden="true">🎫</span>{t('nav.tickets')}</NavLink>
        {isStaff ? (
          <NavLink to={user.role === 'admin' ? '/admin' : '/driver'}><span aria-hidden="true">🧑‍✈️</span>{t(user.role === 'admin' ? 'nav.admin' : 'nav.driver')}</NavLink>
        ) : user ? (
          <button type="button" onClick={doLogout}><span aria-hidden="true">👋</span>{t('nav.logout')}</button>
        ) : (
          <NavLink to="/login"><span aria-hidden="true">👤</span>{t('nav.login')}</NavLink>
        )}
      </nav>
    </>
  );
}
