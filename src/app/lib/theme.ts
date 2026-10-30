/**
 * Light and dark mode. The choice is saved with the account (Settings) and
 * also remembered in this browser, so the homepage and sign-in screen match
 * it before anything has loaded.
 */
import type { Theme } from '../store/types';

const KEY = 'kita-theme';

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : '';
  } catch {
    return '';
  }
}

export function rememberTheme(theme: Theme) {
  try {
    if (theme) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing can block storage; the account setting still applies.
  }
}

export function applyTheme(theme: Theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** The theme actually showing: the chosen one, or the device's. */
export const shownTheme = (theme: Theme): 'light' | 'dark' =>
  theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
