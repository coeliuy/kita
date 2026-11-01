/**
 * Date helpers for UK tax years and months.
 *
 * A UK tax year runs from 6 April to 5 April. We name it by the year it
 * starts in, so 2026 means the 2026/27 tax year (6 April 2026 to 5 April 2027).
 */
import type { ISODate, MonthKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Day number (days since 1970) for a 'YYYY-MM-DD' date, ignoring time zones. */
export function dayNumber(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): ISODate {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days);
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`;
}

/** Last day of a month, e.g. '2026-02' -> '2026-02-28'. */
export function monthEnd(month: MonthKey): ISODate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return fromDayNumber(Math.round(Date.UTC(y, m, 0) / 86_400_000));
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Whole months from one month to another (same month = 0). */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [y1, m1] = from.split('-').map(Number) as [number, number];
  const [y2, m2] = to.split('-').map(Number) as [number, number];
  return (y2 - y1) * 12 + (m2 - m1);
}

export function inRange(date: ISODate, [from, to]: [ISODate, ISODate]): boolean {
  return date >= from && date <= to;
}

/**
 * Which tax year system applies:
 * - 'uk': 6 April to 5 April, named by the year it starts (2026 = 2026/27)
 * - 'calendar': 1 January to 31 December (the Philippines, the US and most countries)
 */
export type YearSystem = 'uk' | 'calendar';

/** The tax year a date falls in, e.g. UK: '2026-04-05' -> 2025, '2026-04-06' -> 2026. */
export function taxYearOf(date: ISODate, sys: YearSystem = 'uk'): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (sys === 'calendar') return y;
  return m > 4 || (m === 4 && d >= 6) ? y : y - 1;
}

/** First and last day of a tax year. */
export function taxYearRange(taxYear: number, sys: YearSystem = 'uk'): [ISODate, ISODate] {
  return sys === 'calendar' ? [`${taxYear}-01-01`, `${taxYear}-12-31`] : [`${taxYear}-04-06`, `${taxYear + 1}-04-05`];
}

/** '2026/27' (UK) or '2026' (calendar). */
export function taxYearLabel(taxYear: number, sys: YearSystem = 'uk'): string {
  return sys === 'calendar' ? String(taxYear) : `${taxYear}/${String(taxYear + 1).slice(2)}`;
}

/** The four quarters of a tax year: Making Tax Digital periods (UK) or calendar quarters. */
export function mtdQuarters(taxYear: number, sys: YearSystem = 'uk'): [ISODate, ISODate][] {
  const y = taxYear;
  if (sys === 'calendar') {
    return [[`${y}-01-01`, `${y}-03-31`], [`${y}-04-01`, `${y}-06-30`], [`${y}-07-01`, `${y}-09-30`], [`${y}-10-01`, `${y}-12-31`]];
  }
  return [
    [`${y}-04-06`, `${y}-07-05`],
    [`${y}-07-06`, `${y}-10-05`],
    [`${y}-10-06`, `${y + 1}-01-05`],
    [`${y + 1}-01-06`, `${y + 1}-04-05`],
  ];
}

/** Days of the tax year that have passed up to and including `today` (0 if it hasn't started). */
export function daysElapsedInTaxYear(taxYear: number, today: ISODate, sys: YearSystem = 'uk'): number {
  const [start, end] = taxYearRange(taxYear, sys);
  if (today < start) return 0;
  const last = today > end ? end : today;
  return dayNumber(last) - dayNumber(start) + 1;
}

export function daysInTaxYear(taxYear: number, sys: YearSystem = 'uk'): number {
  const [start, end] = taxYearRange(taxYear, sys);
  return dayNumber(end) - dayNumber(start) + 1;
}

/** Share of the tax year that has passed, from 0 to 1. */
export function taxYearProgress(taxYear: number, today: ISODate, sys: YearSystem = 'uk'): number {
  return daysElapsedInTaxYear(taxYear, today, sys) / daysInTaxYear(taxYear, sys);
}

/**
 * Months left in the tax year, counting the current month, for spreading a
 * goal over the rest of the year. 0 if the year is over.
 * (In the UK the year ends on 5 April, so April counts as the final month.)
 */
export function monthsLeftInTaxYear(taxYear: number, today: ISODate, sys: YearSystem = 'uk'): number {
  const [start, end] = taxYearRange(taxYear, sys);
  if (today > end) return 0;
  const from = today < start ? monthOf(start) : monthOf(today);
  return monthsBetween(from, monthOf(end)) + 1;
}

/** '2026-10' -> 'October 2026' */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
