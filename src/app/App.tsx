import { useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { useRouter, type View } from './router';
import { setHomeCurrency, today } from './lib/format';
import { fetchRates, ratesStale } from './lib/fx';
import { applyTheme, storedTheme } from './lib/theme';
import { useKita } from './store/KitaProvider';
import { Clients } from './views/Clients';
import { Expenses } from './views/Expenses';
import { Invoices } from './views/Invoices';
import { More } from './views/More';
import { Money } from './views/Money';
import { Overview } from './views/Overview';
import { Settings } from './views/Settings';
import { Today } from './views/Today';
import { Track } from './views/Track';

const SCREENS: Record<View, () => React.JSX.Element> = {
  today: Today, track: Track, overview: Overview, clients: Clients, invoices: Invoices,
  expenses: Expenses, money: Money, settings: Settings, more: More,
};

export function App() {
  const { view, go } = useRouter();
  const { data, loadDemo, toast, updateSettings } = useKita();
  const theme = data.settings.theme;
  const handledDemo = useRef(false);
  // Every screen formats money in the home currency, so set it before they render.
  setHomeCurrency(data.settings.currency);

  useEffect(() => {
    applyTheme(theme || storedTheme());
  }, [theme]);

  // Refresh exchange rates once a day, for the currencies your clients use.
  const home = data.settings.currency || 'GBP';
  const inUse = [...new Set(data.clients.map(c => c.currency).filter(c => c && c !== home))].sort().join(',');
  const latest = useRef(data);
  latest.current = data;
  useEffect(() => {
    const codes = inUse ? inUse.split(',') : [];
    const date = today();
    if (!codes.length || !ratesStale(latest.current.settings.fxRates, codes, date)) return;
    let live = true;
    fetchRates(home, date, codes).then(rates => {
      if (live && Object.keys(rates).length && (latest.current.settings.currency || 'GBP') === home) {
        updateSettings({ fxRates: { ...latest.current.settings.fxRates, ...rates } });
      }
    });
    return () => { live = false; };
  }, [home, inUse, updateSettings]);

  // The homepage's "Try it with demo data" button opens /app/?demo
  useEffect(() => {
    if (handledDemo.current || !new URLSearchParams(location.search).has('demo')) return;
    handledDemo.current = true;
    history.replaceState(null, '', location.pathname);
    if (!data.clients.length) loadDemo().then(() => { toast('Demo data added. Remove it any time in Settings.'); go('today'); });
  }, [data.clients.length, loadDemo, toast, go]);

  const Screen = SCREENS[view];
  return <Layout><Screen /></Layout>;
}
