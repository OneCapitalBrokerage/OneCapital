import { useEffect, useState } from 'react';
import { ThemeContext } from './themeContextStore';

const STORAGE_KEY = 'wolf_theme';

function getInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  // Global default: light until user explicitly changes it.
  return 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const t = getInitialTheme();
    applyTheme(t);
    return t;
  });
  const [forcedTheme, setForcedTheme] = useState(null);
  const effectiveTheme = forcedTheme || theme;

  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggleTheme,
      forcedTheme,
      setForcedTheme,
      effectiveTheme,
      isDark: effectiveTheme === 'dark',
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
