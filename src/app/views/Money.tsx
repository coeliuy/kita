import { useState } from 'react';
import {
  MIN_DAYS_FOR_PROJECTION, addDays, paymentDeadline, paymentsOnAccountLikely, quarterTotals, setAsideRate,
  taxPot, taxYearLabel, taxYearOf, taxYearRange, type GoalType,
} from '../../lib/money';
import { NumberField, TaxYearSelect, plural } from '../components/ui';
import { EXPENSE_CATEGORIES } from '../lib/categories';
import { download, quartersCsv } from '../lib/files';
import { fmtDate, gbp, gbp0, today } from '../lib/format';
import { yearSummary } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';

export const ESTIMATE_NOTE =
  'All figures are estimates, not tax advice. They use the England, Wales and Northern Ireland rates in Settings and count income when an invoice is paid (the cash basis). They don’t include student loan repayments, Scottish tax bands, pension contributions, or other reliefs. Check your actual bill with HMRC or an accountant.';

export function Money() {
  const { data, updateYear } = useKita();
  const [ty, setTy] = useState(() => taxYearOf(today()));
  const t = today();
  const y = yearSummary(data, ty, t);
  const f = y.figures, ys = y.ys, p = y.projection;
  const rate = p ? setAsideRate(p.income, p.tax) : setAsideRate(f.income, f.tax);
  const pot = taxPot(ys.taxSaved, f.tax.total);
  const g = y.goal;
  const [start] = taxYearRange(ty);
  const projectionFrom = addDays(start, MIN_DAYS_FOR_PROJECTION - 1);
  const qs = quarterTotals(data.invoices, data.expenses, ty, EXPENSE_CATEGORIES);
  const set = (patch: Parameters<typeof updateYear>[1]) => updateYear(ty, patch);

  return (
    <>
      <section>
        <div className="head"><h1>Money</h1><TaxYearSelect value={ty} onChange={setTy} /></div>
        {y.isFallback && <div className="callout" style={{ marginBottom: 16 }}>Kita doesn’t have HMRC’s rates for {taxYearLabel(ty)} yet, so these estimates use {taxYearLabel(y.ratesYear)} rates.</div>}
        <div className="split">
          <div className="panel">
            <h3 style={{ marginBottom: 8 }}>{taxYearLabel(ty)} so far</h3>
            <div className="kv"><span>Received from clients{data.settings.vatRegistered ? ' (excluding VAT)' : ''}</span><span>{gbp(f.income)}</span></div>
            <div className="kv"><span>Business expenses</span><span>− {gbp(f.expenses)}</span></div>
            <div className="kv strong"><span>Profit</span><span>{gbp(f.profit)}</span></div>
            <div className="kv"><span>Income Tax on this profit (estimate)</span><span>− {gbp(f.tax.incomeTax)}</span></div>
            <div className="kv"><span>Class 4 National Insurance (estimate)</span><span>− {gbp(f.tax.class4NI)}</span></div>
            <div className="kv strong" style={{ color: 'var(--accent-text)' }}><span>Estimated take-home</span><span>{gbp(f.takeHome)}</span></div>
            {y.awaiting > 0 && <p className="fine" style={{ marginTop: 8 }}>Plus {gbp(y.awaiting)} invoiced this year and not yet paid. It counts once the money arrives.</p>}
          </div>
          <div className="stack">
            <div className="fig hero"><div className="v">{Math.round(rate * 100)}%</div><div className="l">Set aside this share of every payment for your tax bill{p ? ', based on your pace this year' : ''}</div></div>
            {p ? (
              <div className="panel">
                <h3 style={{ marginBottom: 6 }}>If you keep this pace all year</h3>
                <div className="kv"><span>Income</span><span>{gbp0(p.income)}</span></div>
                <div className="kv"><span>Tax and NI (estimate)</span><span>{gbp0(p.tax.total)}</span></div>
                <div className="kv strong"><span>Take-home</span><span>{gbp0(p.takeHome)}</span></div>
              </div>
            ) : t < projectionFrom && t >= start ? (
              <p className="fine">A full-year projection appears from {fmtDate(projectionFrom)}, once there’s enough of the year to go on.</p>
            ) : null}
            <NumberField label="Other taxable income this year, such as a salary (£)" value={ys.otherIncome} placeholder="0" onChange={v => set({ otherIncome: v })} />
            <p className="fine">A salary uses up your tax-free allowance and lower bands first, so your freelance profit is taxed on top of it. Leaving this blank makes the estimate too low.</p>
          </div>
        </div>
      </section>
      <section>
        <div className="head"><h2>Tax pot</h2></div>
        <div className="split">
          <div className="stack">
            <NumberField label="Saved for tax so far (£)" value={ys.taxSaved} placeholder="0" onChange={v => set({ taxSaved: v })} />
            <div className="prog"><i style={{ width: `${pot.share * 100}%` }} /></div>
            <p>{f.tax.total <= 0 ? 'No tax due on this year’s profit yet.' : pot.shortfall > 0 ? <>Move <b>{gbp0(pot.shortfall)}</b> into your tax savings to cover what you owe so far.</> : `You’re covered, with ${gbp0(pot.spare)} to spare.`}</p>
          </div>
          <div className="stack">
            <div className="callout info">The bill for {taxYearLabel(ty)} is due by {fmtDate(paymentDeadline(ty))}.</div>
            {paymentsOnAccountLikely((p ?? f).tax.total) && (
              <div className="callout">Your bill looks likely to be over £1,000. If most of it isn’t already collected through PAYE, HMRC will usually ask for payments on account: two advance payments towards next year, each half of this year’s bill, due 31 January and 31 July. That can make your first January payment much larger than expected.</div>
            )}
          </div>
        </div>
      </section>
      <section>
        <div className="head"><h2>Earnings goal</h2></div>
        <div className="grid" style={{ maxWidth: 560 }}>
          <NumberField label={`Goal for ${taxYearLabel(ty)} (£)`} value={ys.goal} step={100} placeholder="e.g. 40000" onChange={v => set({ goal: v })} />
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
              {gbp0(g.achieved)} of {gbp0(ys.goal)} ({Math.round(g.share * 100)}%)
              {g.onPace !== null && g.aheadBy !== null ? (
                <>. At this point in the year you’d be on pace at {gbp0(g.onPace)}, so you’re{' '}
                  <b style={{ color: g.aheadBy >= 0 ? 'var(--pop-text)' : 'var(--warn)' }}>{gbp0(Math.abs(g.aheadBy))} {g.aheadBy >= 0 ? 'ahead' : 'behind'}</b>.</>
              ) : '.'}
            </p>
            {g.reached ? <p style={{ marginTop: 10 }}><span className="tag good">Goal reached</span></p> : g.perMonth !== null && (
              <div className="figs" style={{ marginTop: 16 }}>
                <div className="fig"><div className="v">{gbp0(g.perMonth)}</div><div className="l">to bring in each month for the {g.monthsLeft} {plural(g.monthsLeft, 'month')} left</div></div>
                {g.hoursPerMonth !== null && <div className="fig"><div className="v">{Math.round(g.hoursPerMonth)} h</div><div className="l">a month at your average of {gbp0(y.hourlyValue)}/h</div></div>}
                {ys.goalType === 'net' && <div className="fig"><div className="v">{gbp0(g.grossNeeded)}</div><div className="l">more income needed before tax</div></div>}
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
                <tr key={q.quarter}><td>Q{q.quarter}</td><td>{fmtDate(q.from)} to {fmtDate(q.to)}</td><td className="r">{gbp(q.income)}</td><td className="r">{gbp(q.expenses)}</td><td className="r">{gbp(q.profit)}</td></tr>
              ))}
              <tr className="total"><td colSpan={2}>Year</td><td className="r">{gbp(f.income)}</td><td className="r">{gbp(f.expenses)}</td><td className="r">{gbp(f.profit)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="fine" style={{ marginTop: 10 }}>These follow the Making Tax Digital quarters. Sole traders above the income threshold send HMRC a summary like this each quarter through compatible software; the CSV breaks expenses down by category to make that easier.</p>
      </section>
      <section><p className="fine">{ESTIMATE_NOTE}</p></section>
    </>
  );
}
