import { currencySymbol, formatMoney, inHome, isForeign } from './currency';
import { mtdQuarters, monthsLeftInTaxYear, taxYearLabel, taxYearOf, taxYearRange } from './dates';
import { goalProgress } from './goal';
import { flatSetAside } from './tax';
import type { Invoice } from './types';
import { cashIncome, yearFigures } from './yearFigures';

const inv = (extra: Partial<Invoice>): Invoice => ({
  id: 'i', clientId: 'c', period: null, issueDate: '2026-10-01', dueDate: '2026-10-31', lines: [],
  subtotal: 1000, vatRate: 0, vat: 0, total: 1000, status: 'unpaid', paidDate: null, ...extra,
});

describe('formatting money', () => {
  it('uses each currency’s own symbol and style', () => {
    expect(formatMoney(1234.5, 'GBP')).toBe('£1,234.50');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'PHP')).toBe('₱1,234.50');
    expect(formatMoney(1234.5, 'PHP', true)).toBe('₱1,235');
    expect(currencySymbol('PHP')).toBe('₱');
    expect(currencySymbol('GBP')).toBe('£');
  });
});

describe('invoices in another currency', () => {
  it('treats invoices without an exchange rate as home currency', () => {
    expect(isForeign(inv({}))).toBe(false);
    expect(inHome(inv({}), 'total')).toBe(1000);
  });

  it('estimates with the saved rate until paid', () => {
    // $1,000 at 0.79 = £790
    expect(inHome(inv({ currency: 'USD', fxRate: 0.79 }), 'total')).toBe(790);
  });

  it('uses the amount that actually arrived once paid', () => {
    const paid = inv({ currency: 'USD', fxRate: 0.79, status: 'paid', paidDate: '2026-10-20', receivedHome: 775.5 });
    expect(inHome(paid, 'total')).toBe(775.5);
  });

  it('takes VAT/sales tax out of the amount received for income', () => {
    // $1,200 including $200 tax; £948 arrived, so the $1,000 subtotal is worth £790.
    const paid = inv({ currency: 'USD', fxRate: 0.79, subtotal: 1000, vat: 200, total: 1200, status: 'paid', paidDate: '2026-10-20', receivedHome: 948 });
    expect(inHome(paid, 'subtotal')).toBe(790);
  });

  it('counts foreign invoices in home currency for income', () => {
    const invoices = [
      inv({ status: 'paid', paidDate: '2026-10-05', subtotal: 500, total: 500 }),
      inv({ currency: 'USD', fxRate: 0.79, status: 'paid', paidDate: '2026-10-06', receivedHome: 770 }),
    ];
    expect(cashIncome(invoices, ['2026-10-01', '2026-10-31'])).toBe(1270);
  });
});

describe('calendar tax years (the Philippines, the US)', () => {
  it('runs January to December', () => {
    expect(taxYearOf('2026-04-05', 'calendar')).toBe(2026);
    expect(taxYearOf('2026-01-01', 'calendar')).toBe(2026);
    expect(taxYearRange(2026, 'calendar')).toEqual(['2026-01-01', '2026-12-31']);
    expect(taxYearLabel(2026, 'calendar')).toBe('2026');
    expect(mtdQuarters(2026, 'calendar')[1]).toEqual(['2026-04-01', '2026-06-30']);
    expect(monthsLeftInTaxYear(2026, '2026-10-30', 'calendar')).toBe(3);
  });
});

describe('set-aside instead of a tax calculation', () => {
  it('sets aside the chosen share of profit', () => {
    expect(flatSetAside(40_000, 25)).toEqual({ incomeTax: 10_000, class4NI: 0, total: 10_000 });
    expect(flatSetAside(-500, 25).total).toBe(0);
  });

  it('works through yearly figures and goals', () => {
    const taxOf = (p: number) => flatSetAside(p, 20);
    const invoices = [inv({ status: 'paid', paidDate: '2026-03-01', subtotal: 50_000, total: 50_000 })];
    const f = yearFigures(invoices, [], 2026, taxOf, 'calendar');
    expect(f).toMatchObject({ income: 50_000, profit: 50_000, takeHome: 40_000 });
    const g = goalProgress({
      goal: 60_000, goalType: 'net', income: f.income, profit: f.profit, takeHome: f.takeHome,
      hourlyValue: 0, taxYear: 2026, today: '2026-10-30', taxOf, sys: 'calendar',
    });
    // £20,000 more take-home at 20% set aside needs £25,000 more income.
    expect(g.grossNeeded).toBeCloseTo(25_000, 1);
    expect(g.monthsLeft).toBe(3);
  });
});
