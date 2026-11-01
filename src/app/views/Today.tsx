/** Today: a greeting, what needs attention, today's tasks, and the key numbers. */
import { useState } from 'react';
import { addDays, currencySymbol, formatHM, inHome, isOverdue, sumMinutes, sumPounds, taxYearOf } from '../../lib/money';
import { countryInfo, detectCountry, yearSystem } from '../lib/region';
import { TaskRow } from '../components/TaskRow';
import { TimerCard } from '../components/TimerCard';
import { CountUp, Icon, plural } from '../components/ui';
import { homeCurrencyCode, money0, parseYmd, thisMonth, today } from '../lib/format';
import { entriesIn, monthSummary, yearSummary } from '../lib/selectors';
import { capacity } from '../lib/planning';
import { comingUp, isOverdueTask, tasksForToday } from '../lib/tasks';
import { useRouter, type View } from '../router';
import { useKita } from '../store/KitaProvider';
import type { KitaData } from '../store/types';

const hours1 = (minutes: number) => String(Math.round(minutes / 6) / 10);

function SetupChecklist() {
  const { data, updateSettings, loadDemo, toast } = useKita();
  const { go } = useRouter();
  if (data.settings.hideSetup) return null;
  const s = data.settings;
  const steps: [string, boolean, View][] = [
    ['Add your first client', data.clients.length > 0, 'clients'],
    ['Set up work categories', data.categories.length > 0, 'settings'],
    ['Add a task', data.tasks.length > 0, 'track'],
    ['Track your first hour', sumMinutes(data.entries) >= 60, 'track'],
    ['Add your details for invoices', !!(s.name || s.business), 'settings'],
    ['Create your first invoice', data.invoices.length > 0, 'invoices'],
  ];
  const done = steps.filter(x => x[1]).length;
  if (done === steps.length) return null;
  return (
    <section>
      <div className="head"><h2>Get set up</h2><span className="sub">{done} of {steps.length} done</span></div>
      <div className="prog"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <div className="checklist">
        {steps.map(([label, ok, view]) => (
          <button key={label} className={`ck${ok ? ' ok' : ''}`} onClick={() => go(view)}>
            <span className="ckb">{ok && <Icon name="check" />}</span>{label}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
        {data.clients.length ? <span /> : (
          <button className="btn secondary" onClick={async () => { await loadDemo(); toast('Demo data added. Remove it any time in Settings.'); }}>Try it with demo data</button>
        )}
        <button className="btn link" onClick={() => updateSettings({ hideSetup: true })}>Hide this</button>
      </div>
    </section>
  );
}

/** Things that need attention: overdue invoices, retainers running high, late tasks. */
function nudges(d: KitaData, t: string): [string, View, string][] {
  const out: [string, View, string][] = [];
  const overdue = d.invoices.filter(i => isOverdue(i, t));
  if (overdue.length) {
    const who = overdue.length === 1 ? `${overdue[0]!.number} is` : `${overdue.length} invoices are`;
    out.push(['bad', 'invoices', `${who} overdue: ${money0(sumPounds(overdue.map(i => inHome(i, 'total'))))} to chase.`]);
  }
  for (const r of monthSummary(d, thisMonth()).rows) {
    if (!r.usage) continue;
    if (r.usage.status === 'over') out.push(['bad', 'overview', `${r.client.name} is ${hours1(r.usage.overHours * 60)} hours over its retainer this month.`]);
    else if (r.usage.status === 'near') out.push(['warn', 'overview', `${r.client.name}’s retainer is ${Math.round(r.usage.share * 100)}% used this month.`]);
  }
  const late = d.tasks.filter(x => isOverdueTask(x, t));
  if (late.length) out.push(['warn', 'track', `${late.length} ${plural(late.length, 'task is', 'tasks are')} past due.`]);
  const cap = capacity(d, t, t);
  if (cap.capacity && cap.committed > cap.capacity) {
    out.push(['warn', 'overview', `You’re committed to ${hours1(cap.committed * 60)} hours a week, more than your ${cap.capacity}-hour capacity.`]);
  }
  return out;
}

/** Asks new (and existing) users to confirm where they're based, with a guess from their device. */
function CountryCard() {
  const { data, updateSettings } = useKita();
  const { go } = useRouter();
  const [guess] = useState(() => countryInfo(detectCountry()));
  const hasData = data.clients.length + data.invoices.length + data.expenses.length > 0;
  const use = () => updateSettings(hasData ? { country: guess.code } : { country: guess.code, currency: guess.currency });
  return (
    <section className="callout info country-card">
      <p><b>Where are you based?</b> It sets your currency, your tax year and how Kita estimates tax. {guess.code === 'OTHER' ? 'Kita has a full tax estimate for the UK, and a simpler one for everywhere else.' : `It looks like you’re in ${guess.code === 'GB' || guess.code === 'US' ? 'the ' : ''}${guess.name}.`}</p>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn primary sm" onClick={use}>{guess.code === 'OTHER' ? 'Use the simpler estimate' : `Yes, ${guess.name}${hasData || guess.currency === homeCurrencyCode() ? '' : ` (${currencySymbol(guess.currency)})`}`}</button>
        <button className="btn sm secondary" onClick={() => go('settings')}>Choose another country</button>
      </div>
    </section>
  );
}

export function Today() {
  const { data } = useKita();
  const { go } = useRouter();
  const t = today();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = data.settings.name.trim().split(/\s+/)[0];
  const monday = addDays(t, -((parseYmd(t).getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const weekMin = sumMinutes(entriesIn(data, monday, sunday));
  const todayMin = sumMinutes(entriesIn(data, t, t));
  const owed = sumPounds(data.invoices.filter(i => i.status !== 'paid').map(i => inHome(i, 'total')));
  const forToday = tasksForToday(data.tasks, t);
  const upNext = comingUp(data.tasks, t, sunday);
  const takeHome = yearSummary(data, taxYearOf(t, yearSystem(data)), t).figures.takeHome;

  const parts: string[] = [];
  if (data.clients.length) {
    parts.push(forToday.length ? `${forToday.length} ${plural(forToday.length, 'task')} on your plate today` : 'Nothing due today');
    parts.push(`${hours1(weekMin)} hours tracked this week`);
    if (owed) parts.push(`${money0(owed)} waiting to be paid`);
  }
  const summary = parts.length
    ? `${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts.at(-1)}.`
    : 'Let’s get Kita set up. It takes about ten minutes.';
  const alerts = data.clients.length ? nudges(data, t).slice(0, 3) : [];

  return (
    <>
      <section className="bare today-head">
        <p className="date">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{greeting}{first ? `, ${first}` : ''}.</h1>
        <p className="summary">{summary}</p>
      </section>
      {!data.settings.country && <CountryCard />}
      <SetupChecklist />
      <TimerCard />
      {alerts.length > 0 && (
        <section>
          {alerts.map(([kind, view, text]) => (
            <button key={text} className={`nudge ${kind}`} onClick={() => go(view)}><Icon name="alert" /><span>{text}</span></button>
          ))}
        </section>
      )}
      {data.clients.length > 0 && (
        <>
          <section>
            <div className="head"><h2>Your tasks</h2><button className="btn sm secondary" onClick={() => go('track')}>All tasks</button></div>
            {forToday.length ? forToday.map(x => <TaskRow key={x.id} task={x} showClient />) : (
              <p className="muted">
                Nothing due today. {data.tasks.some(x => x.status !== 'done') ? 'Pick something coming up, or start a timer above.' : 'Add tasks for your clients on the Track page.'}
              </p>
            )}
            {upNext.length > 0 && <><p className="subhead">Coming up</p>{upNext.map(x => <TaskRow key={x.id} task={x} showClient />)}</>}
          </section>
          <section>
            <div className="figs">
              <div className="fig"><div className="v"><CountUp value={todayMin} format={formatHM} /></div><div className="l">Tracked today</div></div>
              <div className="fig"><div className="v"><CountUp value={weekMin} format={formatHM} /></div><div className="l">This week</div></div>
              <div className="fig"><div className="v"><CountUp value={owed} format={money0} /></div><div className="l">Waiting to be paid</div></div>
              <div className="fig hero"><div className="v"><CountUp value={takeHome} format={money0} /></div><div className="l">Estimated take-home this tax year</div></div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
