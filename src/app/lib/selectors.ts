/**
 * Figures the screens show, worked out from the stored data using the money
 * module. No maths of its own beyond adding things up.
 */
import {
  billableMinutes,
  effectiveHourlyRate,
  goalProgress,
  monthEnd,
  monthOf,
  monthStart,
  monthWorkValue,
  projectYear,
  ratesForTaxYear,
  retainerActiveInMonth,
  retainerUsage,
  shiftMonth,
  sumMinutes,
  sumPounds,
  taxYearOf,
  taxYearRange,
  unbilledForMonth,
  yearFigures,
  type ISODate,
  type MonthKey,
  type RetainerUsage,
  type TaxYearRates,
} from '../../lib/money';
import { DEFAULT_YEAR, type Client, type KitaData, type YearSettings } from '../store/types';

export const clientById = (d: KitaData, id: string) => d.clients.find(c => c.id === id);

export const activeClients = (d: KitaData) =>
  d.clients.filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name));

export const entriesIn = (d: KitaData, from: ISODate, to: ISODate, clientId?: string) =>
  d.entries.filter(e => e.date >= from && e.date <= to && (!clientId || e.clientId === clientId));

export const yearSettings = (d: KitaData, taxYear: number): YearSettings => ({
  ...DEFAULT_YEAR,
  ...d.years[taxYear],
});

/** HMRC rates for the year, with any of the user's own changes applied. */
export function ratesFor(d: KitaData, taxYear: number) {
  const { rates, isFallback } = ratesForTaxYear(taxYear);
  const overrides = yearSettings(d, taxYear).rateOverrides;
  return {
    rates: { ...rates, ...overrides, taxYear } as TaxYearRates,
    /** The year whose HMRC rates are being used (differs from taxYear when falling back). */
    ratesYear: rates.taxYear,
    isFallback,
    overridden: Object.keys(overrides).length > 0,
  };
}

/** Tax years with any data, plus the current one, newest first. */
export function taxYearsWithData(d: KitaData, todayDate: ISODate): number[] {
  const years = new Set([taxYearOf(todayDate)]);
  for (const i of d.invoices) years.add(taxYearOf(i.paidDate || i.issueDate));
  for (const x of d.expenses) years.add(taxYearOf(x.date));
  for (const e of d.entries) years.add(taxYearOf(e.date));
  return [...years].sort((a, b) => b - a);
}

export interface ClientMonth {
  client: Client;
  minutes: number;
  billableMinutes: number;
  value: number;
  unbilled: number;
  /** What you earned per hour worked; null if nothing to show. */
  hourly: number | null;
  /** Retainer usage when the retainer is active and includes hours. */
  usage: RetainerUsage | null;
}

export interface MonthSummary {
  rows: ClientMonth[];
  minutes: number;
  value: number;
  unbilled: number;
  entries: KitaData['entries'];
}

export function monthSummary(d: KitaData, month: MonthKey): MonthSummary {
  const from = monthStart(month), to = monthEnd(month);
  const entries = entriesIn(d, from, to);
  const rows: ClientMonth[] = [];
  for (const client of d.clients) {
    const own = entries.filter(e => e.clientId === client.id);
    const allOwn = d.entries.filter(e => e.clientId === client.id);
    const minutes = sumMinutes(own);
    const bmin = billableMinutes(own);
    const firstEntryDate = allOwn.reduce<string | null>((m, e) => (!m || e.date < m ? e.date : m), null);
    const active = retainerActiveInMonth(client, month, { minutesInMonth: minutes, firstEntryDate });
    const value = monthWorkValue(client, {
      minutes, billableMinutes: bmin, retainerActive: active, fixedAllTimeMinutes: sumMinutes(allOwn),
    });
    if (minutes === 0 && value === 0) continue;
    rows.push({
      client,
      minutes,
      billableMinutes: bmin,
      value,
      unbilled: unbilledForMonth(client, {
        month, entries: own, retainerActive: active, clientInvoices: d.invoices.filter(i => i.clientId === client.id),
      }),
      hourly: effectiveHourlyRate(value, minutes),
      usage: active && client.included > 0 ? retainerUsage(client, bmin) : null,
    });
  }
  return {
    rows,
    minutes: sumMinutes(entries),
    value: sumPounds(rows.map(r => r.value)),
    unbilled: sumPounds(rows.map(r => r.unbilled)),
    entries,
  };
}

/** Months a tax year touches, up to (and including) a given month. */
function taxYearMonths(taxYear: number, upTo: MonthKey): MonthKey[] {
  const [start, end] = taxYearRange(taxYear);
  const out: MonthKey[] = [];
  for (let m = monthOf(start); m <= monthOf(end) && m <= upTo; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

export function yearSummary(d: KitaData, taxYear: number, todayDate: ISODate) {
  const ys = yearSettings(d, taxYear);
  const { rates, ratesYear, isFallback, overridden } = ratesFor(d, taxYear);
  const figures = yearFigures(d.invoices, d.expenses, taxYear, ys.otherIncome, rates);
  const projection = projectYear(figures, taxYear, todayDate, ys.otherIncome, rates);
  const range = taxYearRange(taxYear);

  // Your average value per hour this year, used to turn a goal into hours.
  const months = taxYearMonths(taxYear, monthOf(todayDate));
  const summaries = months.map(m => monthSummary(d, m));
  const workValue = sumPounds(summaries.map(s => s.value));
  const minutes = sumMinutes(entriesIn(d, range[0], range[1]));
  const hourlyValue = effectiveHourlyRate(workValue, minutes) ?? 0;

  const awaiting = sumPounds(
    d.invoices.filter(i => i.status !== 'paid' && taxYearOf(i.issueDate) === taxYear).map(i => i.subtotal),
  );

  const goal =
    ys.goal > 0
      ? goalProgress({
          goal: ys.goal, goalType: ys.goalType, income: figures.income, profit: figures.profit,
          takeHome: figures.takeHome, otherIncome: ys.otherIncome, hourlyValue, taxYear, today: todayDate, rates,
        })
      : null;

  return { ys, rates, ratesYear, isFallback, overridden, figures, projection, minutes, hourlyValue, awaiting, goal };
}
