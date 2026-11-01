/**
 * Income Tax and Class 4 National Insurance estimates for a sole trader.
 *
 * These are ESTIMATES, NOT TAX ADVICE. They leave out Scottish tax bands,
 * student loan repayments, pension contributions, Gift Aid, Marriage
 * Allowance, savings and dividend income, and other reliefs.
 */
import { roundPence } from './money';
import type { TaxYearRates } from './taxRates';

/**
 * Income Tax on a person's total taxable income for the year.
 *
 * 1. Start with the Personal Allowance, reduced by £1 for every £2 of income
 *    above the taper threshold (gone entirely at £125,140).
 * 2. Taxable income = income minus the allowance.
 * 3. Tax the first part at the basic rate, the part up to the additional rate
 *    threshold at the higher rate, and anything above at the additional rate.
 */
export function incomeTax(totalIncome: number, r: TaxYearRates): number {
  const income = Math.max(0, totalIncome);
  let allowance = r.personalAllowance;
  if (income > r.allowanceTaperThreshold) {
    allowance = Math.max(0, allowance - (income - r.allowanceTaperThreshold) / 2);
  }
  const taxable = Math.max(0, income - allowance);

  const basic = Math.min(taxable, r.basicRateBand);
  const higher = Math.min(
    Math.max(taxable - r.basicRateBand, 0),
    Math.max(r.additionalRateThreshold - r.basicRateBand, 0),
  );
  const additional = Math.max(taxable - r.additionalRateThreshold, 0);

  return (basic * r.basicRate + higher * r.higherRate + additional * r.additionalRate) / 100;
}

/** Class 4 National Insurance on self-employed profit. */
export function class4NI(profit: number, r: TaxYearRates): number {
  const p = Math.max(0, profit);
  const main = Math.max(0, Math.min(p, r.class4UpperProfitsLimit) - r.class4LowerProfitsLimit);
  const upper = Math.max(0, p - r.class4UpperProfitsLimit);
  return (main * r.class4MainRate + upper * r.class4UpperRate) / 100;
}

export interface TaxEstimate {
  /** Extra Income Tax caused by the self-employed profit. */
  incomeTax: number;
  class4NI: number;
  total: number;
}

/**
 * Tax due on self-employed profit, on top of any other income.
 *
 * Other income (such as a PAYE salary) uses up the Personal Allowance and
 * the lower bands first, so we work out tax on (other income + profit) and
 * subtract the tax on other income alone. The difference is what the profit
 * adds. We assume tax on the other income is already paid, for example
 * through PAYE.
 *
 * A loss (negative profit) is treated as zero here; Kita doesn't model loss relief.
 */
export function estimateTax(profit: number, otherIncome: number, r: TaxYearRates): TaxEstimate {
  const p = Math.max(0, profit);
  const other = Math.max(0, otherIncome);
  const it = roundPence(incomeTax(other + p, r) - incomeTax(other, r));
  const ni = roundPence(class4NI(p, r));
  return { incomeTax: it, class4NI: ni, total: roundPence(it + ni) };
}

/**
 * For countries whose tax Kita doesn't calculate: set aside a fixed share of
 * profit that the person chooses. Reported as income tax so the rest of the
 * app can treat it like any other estimate.
 */
export function flatSetAside(profit: number, percent: number): TaxEstimate {
  const total = roundPence(Math.max(0, profit) * Math.max(0, percent) / 100);
  return { incomeTax: total, class4NI: 0, total };
}

/** Works out the tax on a year's profit. */
export type TaxOf = (profit: number) => TaxEstimate;

/** Share of income (0 to 1) to set aside for tax. */
export function setAsideRate(income: number, tax: TaxEstimate): number {
  return income > 0 ? tax.total / income : 0;
}
