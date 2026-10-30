/**
 * Capacity (do you have room for more work?) and insights (what your
 * numbers say about your rates, retainers and estimates).
 */
import { addDays, effectiveHourlyRate, monthOf, shiftMonth, type ISODate } from '../../lib/money';
import type { Client, KitaData } from '../store/types';
import { activeClients, categoryName, entriesIn, monthSummary } from './selectors';
import { minutesLeft, taskMinutes } from './tasks';

export type CommitmentSource = 'your estimate' | 'retainer hours' | 'last 4 weeks';

export interface Commitment {
  client: Client;
  /** Hours a week this client takes. */
  hours: number;
  source: CommitmentSource;
}

/**
 * Hours a week each active client takes. Your own estimate on the client
 * wins; otherwise the larger of the retainer's included hours (as a weekly
 * figure) and the average of the last four weeks.
 */
export function commitments(d: KitaData, today: ISODate): Commitment[] {
  const from = addDays(today, -27);
  return activeClients(d)
    .map(client => {
      const recent = entriesIn(d, from, today, client.id).reduce((t, e) => t + e.minutes, 0) / 60 / 4;
      const retainer = client.billing === 'retainer' ? ((client.included || 0) * 12) / 52 : 0;
      if (client.weekly > 0) return { client, hours: client.weekly, source: 'your estimate' as const };
      return retainer > 0 && retainer >= recent
        ? { client, hours: retainer, source: 'retainer hours' as const }
        : { client, hours: recent, source: 'last 4 weeks' as const };
    })
    .filter(c => c.hours >= 0.1)
    .sort((a, b) => b.hours - a.hours);
}

export interface Capacity {
  /** Hours a week you can work (0 = not set). */
  capacity: number;
  rows: Commitment[];
  committed: number;
  /** Positive = free hours a week; negative = over capacity. */
  free: number;
  /** Minutes of task estimates still to do, for tasks due by the end of this week. */
  plannedThisWeek: number;
}

export function capacity(d: KitaData, today: ISODate, weekEnd: ISODate): Capacity {
  const rows = commitments(d, today);
  const committed = rows.reduce((t, r) => t + r.hours, 0);
  const cap = d.settings.capacity || 0;
  const plannedThisWeek = d.tasks
    .filter(t => t.status !== 'done' && !!t.due && t.due <= weekEnd)
    .reduce((t, x) => t + minutesLeft(x, d.entries), 0);
  return { capacity: cap, rows, committed, free: cap - committed, plannedThisWeek };
}

const h1 = (n: number) => String(Math.round(n * 10) / 10);

/** "What if you took on N more hours a week?" */
export function whatIf(c: Capacity, extra: number): string {
  if (!extra || !c.capacity) return '';
  const total = c.committed + extra;
  const pct = (total / c.capacity) * 100;
  if (pct <= 85) return `You’d be at ${h1(total)} of ${c.capacity} hours a week (${Math.round(pct)}%). There’s room for it.`;
  if (pct <= 100) return `You’d be at ${h1(total)} of ${c.capacity} hours a week (${Math.round(pct)}%). Doable, but tight.`;
  return `That’s ${h1(total - c.capacity)} hours a week more than you have. You’d need to reduce other work first.`;
}

export type Insight = { tone: 'good' | 'warn'; text: string };

/** A client needs at least this much time (3 hours) over 3 months before Kita compares its rate. */
const MIN_MINUTES_FOR_RATE = 180;
/** Rates 20% or more away from your average are worth a mention. */
const RATE_GAP = 0.2;

/**
 * Insights from the last three months (this month and the two before):
 * - clients paying well below or above your average hourly rate
 * - retainers that ran over in two or more of those months
 * - how finished tasks compared with their estimates, overall and by category
 */
export function insights(d: KitaData, today: ISODate): Insight[] {
  const out: Insight[] = [];
  const gbp0 = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
  const months = [0, 1, 2].map(i => shiftMonth(monthOf(today), -i));
  const agg = new Map<string, { client: Client; value: number; minutes: number; over: number }>();
  let totalValue = 0, totalMinutes = 0;
  for (const m of months) {
    for (const r of monthSummary(d, m).rows) {
      const a = agg.get(r.client.id) ?? { client: r.client, value: 0, minutes: 0, over: 0 };
      a.value += r.value;
      a.minutes += r.minutes;
      if (r.usage?.status === 'over') a.over++;
      agg.set(r.client.id, a);
      totalValue += r.value;
      totalMinutes += r.minutes;
    }
  }
  const avg = effectiveHourlyRate(totalValue, totalMinutes) ?? 0;
  for (const a of agg.values()) {
    const rate = effectiveHourlyRate(a.value, a.minutes);
    if (avg && rate && a.minutes >= MIN_MINUTES_FOR_RATE) {
      const diff = (rate - avg) / avg;
      if (diff <= -RATE_GAP) {
        out.push({ tone: 'warn', text: `${a.client.name} pays you ${gbp0(rate)} an hour in practice, ${Math.round(-diff * 100)}% below your ${gbp0(avg)} average. Worth reviewing your rate or the scope of work.` });
      } else if (diff >= RATE_GAP) {
        out.push({ tone: 'good', text: `${a.client.name} is your best-paid work at ${gbp0(rate)} an hour, ${Math.round(diff * 100)}% above your average.` });
      }
    }
    if (a.over >= 2) out.push({ tone: 'warn', text: `${a.client.name} went over its retainer in ${a.over} of the last 3 months. Consider raising the included hours.` });
  }

  // Estimates: finished tasks in the last 90 days that had an estimate and some time.
  const since = addDays(today, -90);
  const done = d.tasks
    .filter(t => t.status === 'done' && t.estimate > 0 && (t.doneAt ?? '') >= since)
    .map(t => ({ t, actual: taskMinutes(d.entries, t.id) }))
    .filter(x => x.actual > 0);
  if (done.length >= 3) {
    const est = done.reduce((s, x) => s + x.t.estimate, 0);
    const act = done.reduce((s, x) => s + x.actual, 0);
    const r = (act - est) / est;
    const hm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    out.push(Math.abs(r) < 0.1
      ? { tone: 'good', text: `Your estimates are spot on: finished tasks took ${hm(act)} against ${hm(est)} estimated.` }
      : { tone: 'warn', text: `Finished tasks took ${Math.round(Math.abs(r) * 100)}% ${r > 0 ? 'longer' : 'less time'} than you estimated (${hm(act)} against ${hm(est)}).` });
    const byCat = new Map<string, { est: number; act: number; n: number }>();
    for (const x of done) {
      const b = byCat.get(x.t.categoryId) ?? { est: 0, act: 0, n: 0 };
      b.est += x.t.estimate; b.act += x.actual; b.n++;
      byCat.set(x.t.categoryId, b);
    }
    for (const [k, b] of byCat) {
      const rr = (b.act - b.est) / b.est;
      if (b.n >= 2 && rr >= RATE_GAP) {
        out.push({ tone: 'warn', text: `${categoryName(d, k, 'Uncategorised')} tasks run ${Math.round(rr * 100)}% over your estimates. Build that into your quotes.` });
      }
    }
  }
  return out;
}
