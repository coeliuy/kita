import { useState } from 'react';
import { formatHM, monthEnd, monthLabel, shiftMonth, sumMinutes, taxYearLabel, taxYearOf, type MonthKey } from '../../lib/money';
import { plural } from '../components/ui';
import { fmtDate, gbp, gbp0, hrsTxt, parseYmd, thisMonth, today } from '../lib/format';
import { monthSummary, yearSummary, type ClientMonth } from '../lib/selectors';
import { useRouter } from '../router';
import { useKita } from '../store/KitaProvider';
import { useInvoiceDraft } from './invoiceDraft';

function ClientRow({ r, maxMinutes }: { r: ClientMonth; maxMinutes: number }) {
  const c = r.client;
  let bar, note;
  if (r.usage) {
    const u = r.usage;
    const width = (Math.min(u.share, 1.25) / 1.25) * 100;
    bar = (
      <div className="bar" title={`${(u.share * 100).toFixed(0)}% of retainer used`}>
        <i className={u.status === 'over' ? 'over' : u.status === 'near' ? 'near' : ''} style={{ width: `${width}%` }} />
        <span className="mk" style={{ left: `${100 / 1.25}%` }} />
      </div>
    );
    if (u.status === 'over') note = <span className="tag bad">{u.overHours.toFixed(1)} h over the {c.included} h retainer{c.rate ? `. Bill the extra at ${gbp(c.rate)}/h` : ''}</span>;
    else if (u.status === 'near') note = <span className="tag warn">{(u.share * 100).toFixed(0)}% of the {c.included} h retainer used</span>;
    else note = <span className="muted">{u.leftHours.toFixed(1)} of {c.included} retainer hours left</span>;
  } else {
    bar = <div className="bar"><i style={{ width: `${(r.minutes / maxMinutes) * 100}%`, background: c.color }} /></div>;
    if (c.billing === 'fixed' && r.hourly) note = <span className="muted">Fixed fee of {gbp0(c.fee)} works out at {gbp0(r.hourly)}/h across all the time tracked so far</span>;
  }
  return (
    <div className="cl">
      <div className="nm"><span className="dot" style={{ background: c.color }} /><span>{c.name}</span></div>
      {bar}
      <div className="num">{hrsTxt(r.minutes)} · {gbp0(r.value)} · <span className="muted">{r.hourly ? `${gbp0(r.hourly)}/h` : '—'}</span></div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Overview() {
  const { data } = useKita();
  const { go } = useRouter();
  const startInvoice = useInvoiceDraft();
  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const m = monthSummary(data, month);
  const days = +monthEnd(month).slice(8);
  const perDay = [...Array(days)].map((_, i) => {
    const d = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { d, mins: sumMinutes(m.entries.filter(e => e.date === d)) };
  });
  const maxDay = Math.max(60, ...perDay.map(x => x.mins));
  const workDays = perDay.filter(x => x.mins > 0).length;
  const rows = [...m.rows].sort((a, b) => b.minutes - a.minutes);
  const maxMinutes = Math.max(1, ...rows.map(r => r.minutes));

  const ty = taxYearOf(today());
  const y = yearSummary(data, ty, today());

  return (
    <>
      <section>
        <div className="head">
          <h1>{monthLabel(month)}</h1>
          <div className="row">
            <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))}>Previous</button>
            <button className="btn sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()}>Next</button>
          </div>
        </div>
        <div className="figs">
          <div className="fig"><div className="v">{formatHM(m.minutes)}</div><div className="l">Hours tracked over {workDays} {plural(workDays, 'day')}</div></div>
          <div className="fig hero"><div className="v">{gbp0(m.value)}</div><div className="l">Value of your work</div></div>
          <div className="fig"><div className="v">{gbp0(m.minutes ? m.value / (m.minutes / 60) : 0)}</div><div className="l">Average per hour</div></div>
          <div className="fig"><div className="v">{gbp0(m.unbilled)}</div><div className="l">Not invoiced yet</div></div>
        </div>
      </section>
      <section>
        <div className="head"><h2>Hours by day</h2></div>
        <div className="cols" role="img" aria-label="Hours tracked per day">
          {perDay.map(x => {
            const wd = parseYmd(x.d).getDay();
            return (
              <div key={x.d} className={wd === 0 || wd === 6 ? 'we' : ''} title={`${fmtDate(x.d)}: ${formatHM(x.mins)}`}>
                <i style={{ height: `${(x.mins / maxDay) * 100}%` }} /><span>{+x.d.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="head"><h2>By client</h2><span className="sub">Hours · value · what you actually earn per hour</span></div>
        {rows.length ? rows.map(r => <ClientRow key={r.client.id} r={r} maxMinutes={maxMinutes} />) : <div className="empty">No time tracked in {monthLabel(month)}.</div>}
        {m.unbilled > 0 && <p style={{ marginTop: 14 }}><button className="btn primary" onClick={() => startInvoice(rows.find(r => r.unbilled > 0)?.client.id ?? null, month)}>Create an invoice</button></p>}
      </section>
      <section>
        <div className="head"><h2>Tax year {taxYearLabel(ty)}</h2><button className="btn sm" onClick={() => go('money')}>See take-home and tax</button></div>
        <div className="figs">
          <div className="fig"><div className="v">{gbp0(y.figures.income)}</div><div className="l">Received so far</div></div>
          <div className="fig"><div className="v">{gbp0(y.figures.takeHome)}</div><div className="l">Estimated take-home</div></div>
          <div className="fig"><div className="v">{gbp0(y.figures.tax.total)}</div><div className="l">To set aside for tax (estimate)</div></div>
          {y.goal && <div className="fig"><div className="v">{Math.round(y.goal.share * 100)}%</div><div className="l">of your {gbp0(y.ys.goal)} {y.ys.goalType === 'net' ? 'take-home' : 'income'} goal</div></div>}
        </div>
      </section>
    </>
  );
}
