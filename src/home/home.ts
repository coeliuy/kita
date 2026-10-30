/** The homepage: shared styles, and the light/dark switch. */
import '../styles/kita.css';
import { applyTheme, rememberTheme, shownTheme, storedTheme } from '../app/lib/theme';

const toggle = document.getElementById('themeToggle');
const show = () => {
  const shown = shownTheme(storedTheme());
  toggle?.setAttribute('aria-label', `Switch to ${shown === 'dark' ? 'light' : 'dark'} mode`);
  document.documentElement.classList.toggle('shown-dark', shown === 'dark');
};
toggle?.addEventListener('click', () => {
  const next = shownTheme(storedTheme()) === 'dark' ? 'light' : 'dark';
  rememberTheme(next);
  applyTheme(next);
  show();
});
show();
