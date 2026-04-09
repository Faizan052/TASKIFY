const THEME_KEY = 'tm_theme';

export const getStoredTheme = () => {
  return 'light';
};

export const getPreferredTheme = () => {
  return 'light';
};

export const applyTheme = () => {
  const finalTheme = 'light';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', finalTheme);
  }
  try {
    localStorage.setItem(THEME_KEY, finalTheme);
  } catch {
    // ignore
  }
  return finalTheme;
};

export const initTheme = () => {
  return applyTheme();
};

export const toggleTheme = () => {
  return applyTheme();
};
