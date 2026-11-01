/**
 * Figures the screens show, worked out from the stored data using the money
 * module. No maths of its own beyond adding things up.
 */
import {
  flatSetAside,
  inHome,
  roundPence,
  ukTax,
  type TaxOf,
  type YearSystem,
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
import { homeCurrency, region, yearSystem } from './region';

export const clientById = (d: KitaData, id: string) => d.clients.find(c => c.id === id);

export const sortedCategories = (d: KitaData) => [...d.categories].sort((a, b) => a.name.localeCompare(b.name));

/** A category's name; time without one shows as "General". */
export const categoryName = (d: KitaData, id: string | undefined, fallback = 'General') =>
  d.categories.find(c => c.id === id)?.name ?? fallback;

/** The client and category last used, to pre-fill forms. */
export function lastUsed(d: KitaData) {
  const e = [...d.entries].sort((a, b) => b.createdAt - a.createdAt).find(x => !clientById(d, x.clientId)?.archived && clientById(d, x.clientId));
  return { clientId: e?.clientId ?? activeClients(d)[0]?.id ?? '', categoryId: e?.categoryId ?? '' };
}

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
  const sys = yearSystem(d);
  const years = new Set([taxYearOf(todayDate, sys)]);
  for (const i of d.invoices) years.add(taxYearOf(i.paidDate || i.issueDate, sys));
  for (const x of d.expenses) years.add(taxYearOf(x.date, sys));
  for (const e of d.entries) years.add(taxYearOf(e.date, sys));
  return [...years].sort((a, b) => b - a);
}

/**
 * Home currency per 1 unit of `code`: 1 for the home currency, the last known
 * rate for others, or null if Kita doesn't have a rate yet.
 */
export const fxRateFor = (d: KitaData, code: string): number | null =>
  !code || code === homeCurrency(d) ? 1 : d.settings.fxRates[code]?.rate ?? null;

export interface ClientMonth {
  client: Client;
  /** The client's currency, and their value and unbilled amount in it. */
  currency: string;
  own: { value: number; unbilled: number };
  /** True when the client is billed in another currency and there's no exchange rate yet. */
  noRate: boolean;
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
    const unbilled = unbilledForMonth(client, {
      month, entries: own, retainerActive: active, clientInvoices: d.invoices.filter(i => i.clientId === client.id),
    });
    // Values are worked out in the client's currency, then converted to the home currency.
    const currency = client.currency || homeCurrency(d);
    const rate = fxRateFor(d, currency);
    const home = (n: number) => roundPence(n * (rate ?? 0));
    rows.push({
      client,
      currency,
      own: { value, unbilled },
      noRate: rate === null,
      minutes,
      billableMinutes: bmin,
      value: home(value),
      unbilled: home(unbilled),
      hourly: effectiveHourlyRate(home(value), minutes),
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
function taxYearMonths(taxYear: number, upTo: MonthKey, sys: YearSystem): MonthKey[] {
  const [start, end] = taxYearRange(taxYear, sys);
  const out: MonthKey[] = [];
  for (let m = monthOf(start); m <= monthOf(end) && m <= upTo; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

export function yearSummary(d: KitaData, taxYear: number, todayDate: ISODate) {
  const ys = yearSettings(d, taxYear);
  const { rates, ratesYear, isFallback, overridden } = ratesFor(d, taxYear);
  const sys = yearSystem(d);
  // UK: Income Tax and NI. Elsewhere: the share of profit the person chose to set aside.
  const taxOf: TaxOf = region(d).tax === 'uk' ? ukTax(ys.otherIncome, rates) : profit => flatSetAside(profit, d.settings.setAside);
  const figures = yearFigures(d.invoices, d.expenses, taxYear, taxOf, sys);
  const projection = projectYear(figures, taxYear, todayDate, taxOf, sys);
  const range = taxYearRange(taxYear, sys);

  // Your average value per hour this year, used to turn a goal into hours.
  const months = taxYearMonths(taxYear, monthOf(todayDate), sys);
  const summaries = months.map(m => monthSummary(d, m));
  const workValue = sumPounds(summaries.map(s => s.value));
  const minutes = sumMinutes(entriesIn(d, range[0], range[1]));
  const hourlyValue = effectiveHourlyRate(workValue, minutes) ?? 0;

  const awaiting = sumPounds(
    d.invoices.filter(i => i.status !== 'paid' && taxYearOf(i.issueDate, sys) === taxYear).map(i => inHome(i, 'subtotal')),
  );

  const goal =
    ys.goal > 0
      ? goalProgress({
          goal: ys.goal, goalType: ys.goalType, income: figures.income, profit: figures.profit,
          takeHome: figures.takeHome, hourlyValue, taxYear, today: todayDate, taxOf, sys,
        })
      : null;

  return { ys, sys, rates, ratesYear, isFallback, overridden, figures, projection, minutes, hourlyValue, awaiting, goal };
}
