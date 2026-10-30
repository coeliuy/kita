import { daysElapsedInTaxYear, mtdQuarters, monthsLeftInTaxYear, taxYearOf, taxYearRange } from './dates';
import { ratesForTaxYear } from './taxRates';
import type { Expense, Invoice } from './types';
import { cashIncome, paymentDeadline, paymentsOnAccountLikely, projectYear, quarterTotals, taxPot, yearFigures } from './yearFigures';

const rates = ratesForTaxYear(2026).rates;

const inv = (subtotal: number, issueDate: string, paidDate: string | null): Invoice => ({
  id: Math.random().toString(36), clientId: 'c', period: null, issueDate, dueDate: issueDate, lines: [],
  subtotal, vatRate: 20, vat: subtotal * 0.2, total: subtotal * 1.2,
  status: paidDate ? 'paid' : 'unpaid', paidDate,
});
const exp = (amount: number, date: string, category = 'Travel'): Expense => ({ id: Math.random().toString(36), date, amount, category });

describe('tax year dates', () => {
  it.each([
    ['2026-04-05', 2025],
    ['2026-04-06', 2026],
    ['2026-12-31', 2026],
    ['2027-01-10', 2026],
  ])('%s is in tax year %i', (d, y) => expect(taxYearOf(d)).toBe(y));

  it('has the Making Tax Digital quarters', () => {
    expect(mtdQuarters(2026)).toEqual([
      ['2026-04-06', '2026-07-05'],
      ['2026-07-06', '2026-10-05'],
      ['2026-10-06', '2027-01-05'],
      ['2027-01-06', '2027-04-05'],
    ]);
  });

  it('counts days and months left', () => {
    expect(taxYearRange(2026)).toEqual(['2026-04-06', '2027-04-05']);
    expect(daysElapsedInTaxYear(2026, '2026-04-06')).toBe(1);
    expect(monthsLeftInTaxYear(2026, '2026-10-30')).toBe(7);
    expect(monthsLeftInTaxYear(2026, '2027-04-02')).toBe(1);
    expect(monthsLeftInTaxYear(2026, '2027-05-01')).toBe(0);
  });
});

describe('cash basis income', () => {
  const invoices = [
    inv(1000, '2026-03-20', '2026-04-10'), // issued last tax year, paid this one: counts THIS year
    inv(2000, '2026-05-01', '2026-05-20'),
    inv(500, '2026-06-01', null), // unpaid: not income yet
    inv(800, '2027-03-30', '2027-04-07'), // paid after the year ends: next year
  ];

  it('counts invoices when paid, excluding VAT', () => {
    expect(cashIncome(invoices, taxYearRange(2026))).toBe(3000);
    expect(cashIncome(invoices, taxYearRange(2025))).toBe(0);
    expect(cashIncome(invoices, taxYearRange(2027))).toBe(800);
  });

  it('works out profit, tax and take-home', () => {
    const f = yearFigures(invoices, [exp(500, '2026-05-02'), exp(99, '2026-04-05')], 2026, 30_000, rates);
    expect(f.income).toBe(3000);
    expect(f.expenses).toBe(500);
    expect(f.profit).toBe(2500);
    // Salary £30,000 means all profit is at 20%: £500. Class 4 NI is nil below £12,570 profit.
    expect(f.tax).toEqual({ incomeTax: 500, class4NI: 0, total: 500 });
    expect(f.takeHome).toBe(2000);
  });
});

describe('projectYear', () => {
  const so = yearFigures([inv(10_000, '2026-05-01', '2026-05-01')], [], 2026, 0, rates);

  it('waits until enough of the year has passed', () => {
    // Previously the first week of April could multiply figures by 50.
    expect(projectYear(so, 2026, '2026-04-20', 0, rates)).toBeNull();
    expect(projectYear(so, 2026, '2026-06-05', 0, rates)).not.toBeNull(); // day 61
  });

  it('scales the year so far to a full year', () => {
    const p = projectYear(so, 2026, '2026-10-30', 0, rates)!; // 208 of 365 days
    expect(p.income).toBeCloseTo((10_000 * 365) / 208, 2);
  });

  it('does not project a finished year', () => {
    expect(projectYear(so, 2026, '2027-05-01', 0, rates)).toBeNull();
  });
});

describe('tax pot and deadlines', () => {
  it('shows what is left to save, or what is spare', () => {
    expect(taxPot(1000, 1500)).toEqual({ shortfall: 500, spare: 0, share: 1000 / 1500 });
    expect(taxPot(2000, 1500)).toEqual({ shortfall: 0, spare: 500, share: 1 });
    expect(taxPot(0, 0)).toEqual({ shortfall: 0, spare: 0, share: 0 });
  });

  it('knows the payment deadline and payments-on-account threshold', () => {
    expect(paymentDeadline(2026)).toBe('2028-01-31');
    expect(paymentsOnAccountLikely(1000)).toBe(false);
    expect(paymentsOnAccountLikely(1000.01)).toBe(true);
  });
});

describe('quarterTotals', () => {
  it('groups paid income and expenses by MTD quarter and category', () => {
    const cats = ['Travel', 'Software and subscriptions'];
    const q = quarterTotals(
      [inv(1000, '2026-06-20', '2026-07-08'), inv(400, '2026-04-10', '2026-04-20')],
      [exp(42.6, '2026-07-06'), exp(13, '2026-07-10', 'Software and subscriptions'), exp(10, '2026-04-06')],
      2026,
      cats,
    );
    expect(q[0]).toMatchObject({ quarter: 1, income: 400, expenses: 10, profit: 390, byCategory: [10, 0] });
    expect(q[1]).toMatchObject({ quarter: 2, income: 1000, expenses: 55.6, profit: 944.4, byCategory: [42.6, 13] });
    expect(q[2]!.income).toBe(0);
  });
});
