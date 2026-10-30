import { useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { useRouter, type View } from './router';
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
  const { data, loadDemo, toast } = useKita();
  const theme = data.settings.theme;
  const handledDemo = useRef(false);

  useEffect(() => {
    applyTheme(theme || storedTheme());
  }, [theme]);

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
