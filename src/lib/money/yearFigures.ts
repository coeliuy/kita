/**
 * A tax year's income, expenses, profit, tax and take-home, on the CASH BASIS.
 *
 * Cash basis (HMRC's default for sole traders since April 2024): income counts
 * on the date an invoice is PAID, not the date it's issued. Expenses count on
 * the date they're paid, which is the date logged in Kita.
 *
 * Income is invoice subtotals, excluding VAT: VAT collected belongs to HMRC.
 */
import { daysElapsedInTaxYear, inRange, mtdQuarters, taxYearProgress, taxYearRange } from './dates';
import { sumPounds } from './money';
import { estimateTax, type TaxEstimate } from './tax';
import { PAYMENTS_ON_ACCOUNT_THRESHOLD, type TaxYearRates } from './taxRates';
import type { Expense, Invoice, ISODate } from './types';

/** Don't project a full year from fewer days than this; early figures swing too much. */
export const MIN_DAYS_FOR_PROJECTION = 61;

type Range = [ISODate, ISODate];

/** Income received (paid invoices, excluding VAT) between two dates. */
export function cashIncome(invoices: Invoice[], range: Range): number {
  return sumPounds(
    invoices.filter(i => i.status === 'paid' && i.paidDate && inRange(i.paidDate, range)).map(i => i.subtotal),
  );
}

export function expensesTotal(expenses: Expense[], range: Range): number {
  return sumPounds(expenses.filter(x => inRange(x.date, range)).map(x => x.amount));
}

export interface YearFigures {
  income: number;
  expenses: number;
  profit: number;
  tax: TaxEstimate;
  takeHome: number;
}

/** Figures for one tax year so far. */
export function yearFigures(
  invoices: Invoice[],
  expenses: Expense[],
  taxYear: number,
  otherIncome: number,
  rates: TaxYearRates,
): YearFigures {
  const range = taxYearRange(taxYear);
  const income = cashIncome(invoices, range);
  const exp = expensesTotal(expenses, range);
  const profit = sumPounds([income, -exp]);
  const tax = estimateTax(profit, otherIncome, rates);
  return { income, expenses: exp, profit, tax, takeHome: sumPounds([profit, -tax.total]) };
}

export interface YearProjection {
  income: number;
  profit: number;
  tax: TaxEstimate;
  takeHome: number;
}

/**
 * "If you keep this pace all year": scales this year's figures up to a full
 * year. Returns null before MIN_DAYS_FOR_PROJECTION days, and once the year is
 * over (when the actual figures are the answer).
 */
export function projectYear(
  so: YearFigures,
  taxYear: number,
  today: ISODate,
  otherIncome: number,
  rates: TaxYearRates,
): YearProjection | null {
  const progress = taxYearProgress(taxYear, today);
  if (progress >= 1 || daysElapsedInTaxYear(taxYear, today) < MIN_DAYS_FOR_PROJECTION) return null;
  const income = so.income / progress;
  const profit = so.profit / progress;
  const tax = estimateTax(profit, otherIncome, rates);
  return { income, profit, tax, takeHome: profit - tax.total };
}

/** Self Assessment balancing payment deadline: 31 January after the tax year ends. */
export function paymentDeadline(taxYear: number): ISODate {
  return `${taxYear + 2}-01-31`;
}

/**
 * Whether HMRC is likely to ask for payments on account. HMRC asks when the
 * bill is over £1,000, unless 80% or more of your tax is already collected at
 * source (for example through PAYE). Kita can't see that, so the app words
 * this as "likely".
 */
export function paymentsOnAccountLikely(taxBill: number): boolean {
  return taxBill > PAYMENTS_ON_ACCOUNT_THRESHOLD;
}

export interface TaxPot {
  /** Amount still to move into tax savings (0 if covered). */
  shortfall: number;
  /** Amount saved beyond what's owed so far (0 if short). */
  spare: number;
  /** Saved / owed, capped at 1, for the progress bar. */
  share: number;
}

export function taxPot(saved: number, owed: number): TaxPot {
  const gap = sumPounds([owed, -(saved || 0)]);
  return {
    shortfall: Math.max(0, gap),
    spare: Math.max(0, -gap),
    share: owed > 0 ? Math.min(1, (saved || 0) / owed) : 0,
  };
}

export interface QuarterTotals {
  quarter: 1 | 2 | 3 | 4;
  from: ISODate;
  to: ISODate;
  income: number;
  expenses: number;
  profit: number;
  /** Expenses by HMRC category, in the order of `categories`. */
  byCategory: number[];
}

/** Making Tax Digital quarterly totals, cash basis. */
export function quarterTotals(
  invoices: Invoice[],
  expenses: Expense[],
  taxYear: number,
  categories: readonly string[],
): QuarterTotals[] {
  return mtdQuarters(taxYear).map(([from, to], i) => {
    const income = cashIncome(invoices, [from, to]);
    const xs = expenses.filter(x => inRange(x.date, [from, to]));
    const byCategory = categories.map(c => sumPounds(xs.filter(x => x.category === c).map(x => x.amount)));
    const exp = sumPounds(xs.map(x => x.amount));
    return { quarter: (i + 1) as 1 | 2 | 3 | 4, from, to, income, expenses: exp, profit: sumPounds([income, -exp]), byCategory };
  });
}
