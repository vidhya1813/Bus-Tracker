// Viewer preferences: theme (Tamil Nadu landscapes), language (English / Tamil), text size.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS } from './i18n.js';

export const THEMES = [
  { id: 'nilgiri', emoji: '🌿', swatch: ['#0f5c3a', '#2f9a62', '#bfe9d6'] },
  { id: 'marina', emoji: '🌊', swatch: ['#06406e', '#1786c9', '#ffd29c'] },
  { id: 'gopuram', emoji: '🛕', swatch: ['#5b1520', '#d9480f', '#ffc94d'] },
  { id: 'kaveri', emoji: '🌾', swatch: ['#2b5a17', '#6cb52d', '#f3d34a'] },
];

const read = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};

const PrefsContext = createContext(null);

export function PrefsProvider({ children }) {
  const [theme, setTheme] = useState(() => read('govbus_theme', 'nilgiri'));
  const [lang, setLang] = useState(() => read('govbus_lang', 'en'));
  const [large, setLarge] = useState(() => read('govbus_textsize', 'normal') === 'large');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write('govbus_theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    write('govbus_lang', lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', large);
    write('govbus_textsize', large ? 'large' : 'normal');
  }, [large]);

  /** t('key', { n: 3 }) -> translated string with {placeholders} filled. */
  const t = useCallback(
    (key, vars) => {
      let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ theme, setTheme, lang, setLang, large, setLarge, t }), [theme, lang, large, t]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
