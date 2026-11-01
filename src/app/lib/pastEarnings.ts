/**
 * "Type in what you've earned so far": for people starting Kita part-way
 * through the year, without a spreadsheet to import.
 *
 * For each client you give the total received and (optionally) the hours,
 * plus the months it covers. Kita spreads it evenly across those months as
 * paid records, so quarterly totals, the tax estimate, hourly rates, capacity
 * and insights all have something to work with. Hours become time already
 * linked to those records, so nothing shows as waiting to be invoiced.
 */
import { monthEnd, monthLabel, monthOf, roundPence, shiftMonth, type ISODate, type MonthKey } from '../../lib/money';
import type { Client, Invoice, KitaData, TimeEntry } from '../store/types';
import { COLORS } from './demo';
import { uid } from './format';
import type { ImportResult } from './importBackup';

export interface PastEarningsRow {
  /** An existing client's name, or a new one. */
  client: string;
  /** Received, in your currency. */
  amount: number;
  /** Hours worked (0 = not known). */
  hours: number;
}

/** The months from `from` to `to`, inclusive. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to && out.length < 120; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** Split an amount into `n` parts that add up exactly (any rounding goes on the last). */
function split(total: number, n: number, round: (x: number) => number): number[] {
  const each = round(total / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : round(total - each * (n - 1))));
}

/**
 * Records to add for what's been earned. Rows without a client or amount are
 * left out. `from`/`to` are months; the current month counts up to today.
 */
export function pastEarnings(d: KitaData, rows: PastEarningsRow[], from: MonthKey, to: MonthKey, today: ISODate): ImportResult {
  const lastMonth = monthOf(today);
  const months = monthsBetween(from, to < lastMonth ? to : lastMonth);
  const result: ImportResult = { clients: [], invoices: [], entries: [], expenses: [], categories: [], tasks: [], settings: {}, years: [], skipped: 0 };
  if (!months.length) return result;
  const s = d.settings;
  const from_ = { name: s.name, business: s.business, address: s.address, email: s.email, payment: s.payment, vatNumber: '' };
  const byName = new Map(d.clients.map(c => [c.name.trim().toLowerCase(), c]));
  const used = new Set(d.invoices.map(i => i.number));
  const now = Date.now();
  const range = months.length === 1 ? monthLabel(months[0]!) : `${monthLabel(months[0]!)} to ${monthLabel(months.at(-1)!)}`;

  for (const row of rows) {
    const name = row.client.trim();
    if (!name || !(row.amount > 0)) { if (name || row.amount) result.skipped++; continue; }
    let client = byName.get(name.toLowerCase());
    if (!client) {
      const c: Client = {
        id: uid(), name, billing: 'hourly', rate: row.hours > 0 ? Math.round(row.amount / row.hours) : 0, fee: 0, included: 0,
        weekly: 0, currency: '', color: COLORS[(d.clients.length + result.clients.length) % COLORS.length]!, email: '', address: '', createdAt: now,
      };
      client = c;
      byName.set(name.toLowerCase(), c);
      result.clients.push(c);
    }
    const amounts = split(row.amount, months.length, roundPence);
    const minutes = row.hours > 0 ? split(Math.round(row.hours * 60), months.length, Math.round) : [];
    const kind = client.billing === 'retainer' ? 'retainer_fee' as const : client.billing === 'fixed' ? 'fixed_fee' as const : 'custom' as const;
    months.forEach((m, i) => {
      const amount = amounts[i]!;
      const date = monthEnd(m) < today ? monthEnd(m) : today;
      const id = uid();
      let number = `Past earnings · ${client.name} · ${monthLabel(m)}`;
      for (let k = 2; used.has(number); k++) number = `Past earnings · ${client.name} · ${monthLabel(m)} (${k})`;
      used.add(number);
      const entryIds: string[] = [];
      if (minutes[i]) {
        const e: TimeEntry = {
          id: uid(), clientId: client.id, date, minutes: minutes[i]!, billable: true, task: 'Past work',
          note: `Added with past earnings for ${range}`, invoiceId: id, categoryId: '', taskId: '', createdAt: now,
        };
        result.entries.push(e);
        entryIds.push(e.id);
      }
      if (amount <= 0) return;
      const inv: Invoice = {
        id, number, clientId: client.id, clientName: client.name, clientAddress: client.address, clientEmail: client.email,
        period: m, issueDate: date, dueDate: date, lines: [{ desc: `Past earnings for ${range}`, qty: 1, unit: amount, kind }],
        subtotal: amount, vatRate: 0, vat: 0, total: amount, status: 'paid', paidDate: date, note: '', terms: '',
        entryIds, createdAt: now, currency: '', fxRate: null, receivedHome: null, from: from_,
      };
      result.invoices.push(inv);
    });
  }
  return result;
}
