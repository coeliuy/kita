/** The app's frame: top bar with the running timer, sidebar on desktop, tab bar on mobile. */
import type { ReactNode } from 'react';
import { formatHM, sumMinutes } from '../../lib/money';
import { clockText, today } from '../lib/format';
import { clientById, entriesIn } from '../lib/selectors';
import { useRouter, type View } from '../router';
import { useKita } from '../store/KitaProvider';
import { AskDoneSheet } from './AskDoneSheet';
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

export function Layout({ children }: { children: ReactNode }) {
  const { view, go } = useRouter();
  const tab = UNDER_MORE.includes(view) ? 'more' : view;
  return (
    <>
      <header className="top">
        <a className="brand" href="/" aria-label="About Kita" style={{ color: 'inherit', textDecoration: 'none' }}><i />Kita</a>
        <TimerPill />
      </header>
      <div className="app">
        <nav id="nav" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} onClick={() => go(k)} aria-current={view === k ? 'page' : undefined}><Icon name={k} /><span>{label}</span></button>
          ))}
          <div className="spacer" />
          <a href="/" className="navlink"><Icon name="home" /><span>About Kita</span></a>
        </nav>
        <main id="view"><div className="view">{children}</div></main>
      </div>
      <div id="tabbar" role="navigation" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}><Icon name={k} /><span>{label}</span></button>
        ))}
      </div>
      <AskDoneSheet />
    </>
  );
}
