import { useState } from 'react';
import {
  MIN_DAYS_FOR_PROJECTION, addDays, paymentDeadline, paymentsOnAccountLikely, quarterTotals, setAsideRate,
  taxPot, taxYearLabel, taxYearOf, taxYearRange, type GoalType,
} from '../../lib/money';
import { NumberField, TaxYearSelect, plural } from '../components/ui';
import { EXPENSE_CATEGORIES } from '../lib/categories';
import { download, quartersCsv } from '../lib/files';
import { fmtDate, homeSymbol, money, money0, today } from '../lib/format';
import { region } from '../lib/region';
import { yearSummary } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';

export const ESTIMATE_NOTE =
  'All figures are estimates, not tax advice. They use the England, Wales and Northern Ireland rates in Settings and count income when an invoice is paid (the cash basis). They don’t include student loan repayments, Scottish tax bands, pension contributions, or other reliefs. Check your actual bill with HMRC or an accountant.';

/** For countries where Kita sets aside a share of profit rather than working out the tax. */
export const SET_ASIDE_NOTE =
  'All figures are estimates, not tax advice. Kita doesn’t calculate tax for your country yet, so the tax figure is the share of profit you chose to set aside in Settings. Income counts when an invoice is paid, and payments in other currencies count at the amount you received. Check what you owe with your tax office or an accountant.';

