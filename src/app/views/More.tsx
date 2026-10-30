import { Icon } from '../components/ui';
import { useRouter, type View } from '../router';

const ITEMS: [View, string, string][] = [
  ['money', 'Money', 'Take-home, tax pot, goal and quarterly totals'],
  ['clients', 'Clients', 'Rates, retainers and billing details'],
  ['expenses', 'Expenses', 'Log business costs in HMRC categories'],
  ['settings', 'Settings', 'Your details, invoices, tax rates and data'],
];

export function More() {
  const { go } = useRouter();
  return (
    <>
      <section className="bare"><h1>More</h1></section>
      <section>
        {ITEMS.map(([k, label, desc]) => (
          <button key={k} className="menu-item" onClick={() => go(k)}><Icon name={k} /><span><b>{label}</b><small>{desc}</small></span></button>
        ))}
        <a className="menu-item" href="/"><Icon name="home" /><span><b>About Kita</b><small>What Kita does and how to use it</small></span></a>
      </section>
    </>
  );
}
