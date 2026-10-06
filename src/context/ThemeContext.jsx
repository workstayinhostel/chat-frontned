import { createContext, useContext, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const DEFAULT_THEME = { style: 'standard', blur: 16, opacity: 32 };

function readTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('metufy-glass-theme') || 'null');
    return {
      style: saved?.style === 'glass' ? 'glass' : 'standard',
      blur: Number.isFinite(Number(saved?.blur)) ? Math.max(0, Math.min(24, Number(saved.blur))) : DEFAULT_THEME.blur,
      opacity: Number.isFinite(Number(saved?.opacity)) ? Math.max(10, Math.min(60, Number(saved.opacity))) : DEFAULT_THEME.opacity
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme);
  const bounded = (value, min, max, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
  };
  const updateTheme = update => {
    setTheme(current => {
      const next = { ...current, ...update };
      try {
        localStorage.setItem('metufy-glass-theme', JSON.stringify(next));
      } catch (error) {
        console.warn('Could not save appearance settings:', error);
      }
      return next;
    });
  };
  const value = useMemo(() => ({
    theme,
    setStyle: style => updateTheme({ style: style === 'glass' ? 'glass' : 'standard' }),
    setBlur: blur => updateTheme({ blur: bounded(blur, 0, 24, DEFAULT_THEME.blur) }),
    setOpacity: opacity => updateTheme({ opacity: bounded(opacity, 10, 60, DEFAULT_THEME.opacity) })
  }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}

export function glassStyle(theme) {
  return {
    '--glass-blur': `${theme.blur}px`,
    '--glass-opacity': `${100 - theme.opacity}%`,
    '--glass-highlight': theme.style === 'glass' ? 'rgba(255,255,255,.3)' : 'transparent'
  };
}
