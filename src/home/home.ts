/** The homepage: shared styles, the light/dark switch and the email updates form. */
import '../styles/kita.css';
import '../styles/home.css';
import { applyTheme, rememberTheme, shownTheme, storedTheme } from '../app/lib/theme';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../app/lib/supabaseConfig';

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
// Follow the device if it switches between light and dark while the page is open.
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', show);
show();

/** Email updates: adds the address to the mailing list through a database function that can only add. */
const form = document.getElementById('subscribe') as HTMLFormElement | null;
form?.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = form.querySelector<HTMLElement>('.sub-msg')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
  const trap = (form.elements.namedItem('website') as HTMLInputElement).value;
  const say = (text: string, ok: boolean) => { msg.textContent = text; msg.className = `sub-msg ${ok ? 'ok' : 'bad'}`; };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Enter your email address, like you@example.com.', false); return; }
  button.disabled = true;
  try {
    // Bots fill in the hidden field; they get the same thank-you without being added.
    if (!trap) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/subscribe`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'homepage' }),
      });
      if (!res.ok) throw new Error(String(res.status));
    }
    form.reset();
    say('Thanks, you’re on the list. We’ll be in touch when there’s news.', true);
  } catch {
    say('That didn’t go through. Check your connection and try again.', false);
  } finally {
    button.disabled = false;
  }
});
