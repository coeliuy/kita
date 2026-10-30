import { cleanLines, draftInvoiceLines, dueDate, invoiceTotals, isOverdue, lineAmount } from './invoice';
import type { Client, Invoice, InvoiceLine, TimeEntry } from './types';

const retainer: Client = { id: 'r', name: 'Northlight', billing: 'retainer', fee: 1200, included: 25, rate: 50, startDate: '2026-01-01' };
const hourly: Client = { id: 'h', name: 'Harbour', billing: 'hourly', rate: 45, fee: 0, included: 0 };
const fixed: Client = { id: 'f', name: 'Fennel', billing: 'fixed', fee: 900, rate: 0, included: 0 };

let n = 0;
const entry = (minutes: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `e${++n}`, clientId: 'r', date: '2026-10-10', minutes, billable: true, ...extra,
});
const invoiceWith = (lines: InvoiceLine[], period: string | null = '2026-10'): Invoice => ({
  id: `i${++n}`, clientId: 'r', period, issueDate: '2026-10-15', dueDate: '2026-11-14', lines,
  subtotal: 0, vatRate: 0, vat: 0, total: 0, status: 'unpaid',
});

describe('lineAmount and invoiceTotals', () => {
  it('rounds each line to the penny', () => {
    expect(lineAmount({ qty: 1.33, unit: 45 })).toBe(59.85);
    expect(lineAmount({ qty: 0.1, unit: 0.2 })).toBe(0.02);
  });

  it('adds lines exactly, without floating-point drift', () => {
    const lines = [{ qty: 1, unit: 0.1 }, { qty: 1, unit: 0.2 }];
    expect(invoiceTotals(lines, 0)).toEqual({ subtotal: 0.3, vat: 0, total: 0.3 });
  });

  it('adds VAT on the subtotal', () => {
    expect(invoiceTotals([{ qty: 10.5, unit: 45 }], 20)).toEqual({ subtotal: 472.5, vat: 94.5, total: 567 });
    expect(invoiceTotals([{ qty: 1, unit: 33.33 }], 20)).toEqual({ subtotal: 33.33, vat: 6.67, total: 40 });
  });

  it('drops empty lines', () => {
    const lines: InvoiceLine[] = [
      { desc: '', qty: 1, unit: 0, kind: 'custom' },
      { desc: 'Call', qty: 1, unit: 0, kind: 'custom' },
      { desc: '', qty: 1, unit: 10, kind: 'custom' },
    ];
    expect(cleanLines(lines)).toHaveLength(2);
  });
});

describe('dueDate', () => {
  it.each([
    ['2026-10-30', '7', '2026-11-06'],
    ['2026-10-30', '14', '2026-11-13'],
    ['2026-10-30', '30', '2026-11-29'],
    ['2026-12-20', '30', '2027-01-19'], // crosses the year
    ['2026-10-30', 'eofm', '2026-11-30'], // end of the following month
    ['2027-01-31', 'eofm', '2027-02-28'],
    ['2027-12-15', 'eofm', '2028-01-31'],
  ] as const)('issued %s on %s terms → due %s', (issue, terms, due) => {
    expect(dueDate(issue, terms)).toBe(due);
  });

  it('marks unpaid invoices past their due date as overdue', () => {
    expect(isOverdue({ status: 'unpaid', dueDate: '2026-10-29' }, '2026-10-30')).toBe(true);
    expect(isOverdue({ status: 'unpaid', dueDate: '2026-10-30' }, '2026-10-30')).toBe(false);
    expect(isOverdue({ status: 'paid', dueDate: '2026-10-01' }, '2026-10-30')).toBe(false);
  });
});

