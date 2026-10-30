import { goalProgress, grossNeededForTakeHome, type GoalInput } from './goal';
import { estimateTax } from './tax';
import { ratesForTaxYear } from './taxRates';

const rates = ratesForTaxYear(2026).rates;

describe('grossNeededForTakeHome', () => {
  it('grosses up at the basic rate plus NI (26%)', () => {
    // Profit £20,000 is inside the basic band, so each extra £1 of profit keeps £0.74.
    expect(grossNeededForTakeHome(20_000, 740, 0, rates)).toBeCloseTo(1_000, 1);
  });

  it('accounts for crossing into the higher rate', () => {
    const extra = grossNeededForTakeHome(45_000, 10_000, 0, rates);
    const takeHome = (p: number) => p - estimateTax(p, 0, rates).total;
    expect(takeHome(45_000 + extra) - takeHome(45_000)).toBeCloseTo(10_000, 1);
    expect(extra).toBeGreaterThan(10_000 / 0.74);
  });

  it('accounts for a salary', () => {
    // A £60,000 salary fills the basic band, so extra profit is taxed at 40%. Profit of
    // £15,000 is in the 6% Class 4 band, so you keep 54p of each extra pound.
    expect(grossNeededForTakeHome(15_000, 540, 60_000, rates)).toBeCloseTo(1_000, 1);
    // Below the Class 4 threshold there's no NI, so you keep 60p.
    expect(grossNeededForTakeHome(0, 600, 60_000, rates)).toBeCloseTo(1_000, 1);
  });

  it('is zero when nothing more is needed', () => {
    expect(grossNeededForTakeHome(10_000, 0, 0, rates)).toBe(0);
  });
});

describe('goalProgress', () => {
  // 30 October 2026: day 208 of 365 in the 2026/27 tax year.
  const base: GoalInput = {
    goal: 40_000, goalType: 'gross', income: 20_000, profit: 18_000, takeHome: 15_000,
    otherIncome: 0, hourlyValue: 50, taxYear: 2026, today: '2026-10-30', rates,
  };

  it('compares progress with an even pace through the year', () => {
    const g = goalProgress(base);
    expect(g.live).toBe(true);
    expect(g.share).toBe(0.5);
    expect(g.onPace).toBeCloseTo((40_000 * 208) / 365, 2);
    expect(g.aheadBy).toBeCloseTo(20_000 - (40_000 * 208) / 365, 2); // about £2,795 behind
    expect(g.aheadBy!).toBeLessThan(0);
  });

  it('spreads what is left over the remaining months, then into hours', () => {
    const g = goalProgress(base);
    expect(g.monthsLeft).toBe(7); // October to April
    expect(g.perMonth).toBeCloseTo(20_000 / 7, 2);
    expect(g.hoursPerMonth).toBeCloseTo(20_000 / 7 / 50, 2);
  });

  it('measures a take-home goal against take-home, and grosses up what is left', () => {
    const g = goalProgress({ ...base, goalType: 'net', goal: 25_000 });
    expect(g.achieved).toBe(15_000);
    expect(g.remaining).toBe(10_000);
    expect(g.grossNeeded).toBeCloseTo(grossNeededForTakeHome(18_000, 10_000, 0, rates), 2);
    expect(g.grossNeeded).toBeGreaterThan(10_000);
  });

  it('reports a reached goal', () => {
    const g = goalProgress({ ...base, income: 41_000 });
    expect(g.reached).toBe(true);
    expect(g.remaining).toBe(0);
    expect(g.perMonth).toBeNull();
  });

  it('has no pace for a finished tax year', () => {
    const g = goalProgress({ ...base, taxYear: 2025 });
    expect(g.live).toBe(false);
    expect(g.onPace).toBeNull();
    expect(g.monthsLeft).toBe(0);
  });

  it('leaves hours out when there is no hourly value yet', () => {
    expect(goalProgress({ ...base, hourlyValue: 0 }).hoursPerMonth).toBeNull();
  });
});
