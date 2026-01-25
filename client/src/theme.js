const THEME_KEY = 'tm_theme';

export const getStoredTheme = () => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
};

export const getPreferredTheme = () => {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
  return 'light';
};

export const applyTheme = (theme) => {
  const finalTheme = theme === 'dark' ? 'dark' : 'light';
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = finalTheme;
  }
  try {
    localStorage.setItem(THEME_KEY, finalTheme);
  } catch {
    // ignore
  }
  return finalTheme;
};

export const initTheme = () => {
  return applyTheme(getPreferredTheme());
};

export const toggleTheme = () => {
  const current = (typeof document !== 'undefined' && document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : getPreferredTheme();
  return applyTheme(current === 'dark' ? 'light' : 'dark');
};
