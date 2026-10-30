/** Example data so people can try Kita before adding their own. Everything is marked `demo` so it can be removed. */
import { addDays, draftInvoiceLines, dueDate, invoiceTotals, monthEnd, monthOf, monthStart, shiftMonth, type ISODate } from '../../lib/money';
import type { Client, Expense, Invoice, TimeEntry } from '../store/types';
import { uid } from './format';

export const COLORS = ['#1F6F5C', '#3B6FB6', '#B5541E', '#7A4FB0', '#A1306B', '#5E7F1E', '#2C8A9E', '#8A6D1F'];

/** A small repeatable random number generator, so the demo looks the same each time. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildDemoData(today: ISODate) {
  const rand = seeded(7);
  const now = Date.now();
  const base = { email: '', address: '', createdAt: now, demo: true };
  const clients: Client[] = [
    { ...base, id: uid(), name: 'Harbour & Pine Studio', billing: 'hourly', rate: 45, fee: 0, included: 0, color: COLORS[1]! },
    {
      ...base, id: uid(), name: 'Northlight Legal', billing: 'retainer', fee: 1200, included: 25, rate: 50, color: COLORS[0]!,
      startDate: monthStart(shiftMonth(monthOf(today), -3)),
    },
    { ...base, id: uid(), name: 'Fennel Bakery', billing: 'fixed', fee: 900, rate: 0, included: 0, color: COLORS[2]! },
  ];
  const tasks = [
    ['Social content', 'Campaign reporting', 'Client call'],
    ['LinkedIn posts', 'Newsletter', 'Strategy call'],
    ['Website copy', 'Brand messaging'],
  ];

  const entries: TimeEntry[] = [];
  for (let i = 55; i >= 0; i--) {
    const date = addDays(today, -i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const n = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const ci = rand() < 0.5 ? 1 : rand() < 0.7 ? 0 : 2;
      const list = tasks[ci]!;
      entries.push({
        id: uid(), clientId: clients[ci]!.id, task: list[Math.floor(rand() * list.length)]!, note: '', date,
        minutes: 30 + 15 * Math.floor(rand() * 8), billable: rand() > 0.08, createdAt: now - i * 86_400_000 + j, demo: true,
      });
    }
  }

  // Last month's invoices: the hourly one is paid, the retainer is still waiting.
  const prev = shiftMonth(monthOf(today), -1);
  const invoices: Omit<Invoice, 'number'>[] = [];
  for (const c of clients.slice(0, 2)) {
    const own = entries.filter(e => e.clientId === c.id && e.date >= monthStart(prev) && e.date <= monthEnd(prev));
    const draft = draftInvoiceLines(c, prev, own, []);
    const issueDate = monthEnd(prev);
    const paid = c.billing === 'hourly';
    const paidOn = addDays(issueDate, 10);
    const id = uid();
    invoices.push({
      id, clientId: c.id, clientName: c.name, clientAddress: '', clientEmail: '', period: prev, issueDate,
      dueDate: dueDate(issueDate, '30'), lines: draft.lines, vatRate: 0, ...invoiceTotals(draft.lines, 0),
      status: paid ? 'paid' : 'unpaid', paidDate: paid ? (paidOn < today ? paidOn : today) : null, note: '',
      entryIds: draft.entryIds, createdAt: now, demo: true,
      from: { name: '', business: '', address: '', email: '', payment: '', vatNumber: '' },
    });
    for (const e of entries) if (draft.entryIds.includes(e.id)) e.invoiceId = id;
  }

  const expenses: Expense[] = (
    [
      ['Canva Pro subscription', 13, 'Software and subscriptions', 3],
      ['Laptop stand', 35, 'Office costs and equipment', 20],
      ['Train to client workshop', 42.6, 'Travel', 12],
      ['Paid social course', 120, 'Training courses', 30],
    ] as const
  ).map(([desc, amount, category, ago]) => ({ id: uid(), date: addDays(today, -ago), amount, category, desc, clientId: '', demo: true }));

  return { clients, entries, invoices, expenses };
}
