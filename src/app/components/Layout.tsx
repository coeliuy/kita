/** The app's frame: top bar with the running timer, sidebar on desktop, tab bar on mobile. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatHM, sumMinutes } from '../../lib/money';
import { clockText, today } from '../lib/format';
import { activeClients, clientById, entriesIn } from '../lib/selectors';
import { useRouter, type View } from '../router';
import { useKita } from '../store/KitaProvider';
import { rememberTheme, shownTheme, storedTheme } from '../lib/theme';
import { AskDoneSheet } from './AskDoneSheet';
import { FeedbackDialog, openFeedback } from './Feedback';
import { requestIntent } from './intents';
import { QuickStart } from './QuickStart';
import { Icon, useNow } from './ui';

const NAV: [View, string][] = [
  ['today', 'Today'], ['track', 'Track'], ['overview', 'Overview'], ['clients', 'Clients'], ['invoices', 'Invoices'],
  ['expenses', 'Expenses'], ['money', 'Money'], ['settings', 'Settings'],
];
const TABS: [View, string][] = [['today', 'Today'], ['track', 'Track'], ['overview', 'Overview'], ['invoices', 'Invoices'], ['more', 'More']];
const UNDER_MORE: View[] = ['money', 'clients', 'expenses', 'settings', 'more'];

function TimerPill() {
  const { data, stopTimer } = useKita();
  const t = data.timer;
  const now = useNow(!!t);
  if (!t) {
    const d = today();
    return <div className="pill"><span>Today {formatHM(sumMinutes(entriesIn(data, d, d)))}</span></div>;
  }
  const c = clientById(data, t.clientId);
  return (
    <div className="pill on">
      <span className="live" aria-hidden="true" />
      <span className="who"><b>{c ? c.name : 'Unknown client'}</b>{t.task ? ` · ${t.task}` : ''}</span>
      <b>{clockText(now - t.startedAt)}</b>
      <button className="btn sm stop" onClick={() => stopTimer(true)}>Stop</button>
    </div>
  );
}

/** The Kita logo: a K in a circle. */
export const Logo = () => (
  <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="var(--accent)" />
    <path d="M9 6.5v11M9 12.2l5.8-5.2M10.7 10.8l4.6 6.5" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
  </svg>
);

const BASE_TITLE = 'Kita';

/** Switches between light and dark mode. */
function ThemeToggle() {
  const { data, updateSettings } = useKita();
  const shown = shownTheme(data.settings.theme || storedTheme());
  const next = shown === 'dark' ? 'light' : 'dark';
  return (
    <button className="ibtn theme-toggle" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      onClick={() => { rememberTheme(next); updateSettings({ theme: next }); }}>
      <Icon name={shown === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { view, go } = useRouter();
  const { data, stopTimer, toast, askDone } = useKita();
  const [quick, setQuick] = useState(false);
  const tab = UNDER_MORE.includes(view) ? 'more' : view;
  const t = data.timer;
  const now = useNow(!!t);
  const canTrack = activeClients(data).length > 0;
  const openQuick = useCallback(() => {
    if (canTrack) setQuick(true);
    else toast('Add a client first.');
  }, [canTrack, toast]);

  // The running timer in the browser tab's title, e.g. "1:05 LinkedIn posts · Kita"
  useEffect(() => {
    if (!t) { document.title = BASE_TITLE; return; }
    const m = Math.max(0, Math.floor((now - t.startedAt) / 60000));
    document.title = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ${t.task || clientById(data, t.clientId)?.name || ''} · Kita`;
  }, [t, now, data]);
  useEffect(() => () => { document.title = BASE_TITLE; }, []);

  // Keyboard shortcuts: Space starts or stops, N adds a task, ⌘K or / opens quick start, ? lists them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openQuick(); return; }
      const el = e.target as HTMLElement;
      const tag = el.tagName?.toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'summary'].includes(tag) || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || quick || askDone || document.getElementById('pop')) return;
      if (e.key === ' ') { e.preventDefault(); if (t) stopTimer(true); else openQuick(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); go('track'); requestIntent('newTask'); }
      else if (e.key === '/') { e.preventDefault(); openQuick(); }
      else if (e.key === '?') { e.preventDefault(); toast('Shortcuts: Space to start or stop, N for a new task, ⌘K or / to search.'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [t, quick, askDone, openQuick, stopTimer, go, toast]);
  return (
    <>
      <header className="top">
        <a className="brand" href="/" aria-label="About Kita" style={{ color: 'inherit', textDecoration: 'none' }}><Logo />Kita</a>
        <TimerPill />
        <ThemeToggle />
      </header>
      <div className="app">
        <nav id="nav" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} onClick={() => go(k)} aria-current={view === k ? 'page' : undefined}><Icon name={k} /><span>{label}</span></button>
          ))}
          <div className="spacer" />
          <a href="/" className="navlink"><Icon name="home" /><span>About Kita</span></a>
          <button onClick={openFeedback}><Icon name="feedback" /><span>Send feedback</span></button>
        </nav>
        <main id="view"><div className="view">{children}</div></main>
      </div>
      <div id="tabbar" role="navigation" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}><Icon name={k} /><span>{label}</span></button>
        ))}
      </div>
      <button id="fab" className={t ? 'on' : ''} aria-label={t ? 'Stop the timer' : 'Start a timer'} onClick={() => (t ? stopTimer(true) : openQuick())}>
        {t ? <><Icon name="stop" /><span>{clockText(now - t.startedAt)}</span></> : <Icon name="play" />}
      </button>
      <AskDoneSheet />
      <FeedbackDialog />
      {quick && <QuickStart onClose={() => setQuick(false)} />}
    </>
  );
}
