/** Small building blocks shared by the screens. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { taxYearLabel } from '../../lib/money';
import { today } from '../lib/format';
import { activeClients, sortedCategories, taxYearsWithData } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';

const ICONS: Record<string, ReactNode> = {
  track: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2h5" /></>,
  overview: <path d="M3 21h18M6 17v-5M11 17V6M16 17v-8M21 17v-3" />,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5" /></>,
  invoices: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  expenses: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  money: <><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" /><circle cx="16" cy="14.5" r="1.2" /></>,
  settings: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></>,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  tasks: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  feedback: <path d="M4 5h16v11H9l-5 4z" />,
  report: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 17v-3M12 17v-6M16 17v-2" /></>,
};

export function Icon({ name }: { name: string }) {
  return (
    <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** A delete-style button that asks for a second click within 3 seconds. */
export function ConfirmButton({ className = 'btn link danger', onConfirm, children }: { className?: string; onConfirm: () => void; children: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} data-armed={armed ? '' : undefined} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? 'Click again to confirm' : children}
    </button>
  );
}

export function TaxYearSelect({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const { data } = useKita();
  return (
    <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <span>Tax year</span>
      <select style={{ width: 'auto' }} value={value} onChange={e => onChange(+e.target.value)}>
        {taxYearsWithData(data, today()).map(y => <option key={y} value={y}>{taxYearLabel(y)}</option>)}
      </select>
    </label>
  );
}

/** The current time, updated every second while `active`. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** A number input that saves as you type; empty means 0. */
export function NumberField({ label, value, onChange, step = 1, placeholder }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; placeholder?: string;
}) {
  return (
    <label className="f">
      <span>{label}</span>
      <input type="number" step={step} min={0} value={placeholder !== undefined && !value ? '' : value} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? 0 : +e.target.value)} />
    </label>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** <option>s for the user's active clients. */
export function ClientOptions({ allowNone }: { allowNone?: boolean }) {
  const { data } = useKita();
  return (
    <>
      {allowNone && <option value="">No client</option>}
      {activeClients(data).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );
}

/** <option>s for work categories, starting with "No category". */
export function CategoryOptions() {
  const { data } = useKita();
  return (
    <>
      <option value="">No category</option>
      {sortedCategories(data).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );
}

/**
 * A number that counts up from zero when the screen opens. Shows the final
 * value straight away for people who've asked their device to reduce motion.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const target = useRef(value);
  target.current = value;
  const done = useRef(false);
  useEffect(() => {
    if (done.current || reducedMotion()) { setShown(target.current); return; }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setShown(target.current * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(step);
      else done.current = true;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);
  // After the first count, follow changes straight away.
  useEffect(() => { if (done.current) setShown(value); }, [value]);
  return <>{format(shown)}</>;
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
