import { class4NI, estimateTax, incomeTax, setAsideRate } from './tax';
import { ratesForTaxYear, TAX_RATES } from './taxRates';

// Expected figures are worked out by hand from the 2026/27 rates:
// £12,570 allowance, £37,700 basic band at 20%, 40% to £125,140, 45% above;
// Class 4 NI 6% on £12,570–£50,270 and 2% above.
const r = ratesForTaxYear(2026).rates;

describe('incomeTax (2026/27, England, Wales and NI)', () => {
  it.each([
    [0, 0],
    [12_570, 0], // all within the Personal Allowance
    [20_000, 1_486], // (20,000 − 12,570) × 20%
    [50_270, 7_540], // top of the basic rate band: 37,700 × 20%
    [60_000, 11_432], // 7,540 + 9,730 × 40%
    [100_000, 27_432], // 7,540 + 49,730 × 40%
    [110_000, 33_432], // allowance cut to 7,570: the £100k–£125,140 band costs 60% at the margin
    [125_140, 42_516], // allowance gone: 7,540 + 87,440 × 40%
    [150_000, 53_703], // 42,516 + 24,860 × 45%
  ])('income £%i → £%i', (income, expected) => {
    expect(incomeTax(income, r)).toBeCloseTo(expected, 2);
  });

  it('treats negative income as zero', () => {
    expect(incomeTax(-5_000, r)).toBe(0);
  });
});

describe('class4NI', () => {
  it.each([
    [12_570, 0],
    [30_000, 1_045.8], // 17,430 × 6%
    [50_270, 2_262], // 37,700 × 6%
    [60_000, 2_456.6], // 2,262 + 9,730 × 2%
  ])('profit £%i → £%f', (profit, expected) => {
    expect(class4NI(profit, r)).toBeCloseTo(expected, 2);
  });
});

describe('estimateTax', () => {
  it('taxes freelance profit on its own', () => {
    expect(estimateTax(30_000, 0, r)).toEqual({ incomeTax: 3_486, class4NI: 1_045.8, total: 4_531.8 });
  });

  it('taxes profit on top of a salary, which uses the allowance first', () => {
    // Salary £30,000 + profit £20,000: tax on £50,000 is £7,486, on £30,000 alone is £3,486,
    // so the profit adds £4,000. NI is on the profit only: 7,430 × 6% = £445.80.
    expect(estimateTax(20_000, 30_000, r)).toEqual({ incomeTax: 4_000, class4NI: 445.8, total: 4_445.8 });
  });

  it('pushes profit into the higher rate when a salary fills the basic band', () => {
    // Salary £50,270 fills allowance and basic band, so all £10,000 profit is at 40%.
    expect(estimateTax(10_000, 50_270, r).incomeTax).toBe(4_000);
  });

  it('charges nothing on a loss', () => {
    expect(estimateTax(-2_000, 0, r).total).toBe(0);
  });

  it('gives the share to set aside', () => {
    expect(setAsideRate(30_000, estimateTax(30_000, 0, r))).toBeCloseTo(0.15106, 4);
    expect(setAsideRate(0, estimateTax(0, 0, r))).toBe(0);
  });
});

describe('tax rate table', () => {
  it('has one complete, sensible block per year', () => {
    const years = TAX_RATES.map(t => t.taxYear);
    expect(new Set(years).size).toBe(years.length);
    for (const t of TAX_RATES) {
      expect(t.basicRate).toBeLessThan(t.higherRate);
      expect(t.higherRate).toBeLessThan(t.additionalRate);
      expect(t.basicRateBand).toBeLessThan(t.additionalRateThreshold);
      expect(t.class4LowerProfitsLimit).toBeLessThan(t.class4UpperProfitsLimit);
      expect(t.sources.length).toBeGreaterThan(0);
      for (const v of Object.values(t)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('falls back to the latest earlier year, and says so', () => {
    expect(ratesForTaxYear(2026).isFallback).toBe(false);
    const future = ratesForTaxYear(2040);
    expect(future.isFallback).toBe(true);
    expect(future.rates.taxYear).toBe(Math.max(...TAX_RATES.map(t => t.taxYear)));
  });
});
