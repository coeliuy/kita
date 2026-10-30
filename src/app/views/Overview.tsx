import { useState } from 'react';
import { addDays, formatHM, monthEnd, monthLabel, shiftMonth, sumMinutes, taxYearLabel, taxYearOf, type MonthKey } from '../../lib/money';
import { CountUp, Icon, NumberField, plural } from '../components/ui';
import { capacity, insights, whatIf } from '../lib/planning';
import { clientReportPdf, download } from '../lib/files';
import { fmtDate, gbp, gbp0, hrsTxt, parseYmd, thisMonth, today } from '../lib/format';
import { monthSummary, yearSummary, type ClientMonth } from '../lib/selectors';
import { useRouter } from '../router';
import { useKita } from '../store/KitaProvider';
import { useInvoiceDraft } from './invoiceDraft';

function ClientRow({ r, maxMinutes, onReport }: { r: ClientMonth; maxMinutes: number; onReport: () => void }) {
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
      {(note || r.minutes > 0) && (
        <div className="note row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{note}</span>
          {r.minutes > 0 && <button className="btn link pop" onClick={onReport}><Icon name="report" />Client report</button>}
        </div>
      )}
    </div>
  );
}

function CapacitySection() {
  const { data, updateSettings } = useKita();
  const [extra, setExtra] = useState(0);
  const t = today();
  const sunday = addDays(t, 6 - ((parseYmd(t).getDay() + 6) % 7));
  const c = capacity(data, t, sunday);
  if (!c.capacity) {
    return (
      <section>
        <div className="head"><h2>Capacity</h2></div>
        <p className="sub" style={{ marginBottom: 12 }}>How many hours a week can you work? Kita will show how much is already committed and whether you have room for more.</p>
        <div style={{ maxWidth: 260 }}>
          <NumberField label="Hours you can work each week" value={0} step={0.5} placeholder="e.g. 30" onChange={v => updateSettings({ capacity: Math.min(168, v) })} />
        </div>
      </section>
    );
  }
  const scale = Math.max(c.capacity, c.committed + extra) || 1;
  const h1 = (n: number) => String(Math.round(n * 10) / 10);
  return (
    <section>
      <div className="head"><h2>Capacity</h2><span className="sub">{c.capacity} hours a week</span></div>
      <div className="figs" style={{ marginBottom: 16 }}>
        <div className="fig hero"><div className="v" style={c.free < 0 ? { color: 'var(--bad)' } : undefined}>{h1(Math.abs(c.free))} h</div><div className="l">{c.free >= 0 ? 'free each week' : 'over your capacity each week'}</div></div>
        <div className="fig"><div className="v">{h1(c.committed)} h</div><div className="l">committed a week ({Math.round((c.committed / c.capacity) * 100)}%)</div></div>
        {c.plannedThisWeek > 0 && <div className="fig"><div className="v">{formatHM(c.plannedThisWeek)}</div><div className="l">of task estimates due this week</div></div>}
      </div>
      <div className="capwrap">
        <div className="stack-bar" role="img" aria-label="Committed hours by client against capacity">
          {c.rows.map(r => <i key={r.client.id} style={{ width: `${(r.hours / scale) * 100}%`, background: r.client.color }} title={`${r.client.name}: ${h1(r.hours)} h`} />)}
          {extra > 0 && <i style={{ width: `${(extra / scale) * 100}%`, background: 'repeating-linear-gradient(45deg,var(--muted) 0 3px,transparent 3px 7px)' }} title={`What if: ${extra} h`} />}
        </div>
        <span className="cap-mk" style={{ left: `calc(${(c.capacity / scale) * 100}% - 1px)` }} />
      </div>
      <div style={{ marginTop: 12 }}>
        {c.rows.map(r => (
          <div className="kv" key={r.client.id}>
            <span><span className="dot" style={{ display: 'inline-block', background: r.client.color, marginRight: 8 }} />{r.client.name}</span>
            <span>{h1(r.hours)} h <span className="muted small">({r.source})</span></span>
          </div>
        ))}
      </div>
      <div className="sep" />
      <div style={{ maxWidth: 300 }}>
        <NumberField label="What if you took on more? (hours a week)" value={extra} step={0.5} placeholder="e.g. 10" onChange={setExtra} />
      </div>
      <p style={{ marginTop: 10 }}>{whatIf(c, extra)}</p>
      <p className="fine" style={{ marginTop: 8 }}>Set expected weekly hours on a client to override these figures, for example when a client is about to increase your hours. Change your weekly capacity in Settings.</p>
    </section>
  );
}

function InsightsSection() {
  const { data } = useKita();
  const items = insights(data, today());
  return (
    <section>
      <div className="head"><h2>Insights</h2><span className="sub">Last 3 months</span></div>
      {items.length
        ? items.map(i => <div key={i.text} className={`insight ${i.tone}`}>{i.text}</div>)
        : <p className="muted">Insights about your rates, retainers and estimates appear once you’ve tracked a few weeks of work.</p>}
    </section>
  );
}

export function Overview() {
  const { data, toast } = useKita();
  const { go } = useRouter();
  const startInvoice = useInvoiceDraft();
  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const report = async (clientId: string) => {
    try {
      const { filename, blob } = await clientReportPdf(data, clientId, month);
      download(filename, blob);
    } catch {
      toast('The report couldn’t be made. Check your connection and try again.');
    }
  };
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
          <div className="fig"><div className="v"><CountUp key={month} value={m.minutes} format={formatHM} /></div><div className="l">Hours tracked over {workDays} {plural(workDays, 'day')}</div></div>
          <div className="fig hero"><div className="v"><CountUp key={month} value={m.value} format={gbp0} /></div><div className="l">Value of your work</div></div>
          <div className="fig"><div className="v">{gbp0(m.minutes ? m.value / (m.minutes / 60) : 0)}</div><div className="l">Average per hour</div></div>
          <div className="fig"><div className="v"><CountUp key={month} value={m.unbilled} format={gbp0} /></div><div className="l">Not invoiced yet</div></div>
        </div>
      </section>
      <CapacitySection />
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
        {rows.length ? rows.map(r => <ClientRow key={r.client.id} r={r} maxMinutes={maxMinutes} onReport={() => report(r.client.id)} />) : <div className="empty">No time tracked in {monthLabel(month)}.</div>}
        {m.unbilled > 0 && <p style={{ marginTop: 14 }}><button className="btn primary" onClick={() => startInvoice(rows.find(r => r.unbilled > 0)?.client.id ?? null, month)}>Create an invoice</button></p>}
      </section>
      <InsightsSection />
      <section>
        <div className="head"><h2>Tax year {taxYearLabel(ty)}</h2><button className="btn sm secondary" onClick={() => go('money')}>See take-home and tax</button></div>
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
