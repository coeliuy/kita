import { useState, type FormEvent } from 'react';
import { inRange, sumPounds, taxYearLabel, taxYearOf, taxYearRange } from '../../lib/money';
import { RowMenu } from '../components/RowMenu';
import { ClientOptions, TaxYearSelect } from '../components/ui';
import { EXPENSE_CATEGORIES } from '../lib/categories';
import { fmtDate, homeSymbol, money, today, uid } from '../lib/format';
import { region, yearSystem } from '../lib/region';
import { clientById } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';
import type { Expense } from '../store/types';

export function Expenses() {
  const { data, saveExpense, deleteExpense, toast } = useKita();
  const sys = yearSystem(data);
  const uk = region(data).code === 'GB';
  const [ty, setTy] = useState(() => taxYearOf(today(), sys));
  const [editId, setEditId] = useState<string | null>(null);
  const editing = editId ? data.expenses.find(x => x.id === editId) ?? null : null;
  const range = taxYearRange(ty, sys);
  const xs = data.expenses.filter(x => inRange(x.date, range)).sort((a, b) => b.date.localeCompare(a.date));
  const byCat = new Map<string, number>();
  for (const x of xs) byCat.set(x.category, sumPounds([byCat.get(x.category) ?? 0, x.amount]));
  const total = sumPounds(xs.map(x => x.amount));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const x: Expense = {
      ...(editing ?? { id: uid() }),
      date: String(fd.get('date')), amount: Math.round(+fd.get('amount')! * 100) / 100, category: String(fd.get('category')),
      desc: String(fd.get('desc') ?? '').trim(), clientId: String(fd.get('clientId') ?? ''),
    };
    await saveExpense(x);
    toast(editing ? 'Expense updated' : 'Expense added');
    setEditId(null);
    setTy(taxYearOf(x.date, sys));
    if (!editing) form.reset();
  };

  return (
    <>
      <section>
        <div className="head"><h1>Expenses</h1><TaxYearSelect value={ty} onChange={setTy} /></div>
        <form className="panel stack" onSubmit={onSubmit} key={editing?.id ?? 'new'}>
          <div className="grid">
            <label className="f"><span>Date</span><input type="date" name="date" defaultValue={editing?.date ?? today()} required /></label>
            <label className="f"><span>Amount ({homeSymbol()})</span><input type="number" step="0.01" min="0" name="amount" defaultValue={editing?.amount} required /></label>
            <label className="f"><span>Category</span>
              <select name="category" defaultValue={editing?.category}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </label>
          </div>
          <div className="grid">
            <label className="f"><span>What was it?</span><input name="desc" defaultValue={editing?.desc} placeholder="e.g. Canva subscription" required /></label>
            <label className="f"><span>For a client (optional)</span><select name="clientId" defaultValue={editing?.clientId ?? ''}><ClientOptions allowNone /></select></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {editing ? (
              <><button type="button" className="btn link" onClick={() => setEditId(null)}>Cancel</button><button className="btn primary">Save changes</button></>
            ) : <button className="btn primary">Add expense</button>}
          </div>
        </form>
        <p className="fine" style={{ marginTop: 10 }}>
          Only costs that are wholly for your business count. {uk ? 'Categories follow HMRC’s allowable expense groups, so the totals line up with your tax return and quarterly updates.' : 'Keep receipts for everything you log here.'}
          {data.settings.vatRegistered && ` As you’re registered for ${region(data).salesTax === 'VAT' ? 'VAT' : 'sales tax'}, enter amounts without the tax you can reclaim.`}
        </p>
      </section>
      <section>
        <div className="split">
          <div>
            <div className="head"><h2>{taxYearLabel(ty, sys)} expenses</h2><span className="sub">{money(total)}</span></div>
            {xs.length ? xs.map(x => (
              <div className="entry" key={x.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                <div>
                  <div className="t">{x.desc}</div>
                  <div className="m">{fmtDate(x.date)} · {x.category}{x.clientId && clientById(data, x.clientId) ? ` · ${clientById(data, x.clientId)!.name}` : ''}</div>
                </div>
                <div className="dur">{money(x.amount)}</div>
                <div className="acts">
                  <RowMenu label={`More actions for ${x.desc}`} items={[
                    { label: 'Edit', run: () => { setEditId(x.id); scrollTo({ top: 0, behavior: 'smooth' }); } },
                    { label: 'Delete', danger: true, run: () => { if (editId === x.id) setEditId(null); deleteExpense(x.id); } },
                  ]} />
                </div>
              </div>
            )) : <div className="empty">No expenses logged for {taxYearLabel(ty, sys)}.</div>}
          </div>
          <div>
            <div className="head"><h2>By category</h2></div>
            {byCat.size ? (
              <>
                {[...byCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => <div className="kv" key={k}><span>{k}</span><span>{money(v)}</span></div>)}
                <div className="kv strong"><span>Total</span><span>{money(total)}</span></div>
              </>
            ) : <p className="muted small">Totals appear here as you add expenses.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
