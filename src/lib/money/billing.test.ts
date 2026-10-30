import {
  effectiveHourlyRate,
  fixedFeeHourlyRate,
  monthWorkValue,
  retainerActiveInMonth,
  retainerUsage,
  unbilledForMonth,
} from './billing';
import type { Client, Invoice, TimeEntry } from './types';

const retainer: Client = {
  id: 'r', name: 'Northlight Legal', billing: 'retainer', fee: 1200, included: 25, rate: 50, startDate: '2026-09-01',
};
const hourly: Client = { id: 'h', name: 'Harbour & Pine', billing: 'hourly', rate: 45, fee: 0, included: 0 };
const fixed: Client = { id: 'f', name: 'Fennel Bakery', billing: 'fixed', fee: 900, rate: 0, included: 0 };

const entry = (minutes: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id: Math.random().toString(36).slice(2), clientId: 'r', date: '2026-10-10', minutes, billable: true, ...extra,
});

const invoice = (lines: Invoice['lines'], period = '2026-10'): Invoice => ({
  id: 'i', clientId: 'r', period, issueDate: '2026-10-15', dueDate: '2026-11-14', lines,
  subtotal: 0, vatRate: 0, vat: 0, total: 0, status: 'unpaid',
});

describe('retainerUsage', () => {
  it.each([
    [10 * 60, 'ok', 15, 0],
    [20 * 60, 'near', 5, 0], // 80% is the warning point
    [25 * 60, 'near', 0, 0], // exactly 100% is still "near", not over
    [30 * 60, 'over', 0, 5],
  ])('%i minutes on a 25 h retainer → %s', (mins, status, left, over) => {
    const u = retainerUsage(retainer, mins);
    expect(u.status).toBe(status);
    expect(u.leftHours).toBeCloseTo(left);
    expect(u.overHours).toBeCloseTo(over);
  });
});

describe('retainerActiveInMonth', () => {
  const opts = { minutesInMonth: 0 };
  it('is not active before its start date', () => {
    expect(retainerActiveInMonth(retainer, '2026-08', opts)).toBe(false);
    expect(retainerActiveInMonth(retainer, '2026-09', opts)).toBe(true);
  });

  it('stops after its end date', () => {
    const ended = { ...retainer, endDate: '2026-10-31' };
    expect(retainerActiveInMonth(ended, '2026-10', opts)).toBe(true);
    expect(retainerActiveInMonth(ended, '2026-11', opts)).toBe(false);
  });

  it('only counts an archived retainer in months with time', () => {
    const archived = { ...retainer, archived: true };
    expect(retainerActiveInMonth(archived, '2026-10', { minutesInMonth: 0 })).toBe(false);
    expect(retainerActiveInMonth(archived, '2026-10', { minutesInMonth: 60 })).toBe(true);
  });

  it('falls back to the first entry for clients saved without a start date', () => {
    const legacy = { ...retainer, startDate: null };
    expect(retainerActiveInMonth(legacy, '2026-06', { minutesInMonth: 0, firstEntryDate: '2026-07-03' })).toBe(false);
    expect(retainerActiveInMonth(legacy, '2026-07', { minutesInMonth: 0, firstEntryDate: '2026-07-03' })).toBe(true);
  });
});

describe('monthWorkValue', () => {
  const base = { minutes: 0, billableMinutes: 0, retainerActive: true, fixedAllTimeMinutes: 0 };

  it('values hourly work at the rate', () => {
    expect(monthWorkValue(hourly, { ...base, minutes: 600, billableMinutes: 540 })).toBe(405); // 9 h × £45
  });

  it('values a retainer at its fee plus overage', () => {
    expect(monthWorkValue(retainer, { ...base, billableMinutes: 10 * 60 })).toBe(1200);
    expect(monthWorkValue(retainer, { ...base, billableMinutes: 28 * 60 })).toBe(1350); // + 3 h × £50
    expect(monthWorkValue(retainer, { ...base, retainerActive: false, billableMinutes: 600 })).toBe(0);
  });

  it('spreads a fixed fee across the hours worked', () => {
    // £900 over 30 hours in total = £30/h; 10 hours this month = £300.
    expect(fixedFeeHourlyRate(fixed, 30 * 60)).toBe(30);
    expect(monthWorkValue(fixed, { ...base, minutes: 600, fixedAllTimeMinutes: 30 * 60 })).toBe(300);
  });
});

describe('effectiveHourlyRate', () => {
  it('divides value by all hours worked', () => {
    expect(effectiveHourlyRate(1200, 30 * 60)).toBe(40);
    expect(effectiveHourlyRate(0, 600)).toBeNull();
    expect(effectiveHourlyRate(100, 0)).toBeNull();
  });
});

describe('unbilledForMonth', () => {
  const m = { month: '2026-10', retainerActive: true };

  it('counts only hourly entries not yet invoiced', () => {
    // Previously, one invoice for the month made ALL of the month's time count as invoiced.
    const entries = [entry(120, { clientId: 'h', invoiceId: 'i' }), entry(60, { clientId: 'h' }), entry(30, { clientId: 'h', billable: false })];
    expect(unbilledForMonth(hourly, { ...m, entries, clientInvoices: [] })).toBe(45);
  });

  it('counts the retainer fee until it has been invoiced for that month', () => {
    const entries = [entry(10 * 60)];
    expect(unbilledForMonth(retainer, { ...m, entries, clientInvoices: [] })).toBe(1200);
    const feeInvoice = invoice([{ desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' }]);
    expect(unbilledForMonth(retainer, { ...m, entries, clientInvoices: [feeInvoice] })).toBe(0);
    // A fee invoiced for a different month doesn't count.
    const other = invoice([{ desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' }], '2026-09');
    expect(unbilledForMonth(retainer, { ...m, entries, clientInvoices: [other] })).toBe(1200);
  });

  it('counts overage not yet invoiced', () => {
    const entries = [entry(20 * 60, { invoiceId: 'i' }), entry(12 * 60)]; // 32 h: 7 over
    const inv = invoice([
      { desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' },
      { desc: 'Extra', qty: 5, unit: 50, kind: 'overage' },
    ]);
    expect(unbilledForMonth(retainer, { ...m, entries, clientInvoices: [inv] })).toBe(100); // 2 h × £50
  });

  it('is zero for fixed fees and inactive retainers', () => {
    expect(unbilledForMonth(fixed, { ...m, entries: [entry(600, { clientId: 'f' })], clientInvoices: [] })).toBe(0);
    expect(unbilledForMonth(retainer, { ...m, retainerActive: false, entries: [], clientInvoices: [] })).toBe(0);
  });
});
