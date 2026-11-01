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

/** "Product" dropdown in the menu: opens on click, closes on Escape, outside clicks or choosing a link. */
const ddBtn = document.querySelector<HTMLButtonElement>('.dd-btn');
const ddMenu = document.querySelector<HTMLElement>('.dd-menu');
const setDd = (open: boolean) => { ddBtn?.setAttribute('aria-expanded', String(open)); ddMenu?.classList.toggle('open', open); };
ddBtn?.addEventListener('click', e => { e.stopPropagation(); setDd(ddBtn.getAttribute('aria-expanded') !== 'true'); });
ddMenu?.addEventListener('click', e => { if ((e.target as HTMLElement).closest('a')) setDd(false); });
document.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('.dd')) setDd(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ddBtn?.getAttribute('aria-expanded') === 'true') { setDd(false); ddBtn.focus(); } });

/** "One app. Every way you bill." tabs, with arrow-key support. */
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role=tab]')];
const select = (tab: HTMLButtonElement, focus = false) => {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !on;
  }
  if (focus) tab.focus();
};
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) { e.preventDefault(); select(tabs[(i + step + tabs.length) % tabs.length]!, true); }
  });
});

/** Menu button on small screens. */
const menuBtn = document.querySelector<HTMLButtonElement>('.menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const setMenu = (open: boolean) => { menuBtn?.setAttribute('aria-expanded', String(open)); if (mobileMenu) mobileMenu.hidden = !open; };
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
mobileMenu?.addEventListener('click', e => { if ((e.target as HTMLElement).closest('a')) setMenu(false); });
