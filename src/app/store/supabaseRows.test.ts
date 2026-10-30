import { TABLES, settingsFromRow, settingsToRow, timerFromRow, timerToRow, yearFromRow, yearToRow } from './supabaseRows';
import { DEFAULT_SETTINGS, type Client, type Expense, type Invoice, type TimeEntry } from './types';

// Every field must survive a trip to the database and back.
describe('database row conversion', () => {
  const createdAt = Date.parse('2026-10-30T12:00:00.000Z');

  it('keeps clients intact', () => {
    const c: Client = {
      id: 'c1', name: 'Northlight', billing: 'retainer', rate: 50, fee: 1200, included: 25, startDate: '2026-07-01',
      endDate: null, archived: false, color: '#1F6F5C', email: 'a@b.c', address: '1 Road', createdAt, demo: true,
    };
    expect(TABLES.clients.fromRow(TABLES.clients.toRow(c))).toEqual(c);
  });

  it('keeps time entries intact', () => {
    const e: TimeEntry = { id: 'e1', clientId: 'c1', date: '2026-10-01', minutes: 90, billable: false, task: 'Posts', note: 'n', invoiceId: 'i1', createdAt, demo: false };
    expect(TABLES.entries.fromRow(TABLES.entries.toRow(e))).toEqual(e);
  });

  it('keeps invoices intact', () => {
    const i: Invoice = {
      id: 'i1', number: 'INV-001', clientId: 'c1', clientName: 'Northlight', clientAddress: '1 Road', clientEmail: 'a@b.c',
      period: '2026-10', issueDate: '2026-10-31', dueDate: '2026-11-30',
      lines: [{ desc: 'Retainer', qty: 1, unit: 1200, kind: 'retainer_fee' }],
      subtotal: 1200, vatRate: 20, vat: 240, total: 1440, status: 'paid', paidDate: '2026-11-10', note: 'Thanks',
      entryIds: ['e1'], createdAt, demo: false,
      from: { name: 'Me', business: 'Biz', address: 'Addr', email: 'me@x.y', payment: 'Bank', vatNumber: 'GB123' },
    };
    expect(TABLES.invoices.fromRow(TABLES.invoices.toRow(i))).toEqual(i);
  });

  it('turns numbers sent back as text into numbers', () => {
    const row = { ...TABLES.invoices.toRow({ lines: [], entryIds: [], from: {} } as unknown as Invoice), subtotal: '12.50', lines: [{ desc: 'x', qty: '2', unit: '6.25', kind: 'custom' }] };
    const back = TABLES.invoices.fromRow(row);
    expect(back.subtotal).toBe(12.5);
    expect(back.lines[0]).toEqual({ desc: 'x', qty: 2, unit: 6.25, kind: 'custom' });
  });

  it('keeps expenses intact', () => {
    const x: Expense = { id: 'x1', date: '2026-10-01', amount: 42.6, category: 'Travel', desc: 'Train', clientId: '', demo: false };
    expect(TABLES.expenses.fromRow(TABLES.expenses.toRow(x))).toEqual(x);
  });

  it('keeps settings, year settings and the timer intact', () => {
    const s = { ...DEFAULT_SETTINGS, name: 'Me', vatRegistered: true, vatNumber: 'GB1', terms: 'eofm' as const, theme: 'dark' as const };
    expect({ ...DEFAULT_SETTINGS, ...settingsFromRow(settingsToRow(s)) }).toEqual(s);
    const y = { otherIncome: 30000, goal: 40000, goalType: 'net' as const, taxSaved: 500, rateOverrides: { basicRate: 21 } };
    expect(yearFromRow(yearToRow(2026, y))).toEqual(y);
    const t = { clientId: 'c1', task: 'Posts', startedAt: createdAt };
    expect(timerFromRow(timerToRow(t))).toEqual(t);
  });

  it('stores "no client" as an empty database value', () => {
    expect(TABLES.expenses.toRow({ id: 'x', date: '2026-10-01', amount: 1, category: 'Travel', desc: '', clientId: '' }).client_id).toBeNull();
  });
});