describe('draftInvoiceLines: hourly', () => {
  it('groups uninvoiced billable time by task', () => {
    const es = [
      entry(90, { clientId: 'h', task: 'Social content' }),
      entry(30, { clientId: 'h', task: 'Social content' }),
      entry(45, { clientId: 'h', task: '' }),
      entry(60, { clientId: 'h', task: 'Call', billable: false }),
      entry(60, { clientId: 'h', task: 'Old', invoiceId: 'x' }),
    ];
    const d = draftInvoiceLines(hourly, '2026-10', es, []);
    expect(d.lines).toEqual([
      { desc: 'Social content (October 2026)', qty: 2, unit: 45, kind: 'time' },
      { desc: 'Work (October 2026)', qty: 0.75, unit: 45, kind: 'time' },
    ]);
    expect(d.entryIds).toEqual([es[0]!.id, es[1]!.id, es[2]!.id]);
  });

  it('gives one blank line when there is nothing to bill', () => {
    expect(draftInvoiceLines(hourly, '2026-10', [], []).lines).toEqual([{ desc: '', qty: 1, unit: 0, kind: 'custom' }]);
  });
});

describe('draftInvoiceLines: retainer', () => {
  it('bills the fee, and overage beyond included hours', () => {
    const d = draftInvoiceLines(retainer, '2026-10', [entry(28 * 60)], []);
    expect(d.lines).toEqual([
      { desc: 'Monthly retainer, October 2026 (25 hours included)', qty: 1, unit: 1200, kind: 'retainer_fee' },
      { desc: 'Additional hours beyond the retainer, October 2026', qty: 3, unit: 50, kind: 'overage' },
    ]);
  });

  it('does not charge the fee twice when invoicing again in the same month', () => {
    // First invoice mid-month covered 20 hours and the fee.
    const first = invoiceWith([{ desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' }]);
    const es = [entry(20 * 60, { invoiceId: first.id }), entry(10 * 60)];
    const d = draftInvoiceLines(retainer, '2026-10', es, [first]);
    // 30 h in total on a 25 h retainer: 5 h overage, no second fee.
    expect(d.lines).toEqual([{ desc: 'Additional hours beyond the retainer, October 2026', qty: 5, unit: 50, kind: 'overage' }]);
    expect(d.entryIds).toEqual([es[1]!.id]);
  });

  it('only bills overage not already invoiced', () => {
    const first = invoiceWith([
      { desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' },
      { desc: 'Extra', qty: 5, unit: 50, kind: 'overage' },
    ]);
    const es = [entry(30 * 60, { invoiceId: first.id }), entry(2 * 60)];
    expect(draftInvoiceLines(retainer, '2026-10', es, [first]).lines).toEqual([
      { desc: 'Additional hours beyond the retainer, October 2026', qty: 2, unit: 50, kind: 'overage' },
    ]);
  });

  it('bills a new fee for a new month', () => {
    const sept = invoiceWith([{ desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' }], '2026-09');
    expect(draftInvoiceLines(retainer, '2026-10', [], [sept]).lines[0]!.kind).toBe('retainer_fee');
  });

  it('ignores non-billable time for overage', () => {
    const d = draftInvoiceLines(retainer, '2026-10', [entry(24 * 60), entry(5 * 60, { billable: false })], []);
    expect(d.lines).toHaveLength(1);
  });

  it('skips the overage line when there is no overage rate', () => {
    const d = draftInvoiceLines({ ...retainer, rate: 0 }, '2026-10', [entry(30 * 60)], []);
    expect(d.lines.map(l => l.kind)).toEqual(['retainer_fee']);
  });
});

describe('draftInvoiceLines: fixed fee', () => {
  it('bills the whole fee first, then whatever is left', () => {
    expect(draftInvoiceLines(fixed, '2026-10', [], []).lines).toEqual([{ desc: 'Project fee', qty: 1, unit: 900, kind: 'fixed_fee' }]);
    const deposit = invoiceWith([{ desc: 'Deposit', qty: 1, unit: 300, kind: 'fixed_fee' }], null);
    expect(draftInvoiceLines(fixed, '2026-10', [], [deposit]).lines).toEqual([{ desc: 'Project fee (balance)', qty: 1, unit: 600, kind: 'fixed_fee' }]);
    const rest = invoiceWith([{ desc: 'Balance', qty: 1, unit: 600, kind: 'fixed_fee' }], null);
    expect(draftInvoiceLines(fixed, '2026-10', [], [deposit, rest]).lines[0]!.kind).toBe('custom');
  });
});
