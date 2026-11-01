/** "Type it in": what each client has paid you so far, without a spreadsheet. */
import { useState } from 'react';
import { monthLabel, monthOf, shiftMonth, sumPounds, taxYearOf, taxYearRange, type MonthKey } from '../../lib/money';
import { homeSymbol, money0, today } from '../lib/format';
import { monthsBetween, pastEarnings, type PastEarningsRow } from '../lib/pastEarnings';
import { yearSystem } from '../lib/region';
import { useKita } from '../store/KitaProvider';
import { plural } from './ui';

const blank = (): PastEarningsRow => ({ client: '', amount: 0, hours: 0 });

export function PastEarnings({ onDone }: { onDone?: () => void }) {
  const { data, importData, toast } = useKita();
  const t = today();
  const sys = yearSystem(data);
  const yearStart = monthOf(taxYearRange(taxYearOf(t, sys), sys)[0]);
  const thisMonth = monthOf(t);
  const lastMonth = shiftMonth(thisMonth, -1);
  const [from, setFrom] = useState<MonthKey>(yearStart);
  const [to, setTo] = useState<MonthKey>(lastMonth >= yearStart ? lastMonth : thisMonth);
  const [rows, setRows] = useState<PastEarningsRow[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);

  // Any month in the last two years, up to this one.
  const options = monthsBetween(shiftMonth(thisMonth, -24), thisMonth).reverse();
  const filled = rows.filter(r => r.client.trim() && r.amount > 0);
  const total = sumPounds(filled.map(r => r.amount));
  const months = monthsBetween(from, to).length;
  const known = new Set(data.clients.map(c => c.name.trim().toLowerCase()));
  const setRow = (i: number, patch: Partial<PastEarningsRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!filled.length) { toast('Add a client and what they paid you.'); return; }
    if (from > to) { toast('The first month needs to be before the last.'); return; }
    setBusy(true);
    try {
      await importData(pastEarnings(data, rows, from, to, t));
      toast(`Added ${money0(total)} from ${filled.length} ${plural(filled.length, 'client')}. Your income, tax estimate and insights now include it.`);
      setRows([blank(), blank()]);
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack past-earnings">
      <p className="fine">Tell Kita what each client has paid you so far. A rough figure is fine; you can delete it later from the invoice list.</p>
      <div className="grid" style={{ maxWidth: 520 }}>
        <label className="f"><span>From</span>
          <select value={from} onChange={e => setFrom(e.target.value)}>{options.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </label>
        <label className="f"><span>To</span>
          <select value={to} onChange={e => setTo(e.target.value)}>{options.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </label>
      </div>
      <datalist id="past-clients">{data.clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <div className="tw">
        <table>
          <thead><tr><th>Client</th><th className="r" style={{ width: 150 }}>Paid to you ({homeSymbol()})</th><th className="r" style={{ width: 120 }}>Hours (optional)</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Client ${i + 1}`} list="past-clients" value={r.client} placeholder="Pick or type a client" onChange={e => setRow(i, { client: e.target.value })} />
                  {r.client.trim() && !known.has(r.client.trim().toLowerCase()) && <span className="tag" style={{ marginTop: 4, display: 'inline-block' }}>New client</span>}
                </td>
                <td><input aria-label={`Amount for client ${i + 1}`} type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={r.amount || ''} placeholder="0"
                  onChange={e => setRow(i, { amount: +e.target.value || 0 })} /></td>
                <td><input aria-label={`Hours for client ${i + 1}`} type="number" min="0" step="0.5" style={{ textAlign: 'right' }} value={r.hours || ''} placeholder="—"
                  onChange={e => setRow(i, { hours: +e.target.value || 0 })} /></td>
                <td>{rows.length > 1 && <button className="btn link danger" aria-label={`Remove client ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><button className="btn sm" onClick={() => setRows([...rows, blank()])}>Add another client</button></div>
      <p className="fine">
        {data.settings.vatRegistered ? 'Enter amounts without VAT. ' : ''}
        Kita spreads each amount evenly over the {months > 0 ? `${months} ${plural(months, 'month')}` : 'months'} you chose, as paid income.
        Hours help Kita work out what you earn per hour and how busy you are.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
        {total > 0 && <span className="sub">{money0(total)} in total</span>}
        <button className="btn primary" disabled={busy || !filled.length} onClick={save}>{busy ? 'Adding…' : 'Add past earnings'}</button>
      </div>
    </div>
  );
}
