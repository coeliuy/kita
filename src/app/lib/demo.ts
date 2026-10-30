/** Example data so people can try Kita before adding their own. Everything is marked `demo` so it can be removed. */
import { addDays, draftInvoiceLines, dueDate, invoiceTotals, monthEnd, monthOf, monthStart, shiftMonth, type ISODate } from '../../lib/money';
import type { Category, Client, Expense, Invoice, Task, TimeEntry } from '../store/types';
import { uid } from './format';
import { invoiceDraftOptions } from './invoiceDetails';

export const COLORS = ['#1F6F5C', '#3B6FB6', '#B5541E', '#7A4FB0', '#A1306B', '#5E7F1E', '#2C8A9E', '#8A6D1F'];

/** A small repeatable random number generator, so the demo looks the same each time. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Example clients, categories, tasks, time, invoices and expenses.
 * Categories you already have with the same name are reused rather than duplicated.
 */
export function buildDemoData(today: ISODate, existingCategories: Category[] = []) {
  const rand = seeded(7);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const now = Date.now();
  const base = { email: '', address: '', createdAt: now, weekly: 0, demo: true };
  const clients: Client[] = [
    { ...base, id: uid(), name: 'Harbour & Pine Studio', billing: 'hourly', rate: 45, fee: 0, included: 0, color: COLORS[1]! },
    {
      ...base, id: uid(), name: 'Northlight Legal', billing: 'retainer', fee: 1200, included: 25, rate: 50, color: COLORS[0]!,
      startDate: monthStart(shiftMonth(monthOf(today), -3)),
    },
    { ...base, id: uid(), name: 'Fennel Bakery', billing: 'fixed', fee: 900, rate: 0, included: 0, color: COLORS[2]! },
  ];

  const categories: Category[] = [];
  const cat: Record<string, string> = {};
  for (const name of ['Social media', 'Email marketing', 'Content writing', 'Strategy and calls', 'Admin and reporting']) {
    const found = existingCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (found) cat[name] = found.id;
    else {
      const c = { id: uid(), name, createdAt: now, demo: true };
      categories.push(c);
      cat[name] = c.id;
    }
  }

  // The kind of work each client gets, by category.
  const work: Record<string, string[]>[] = [
    { 'Social media': ['Instagram content calendar', 'Reels captions'], 'Content writing': ['Website product pages', 'Blog post draft'], 'Strategy and calls': ['Monthly check-in call'] },
    { 'Social media': ['LinkedIn post batch', 'Comment engagement'], 'Email marketing': ['Monthly newsletter', 'Welcome email edits'], 'Admin and reporting': ['Campaign report'], 'Strategy and calls': ['Strategy call'] },
    { 'Content writing': ['Brand messaging guide', 'About page copy'], 'Social media': ['Launch posts'] },
  ];
  const notes = ['Sent for approval', 'Drafted 5 posts', 'Revisions from feedback', '', '', '', ''];

  const entry = (e: Partial<TimeEntry> & Pick<TimeEntry, 'clientId' | 'date' | 'minutes' | 'task'>): TimeEntry => ({
    id: uid(), categoryId: '', taskId: '', note: '', billable: true, createdAt: now, demo: true, ...e,
  });
  const entries: TimeEntry[] = [];
  for (let i = 55; i >= 1; i--) {
    const date = addDays(today, -i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const n = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const ci = rand() < 0.5 ? 1 : rand() < 0.7 ? 0 : 2;
      const category = pick(Object.keys(work[ci]!));
      entries.push(entry({
        clientId: clients[ci]!.id, categoryId: cat[category]!, task: pick(work[ci]![category]!), note: pick(notes), date,
        minutes: 30 + 15 * Math.floor(rand() * 8), billable: rand() > 0.08, createdAt: now - i * 86_400_000 + j,
      }));
    }
  }

  // Finished tasks, built from earlier time, with estimates a bit off either way (for insights).
  const tasks: Task[] = [];
  const task = (t: Partial<Task> & Pick<Task, 'clientId' | 'title'>): Task => ({
    id: uid(), categoryId: '', estimate: 0, due: null, recur: '', notes: '', status: 'todo', doneAt: null, createdAt: now, demo: true, ...t,
  });
  const groups = new Map<string, TimeEntry[]>();
  for (const e of entries.filter(e => e.date < addDays(today, -7))) {
    const k = `${e.clientId}|${e.task}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const list of [...groups.values()].slice(0, 8)) {
    const done = list.slice(-2);
    const spent = done.reduce((t, e) => t + e.minutes, 0);
    const t = task({
      clientId: done[0]!.clientId, categoryId: done[0]!.categoryId, title: done[0]!.task,
      estimate: Math.max(15, Math.round((spent * (0.7 + rand() * 0.35)) / 15) * 15), status: 'done', doneAt: done.at(-1)!.date,
    });
    for (const e of done) e.taskId = t.id;
    tasks.push(t);
  }

  // Open tasks for the coming days; two already started yesterday.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const friday = addDays(today, (5 - weekday + 7) % 7 || 7);
  const open: [number, string, string, number, ISODate, Task['recur'], string][] = [
    [1, 'Social media', 'Friday LinkedIn batch', 120, friday, 'weekly', 'Five posts, scheduled'],
    [1, 'Email marketing', 'Next month’s newsletter', 180, addDays(today, 6), '', ''],
    [1, 'Admin and reporting', 'Monthly campaign report', 90, addDays(today, 3), 'monthly', ''],
    [0, 'Content writing', 'Spring collection product pages', 240, addDays(today, 9), '', ''],
    [0, 'Strategy and calls', 'Q1 content plan', 150, addDays(today, 12), '', ''],
    [2, 'Social media', 'Launch week posts', 120, addDays(today, 4), '', 'Six posts plus stories'],
  ];
  const openTasks = open.map(([ci, category, title, estimate, due, recur, note]) =>
    task({ clientId: clients[ci]!.id, categoryId: cat[category]!, title, estimate, due, recur, notes: note }));
  for (const t of [openTasks[0]!, openTasks[3]!]) {
    t.status = 'doing';
    entries.push(entry({ clientId: t.clientId, categoryId: t.categoryId, taskId: t.id, task: t.title, date: addDays(today, -1), minutes: 60 }));
  }
  tasks.push(...openTasks);

  // Last month's invoices: the hourly one is paid, the retainer is still waiting.
  const prev = shiftMonth(monthOf(today), -1);
  const invoices: Omit<Invoice, 'number'>[] = [];
  for (const c of clients.slice(0, 2)) {
    const own = entries.filter(e => e.clientId === c.id && e.date >= monthStart(prev) && e.date <= monthEnd(prev));
    const draft = draftInvoiceLines(c, prev, own, [], invoiceDraftOptions([...existingCategories, ...categories], tasks, true));
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

  return { clients, categories, tasks, entries, invoices, expenses };
}
