/**
 * Earnings goal for a tax year: are you on pace, and what will it take?
 *
 * A goal is measured either as income received ('gross') or as take-home
 * after estimated tax ('net').
 */
import { monthsLeftInTaxYear, taxYearProgress, type YearSystem } from './dates';
import type { TaxOf } from './tax';
import type { ISODate } from './types';

export type GoalType = 'gross' | 'net';

/**
 * How much more income (before tax) you need to add `extraTakeHome` to your
 * take-home pay. Each extra pound of profit is taxed at your marginal rate,
 * which changes across bands, so we search for the answer: try an amount,
 * see what take-home it gives, and narrow down until it's within a penny.
 */
export function grossNeededForTakeHome(currentProfit: number, extraTakeHome: number, taxOf: TaxOf): number {
  if (extraTakeHome <= 0) return 0;
  const takeHome = (profit: number) => profit - taxOf(profit).total;
  const now = takeHome(currentProfit);
  let lo = 0;
  // Start high enough for any marginal rate below 75%, and double if that's not enough.
  let hi = extraTakeHome * 4 + 1000;
  while (takeHome(currentProfit + hi) - now < extraTakeHome && hi < 1e12) hi *= 2;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (takeHome(currentProfit + mid) - now >= extraTakeHome) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface GoalInput {
  goal: number;
  goalType: GoalType;
  /** Income received so far this tax year. */
  income: number;
  /** Profit so far (income minus expenses). */
  profit: number;
  /** Take-home so far. */
  takeHome: number;
  /** Your average value per hour worked, to turn money into hours. 0 if unknown. */
  hourlyValue: number;
  taxYear: number;
  today: ISODate;
  /** How tax is worked out on profit (UK rules, or a chosen set-aside share). */
  taxOf: TaxOf;
  sys?: YearSystem;
}

export interface GoalProgress {
  achieved: number;
  /** Achieved / goal (can go over 1). */
  share: number;
  reached: boolean;
  remaining: number;
  /** True while the tax year is under way. */
  live: boolean;
  /** Where you'd be today if you earned the goal evenly through the year. Null outside the year. */
  onPace: number | null;
  /** Positive = ahead of pace, negative = behind. Null outside the year. */
  aheadBy: number | null;
  /** Income before tax still needed. Same as `remaining` for gross goals. */
  grossNeeded: number;
  monthsLeft: number;
  perMonth: number | null;
  hoursPerMonth: number | null;
}

export function goalProgress(g: GoalInput): GoalProgress {
  const achieved = g.goalType === 'net' ? g.takeHome : g.income;
  const sys = g.sys ?? 'uk';
  const progress = taxYearProgress(g.taxYear, g.today, sys);
  const live = progress > 0 && progress < 1;
  const remaining = Math.max(0, g.goal - achieved);
  const grossNeeded =
    g.goalType === 'net' ? grossNeededForTakeHome(g.profit, remaining, g.taxOf) : remaining;
  const monthsLeft = live ? monthsLeftInTaxYear(g.taxYear, g.today, sys) : 0;
  const onPace = live ? g.goal * progress : null;
  const perMonth = live && remaining > 0 ? grossNeeded / monthsLeft : null;
  return {
    achieved,
    share: g.goal > 0 ? achieved / g.goal : 0,
    reached: g.goal > 0 && remaining <= 0,
    remaining,
    live,
    onPace,
    aheadBy: onPace === null ? null : achieved - onPace,
    grossNeeded,
    monthsLeft,
    perMonth,
    hoursPerMonth: perMonth !== null && g.hourlyValue > 0 ? perMonth / g.hourlyValue : null,
  };
}
