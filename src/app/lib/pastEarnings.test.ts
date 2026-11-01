import { emptyData, type Client, type KitaData } from '../store/types';
import { pastEarnings } from './pastEarnings';
import { monthSummary, yearSummary } from './selectors';

const today = '2026-11-01';
const existing: Client = {
  id: 'n', name: 'Northlight Legal', billing: 'retainer', rate: 0, fee: 1000, included: 10, weekly: 0, currency: '',
  color: '', email: '', address: '', createdAt: 0, startDate: '2026-04-01',
};

describe('past earnings typed in', () => {
  it('spreads each amount over the months as paid income, adding up exactly', () => {
    const r = pastEarnings(emptyData(), [{ client: 'Fennel Bakery', amount: 1000, hours: 20 }], '2026-04', '2026-06', today);
    expect(r.invoices.map(i => [i.period, i.paidDate, i.total, i.status])).toEqual([
      ['2026-04', '2026-04-30', 333.33, 'paid'],
      ['2026-05', '2026-05-31', 333.33, 'paid'],
      ['2026-06', '2026-06-30', 333.34, 'paid'],
    ]);
    expect(r.entries.map(e => e.minutes)).toEqual([400, 400, 400]);
    expect(r.entries.every((e, i) => e.invoiceId === r.invoices[i]!.id)).toBe(true);
    expect(r.clients).toHaveLength(1);
    expect(r.clients[0]).toMatchObject({ name: 'Fennel Bakery', billing: 'hourly', rate: 50 });
  });

  it('uses existing clients, skips empty rows, and stops at today', () => {
    const d: KitaData = { ...emptyData(), clients: [existing] };
    const r = pastEarnings(d, [
      { client: 'northlight legal', amount: 8000, hours: 0 },
      { client: '', amount: 0, hours: 0 },
      { client: 'No amount', amount: 0, hours: 5 },
    ], '2026-04', '2026-12', today);
    expect(r.clients).toEqual([]);
    expect(r.skipped).toBe(1);
    expect(r.invoices).toHaveLength(8); // April to November
    expect(r.invoices.at(-1)).toMatchObject({ period: '2026-11', paidDate: today, total: 1000 });
    expect(r.invoices[0]!.lines[0]!.kind).toBe('retainer_fee');
    expect(r.entries).toEqual([]);
  });

  it('feeds the year figures, hourly rates and retainers', () => {
    const d: KitaData = { ...emptyData(), clients: [existing] };
    const r = pastEarnings(d, [{ client: 'Northlight Legal', amount: 6000, hours: 0 }, { client: 'Fennel', amount: 3000, hours: 60 }], '2026-04', '2026-09', today);
    const after: KitaData = { ...d, clients: [...d.clients, ...r.clients], invoices: r.invoices, entries: r.entries };
    expect(yearSummary(after, 2026, today).figures.income).toBe(9000);
    const sept = monthSummary(after, '2026-09');
    const fennel = sept.rows.find(x => x.client.name === 'Fennel')!;
    expect(fennel).toMatchObject({ minutes: 600, unbilled: 0, hourly: 50 });
    // The retainer fee counts as invoiced for those months.
    expect(sept.rows.find(x => x.client.name === 'Northlight Legal')?.unbilled ?? 0).toBe(0);
  });

  it('keeps record names unique when added twice', () => {
    const first = pastEarnings(emptyData(), [{ client: 'A', amount: 100, hours: 0 }], '2026-10', '2026-10', today);
    const d: KitaData = { ...emptyData(), clients: first.clients, invoices: first.invoices };
    const again = pastEarnings(d, [{ client: 'A', amount: 100, hours: 0 }], '2026-10', '2026-10', today);
    expect(again.invoices[0]!.number).toBe('Past earnings · A · October 2026 (2)');
  });
});
