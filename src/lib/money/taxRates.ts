/**
 * UK Income Tax and Class 4 National Insurance rates, one block per tax year.
 *
 * HOW TO ADD A NEW TAX YEAR
 * 1. Copy the latest block below and change `taxYear` (2027 means 2027/28).
 * 2. Update any figures that changed, using the GOV.UK pages in `sources`.
 * 3. Run `npm test`. The tests check that every year is complete and sensible.
 *
 * Money figures are in pounds, rates are percentages (20 means 20%).
 * These are the rates for England, Wales and Northern Ireland. Scotland sets
 * its own Income Tax bands, which Kita doesn't support yet.
 */

export interface TaxYearRates {
  /** The year the tax year starts in: 2026 means 6 April 2026 to 5 April 2027. */
  taxYear: number;

  // Income Tax
  /** Tax-free Personal Allowance. */
  personalAllowance: number;
  /** Above this income, the Personal Allowance shrinks by £1 for every £2. */
  allowanceTaperThreshold: number;
  /** Width of the basic rate band, measured on taxable income (after the allowance). */
  basicRateBand: number;
  /** Taxable income above this is taxed at the additional rate. */
  additionalRateThreshold: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;

  // Class 4 National Insurance, charged on self-employed profit only
  class4LowerProfitsLimit: number;
  class4UpperProfitsLimit: number;
  /** Rate on profit between the lower and upper limits. */
  class4MainRate: number;
  /** Rate on profit above the upper limit. */
  class4UpperRate: number;

  sources: string[];
}

export const TAX_RATES: TaxYearRates[] = [
  {
    taxYear: 2024,
    personalAllowance: 12_570,
    allowanceTaperThreshold: 100_000,
    basicRateBand: 37_700,
    additionalRateThreshold: 125_140,
    basicRate: 20,
    higherRate: 40,
    additionalRate: 45,
    class4LowerProfitsLimit: 12_570,
    class4UpperProfitsLimit: 50_270,
    class4MainRate: 6,
    class4UpperRate: 2,
    sources: [
      'https://www.gov.uk/income-tax-rates',
      'https://www.gov.uk/self-employed-national-insurance-rates',
    ],
  },
  {
    taxYear: 2025,
    personalAllowance: 12_570,
    allowanceTaperThreshold: 100_000,
    basicRateBand: 37_700,
    additionalRateThreshold: 125_140,
    basicRate: 20,
    higherRate: 40,
    additionalRate: 45,
    class4LowerProfitsLimit: 12_570,
    class4UpperProfitsLimit: 50_270,
    class4MainRate: 6,
    class4UpperRate: 2,
    sources: [
      'https://www.gov.uk/income-tax-rates',
      'https://www.gov.uk/self-employed-national-insurance-rates',
    ],
  },
  {
    taxYear: 2026,
    personalAllowance: 12_570,
    allowanceTaperThreshold: 100_000,
    basicRateBand: 37_700,
    additionalRateThreshold: 125_140,
    basicRate: 20,
    higherRate: 40,
    additionalRate: 45,
    class4LowerProfitsLimit: 12_570,
    class4UpperProfitsLimit: 50_270,
    class4MainRate: 6,
    class4UpperRate: 2,
    sources: [
      'https://www.gov.uk/income-tax-rates',
      'https://www.gov.uk/self-employed-national-insurance-rates',
    ],
  },
];

/** HMRC usually asks for payments on account when a Self Assessment bill is over this. */
export const PAYMENTS_ON_ACCOUNT_THRESHOLD = 1_000;

export interface RatesLookup {
  rates: TaxYearRates;
  /**
   * True when the requested year isn't in the table yet and the closest
   * earlier year is used instead. The app should say so on screen.
   */
  isFallback: boolean;
}

/** Rates for a tax year, falling back to the nearest year we have. */
export function ratesForTaxYear(taxYear: number): RatesLookup {
  const sorted = [...TAX_RATES].sort((a, b) => a.taxYear - b.taxYear);
  const exact = sorted.find(r => r.taxYear === taxYear);
  if (exact) return { rates: exact, isFallback: false };
  const earlier = sorted.filter(r => r.taxYear < taxYear).at(-1);
  return { rates: earlier ?? sorted[0]!, isFallback: true };
}