export function Money() {
  const { data, updateYear, updateSettings } = useKita();
  const reg = region(data);
  const uk = reg.tax === 'uk';
  const [ty, setTy] = useState(() => taxYearOf(today(), reg.years));
  const t = today();
  const y = yearSummary(data, ty, t);
  const sys = y.sys;
  const f = y.figures, ys = y.ys, p = y.projection;
  const rate = p ? setAsideRate(p.income, p.tax) : setAsideRate(f.income, f.tax);
  const pot = taxPot(ys.taxSaved, f.tax.total);
  const g = y.goal;
  const [start] = taxYearRange(ty, sys);
  const projectionFrom = addDays(start, MIN_DAYS_FOR_PROJECTION - 1);
  const qs = quarterTotals(data.invoices, data.expenses, ty, EXPENSE_CATEGORIES, sys);
  const set = (patch: Parameters<typeof updateYear>[1]) => updateYear(ty, patch);

  return (
    <>
      <section>
        <div className="head"><h1>Money</h1><TaxYearSelect value={ty} onChange={setTy} /></div>
        {uk && y.isFallback && <div className="callout" style={{ marginBottom: 16 }}>Kita doesn’t have HMRC’s rates for {taxYearLabel(ty, sys)} yet, so these estimates use {taxYearLabel(y.ratesYear, sys)} rates.</div>}
        <div className="split">
          <div className="panel">
            <h3 style={{ marginBottom: 8 }}>{taxYearLabel(ty, sys)} so far</h3>
            <div className="kv"><span>Received from clients{data.settings.vatRegistered ? ` (excluding ${reg.salesTax === 'VAT' ? 'VAT' : 'sales tax'})` : ''}</span><span>{money(f.income)}</span></div>
            <div className="kv"><span>Business expenses</span><span>− {money(f.expenses)}</span></div>
            <div className="kv strong"><span>Profit</span><span>{money(f.profit)}</span></div>
            {uk ? (
              <>
                <div className="kv"><span>Income Tax on this profit (estimate)</span><span>− {money(f.tax.incomeTax)}</span></div>
                <div className="kv"><span>Class 4 National Insurance (estimate)</span><span>− {money(f.tax.class4NI)}</span></div>
              </>
            ) : <div className="kv"><span>Set aside for tax ({data.settings.setAside}%)</span><span>− {money(f.tax.total)}</span></div>}
            <div className="kv strong" style={{ color: 'var(--accent-text)' }}><span>Estimated take-home</span><span>{money(f.takeHome)}</span></div>
            {y.awaiting > 0 && <p className="fine" style={{ marginTop: 8 }}>Plus {money(y.awaiting)} invoiced this year and not yet paid. It counts once the money arrives.</p>}
          </div>
          <div className="stack">
            <div className="fig hero"><div className="v">{Math.round(rate * 100)}%</div><div className="l">Set aside this share of every payment for your tax bill{p ? ', based on your pace this year' : ''}</div></div>
            {p ? (
              <div className="panel">
                <h3 style={{ marginBottom: 6 }}>If you keep this pace all year</h3>
                <div className="kv"><span>Income</span><span>{money0(p.income)}</span></div>
                <div className="kv"><span>{uk ? 'Tax and NI (estimate)' : 'Set aside for tax'}</span><span>{money0(p.tax.total)}</span></div>
                <div className="kv strong"><span>Take-home</span><span>{money0(p.takeHome)}</span></div>
              </div>
            ) : t < projectionFrom && t >= start ? (
              <p className="fine">A full-year projection appears from {fmtDate(projectionFrom)}, once there’s enough of the year to go on.</p>
            ) : null}
            {uk ? (
              <>
                <NumberField label={`Other taxable income this year, such as a salary (${homeSymbol()})`} value={ys.otherIncome} placeholder="0" onChange={v => set({ otherIncome: v })} />
                <p className="fine">A salary uses up your tax-free allowance and lower bands first, so your freelance profit is taxed on top of it. Leaving this blank makes the estimate too low.</p>
              </>
            ) : (
              <>
                <NumberField label="Share of profit to set aside for tax (%)" value={data.settings.setAside} step={1} placeholder="25" onChange={v => updateSettings({ setAside: Math.min(100, Math.max(0, v || 0)) })} />
                <p className="fine">Kita doesn’t work out income tax for {reg.code === 'OTHER' ? 'your country' : `the ${reg.code === 'US' ? 'US' : 'Philippines'}`} yet. Ask an accountant what share to put aside; it depends on your income, deductions and where you live.</p>
              </>
            )}
          </div>
        </div>
      </section>
      <section>
        <div className="head"><h2>Tax pot</h2></div>
        <div className="split">
          <div className="stack">
            <NumberField label={`Saved for tax so far (${homeSymbol()})`} value={ys.taxSaved} placeholder="0" onChange={v => set({ taxSaved: v })} />
            <div className="prog"><i style={{ width: `${pot.share * 100}%` }} /></div>
            <p>{f.tax.total <= 0 ? 'No tax due on this year’s profit yet.' : pot.shortfall > 0 ? <>Move <b>{money0(pot.shortfall)}</b> into your tax savings to cover what you owe so far.</> : `You’re covered, with ${money0(pot.spare)} to spare.`}</p>
          </div>
          <div className="stack">
            {uk && <div className="callout info">The bill for {taxYearLabel(ty, sys)} is due by {fmtDate(paymentDeadline(ty))}.</div>}
            {uk && paymentsOnAccountLikely((p ?? f).tax.total) && (
              <div className="callout">Your bill looks likely to be over £1,000. If most of it isn’t already collected through PAYE, HMRC will usually ask for payments on account: two advance payments towards next year, each half of this year’s bill, due 31 January and 31 July. That can make your first January payment much larger than expected.</div>
            )}
          </div>
        </div>
      </section>
      <section>
        <div className="head"><h2>Earnings goal</h2></div>
        <div className="grid" style={{ maxWidth: 560 }}>
          <NumberField label={`Goal for ${taxYearLabel(ty, sys)} (${homeSymbol()})`} value={ys.goal} step={100} placeholder="e.g. 40000" onChange={v => set({ goal: v })} />
          <label className="f"><span>Measured as</span>
            <select value={ys.goalType} onChange={e => set({ goalType: e.target.value as GoalType })}>
              <option value="gross">Income received</option>
              <option value="net">Take-home after tax</option>
            </select>
          </label>
        </div>
        {g ? (
          <>
            <div className="prog" style={{ maxWidth: 720 }}><i style={{ width: `${Math.min(100, g.share * 100)}%` }} /></div>
            <p className="sub">
              {money0(g.achieved)} of {money0(ys.goal)} ({Math.round(g.share * 100)}%)
              {g.onPace !== null && g.aheadBy !== null ? (
                <>. At this point in the year you’d be on pace at {money0(g.onPace)}, so you’re{' '}
                  <b style={{ color: g.aheadBy >= 0 ? 'var(--pop-text)' : 'var(--warn)' }}>{money0(Math.abs(g.aheadBy))} {g.aheadBy >= 0 ? 'ahead' : 'behind'}</b>.</>
              ) : '.'}
            </p>
            {g.reached ? <p style={{ marginTop: 10 }}><span className="tag good">Goal reached</span></p> : g.perMonth !== null && (
              <div className="figs" style={{ marginTop: 16 }}>
                <div className="fig"><div className="v">{money0(g.perMonth)}</div><div className="l">to bring in each month for the {g.monthsLeft} {plural(g.monthsLeft, 'month')} left</div></div>
                {g.hoursPerMonth !== null && <div className="fig"><div className="v">{Math.round(g.hoursPerMonth)} h</div><div className="l">a month at your average of {money0(y.hourlyValue)}/h</div></div>}
                {ys.goalType === 'net' && <div className="fig"><div className="v">{money0(g.grossNeeded)}</div><div className="l">more income needed before tax</div></div>}
              </div>
            )}
          </>
        ) : <p className="fine" style={{ marginTop: 8 }}>Set a goal to see whether you’re on pace and how many hours it will take.</p>}
      </section>
      <section>
        <div className="head">
          <h2>Quarterly totals</h2>
          <button className="btn sm secondary" onClick={() => { const c = quartersCsv(data, ty); download(c.filename, c.text, 'text/csv'); }}>Download CSV</button>
        </div>
        <div className="tw">
          <table>
            <thead><tr><th>Quarter</th><th>Period</th><th className="r">Income received</th><th className="r">Expenses</th><th className="r">Profit</th></tr></thead>
            <tbody>
              {qs.map(q => (
                <tr key={q.quarter}><td>Q{q.quarter}</td><td>{fmtDate(q.from)} to {fmtDate(q.to)}</td><td className="r">{money(q.income)}</td><td className="r">{money(q.expenses)}</td><td className="r">{money(q.profit)}</td></tr>
              ))}
              <tr className="total"><td colSpan={2}>Year</td><td className="r">{money(f.income)}</td><td className="r">{money(f.expenses)}</td><td className="r">{money(f.profit)}</td></tr>
            </tbody>
          </table>
        </div>
        {uk && <p className="fine" style={{ marginTop: 10 }}>These follow the Making Tax Digital quarters. Sole traders above the income threshold send HMRC a summary like this each quarter through compatible software; the CSV breaks expenses down by category to make that easier.</p>}
      </section>
      <section><p className="fine">{uk ? ESTIMATE_NOTE : SET_ASIDE_NOTE}</p></section>
    </>
  );
}
