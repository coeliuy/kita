/**
 * Converting between the app's records and database rows. The database uses
 * snake_case column names and a few different field names (e.g. `description`,
 * `sender`); everything else maps one to one.
 */
import type { Category, Client, Collection, Expense, Invoice, KitaData, Settings, Task, Timer, TimeEntry, YearSettings } from './types';

type Row = Record<string, unknown>;

const num = (v: unknown) => (v == null ? 0 : Number(v));
const str = (v: unknown) => (v == null ? '' : String(v));
/** A timestamp for the database; records without one get the current time. */
const iso = (ms: number) => new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();

export const clientToRow = (c: Client): Row => ({
  id: c.id, name: c.name, billing: c.billing, rate: c.rate, fee: c.fee, included: c.included,
  start_date: c.startDate ?? null, end_date: c.endDate ?? null, archived: !!c.archived, color: c.color, weekly: c.weekly || 0, currency: c.currency || '',
  email: c.email, address: c.address, demo: !!c.demo, created_at: iso(c.createdAt),
});
export const clientFromRow = (r: Row): Client => ({
  id: str(r.id), name: str(r.name), billing: r.billing as Client['billing'], rate: num(r.rate), fee: num(r.fee),
  included: num(r.included), startDate: (r.start_date as string) ?? null, endDate: (r.end_date as string) ?? null,
  archived: !!r.archived, color: str(r.color), weekly: num(r.weekly), currency: str(r.currency), email: str(r.email), address: str(r.address), demo: !!r.demo,
  createdAt: Date.parse(str(r.created_at)) || 0,
});

export const entryToRow = (e: TimeEntry): Row => ({
  id: e.id, client_id: e.clientId || null, date: e.date, minutes: e.minutes, billable: e.billable, task: e.task,
  note: e.note, invoice_id: e.invoiceId || null, category_id: e.categoryId || null, task_id: e.taskId || null,
  ics_key: e.icsKey || null, demo: !!e.demo, created_at: iso(e.createdAt),
});
export const entryFromRow = (r: Row): TimeEntry => ({
  id: str(r.id), clientId: str(r.client_id), date: str(r.date), minutes: num(r.minutes), billable: !!r.billable,
  task: str(r.task), note: str(r.note), invoiceId: (r.invoice_id as string) ?? null, categoryId: str(r.category_id),
  taskId: str(r.task_id), ...(r.ics_key ? { icsKey: str(r.ics_key) } : {}), demo: !!r.demo,
  createdAt: Date.parse(str(r.created_at)) || 0,
});

export const invoiceToRow = (i: Invoice): Row => ({
  id: i.id, number: i.number, client_id: i.clientId || null, client_name: i.clientName, client_address: i.clientAddress,
  client_email: i.clientEmail, sender: i.from, period: i.period, issue_date: i.issueDate, due_date: i.dueDate,
  lines: i.lines, subtotal: i.subtotal, vat_rate: i.vatRate, vat: i.vat, total: i.total, status: i.status,
  paid_date: i.status === 'paid' ? i.paidDate ?? null : null, note: i.note, entry_ids: i.entryIds,
  currency: i.currency || '', fx_rate: i.fxRate ?? null, received_home: i.status === 'paid' ? i.receivedHome ?? null : null,
  demo: !!i.demo, created_at: iso(i.createdAt),
});
export const invoiceFromRow = (r: Row): Invoice => ({
  id: str(r.id), number: str(r.number), clientId: str(r.client_id), clientName: str(r.client_name),
  clientAddress: str(r.client_address), clientEmail: str(r.client_email),
  from: { name: '', business: '', address: '', email: '', payment: '', vatNumber: '', ...(r.sender as object) },
  period: (r.period as string) ?? null, issueDate: str(r.issue_date), dueDate: str(r.due_date),
  lines: ((r.lines as Invoice['lines']) ?? []).map(l => ({ ...l, qty: num(l.qty), unit: num(l.unit) })),
  subtotal: num(r.subtotal), vatRate: num(r.vat_rate), vat: num(r.vat), total: num(r.total),
  status: r.status === 'paid' ? 'paid' : 'unpaid', paidDate: (r.paid_date as string) ?? null, note: str(r.note),
  entryIds: (r.entry_ids as string[]) ?? [], demo: !!r.demo, createdAt: Date.parse(str(r.created_at)) || 0,
  currency: str(r.currency), fxRate: r.fx_rate == null ? null : num(r.fx_rate),
  receivedHome: r.received_home == null ? null : num(r.received_home),
});

export const expenseToRow = (x: Expense): Row => ({
  id: x.id, date: x.date, amount: x.amount, category: x.category, description: x.desc,
  client_id: x.clientId || null, demo: !!x.demo,
});
export const expenseFromRow = (r: Row): Expense => ({
  id: str(r.id), date: str(r.date), amount: num(r.amount), category: str(r.category), desc: str(r.description),
  clientId: str(r.client_id), demo: !!r.demo,
});

export const settingsToRow = (s: Settings): Row => ({
  name: s.name, business: s.business, address: s.address, email: s.email, payment: s.payment, vat_number: s.vatNumber,
  inv_prefix: s.invPrefix, next_inv: s.nextInv, terms: s.terms, vat_registered: s.vatRegistered, vat_rate: s.vatRate,
  theme: s.theme, capacity: s.capacity || 0, inv_notes: s.invNotes, hide_setup: s.hideSetup,
  country: s.country, currency: s.currency, set_aside: s.setAside, fx_rates: s.fxRates, updated_at: new Date().toISOString(),
});
export const settingsFromRow = (r: Row): Partial<Settings> => ({
  name: str(r.name), business: str(r.business), address: str(r.address), email: str(r.email), payment: str(r.payment),
  vatNumber: str(r.vat_number), invPrefix: str(r.inv_prefix), nextInv: num(r.next_inv) || 1,
  terms: r.terms as Settings['terms'], vatRegistered: !!r.vat_registered, vatRate: num(r.vat_rate),
  theme: (r.theme as Settings['theme']) ?? '', capacity: num(r.capacity), invNotes: r.inv_notes !== false,
  hideSetup: !!r.hide_setup, country: (r.country as Settings['country']) ?? '', currency: str(r.currency) || 'GBP',
  setAside: r.set_aside == null ? 25 : num(r.set_aside), fxRates: (r.fx_rates as Settings['fxRates']) ?? {},
});

export const yearToRow = (taxYear: number, y: YearSettings): Row => ({
  tax_year: taxYear, other_income: y.otherIncome, goal: y.goal, goal_type: y.goalType, tax_saved: y.taxSaved,
  rate_overrides: y.rateOverrides,
});
export const yearFromRow = (r: Row): YearSettings => ({
  otherIncome: num(r.other_income), goal: num(r.goal), goalType: r.goal_type === 'net' ? 'net' : 'gross',
  taxSaved: num(r.tax_saved), rateOverrides: (r.rate_overrides as YearSettings['rateOverrides']) ?? {},
});

export const timerToRow = (t: Timer): Row => ({
  client_id: t.clientId || null, category_id: t.categoryId || null, task_id: t.taskId || null, task: t.task,
  started_at: new Date(t.startedAt).toISOString(),
});
export const timerFromRow = (r: Row): Timer => ({
  clientId: str(r.client_id), categoryId: str(r.category_id), taskId: str(r.task_id), task: str(r.task),
  startedAt: Date.parse(str(r.started_at)),
});

export const categoryToRow = (c: Category): Row => ({ id: c.id, name: c.name, demo: !!c.demo, created_at: iso(c.createdAt) });
export const categoryFromRow = (r: Row): Category => ({
  id: str(r.id), name: str(r.name), demo: !!r.demo, createdAt: Date.parse(str(r.created_at)) || 0,
});

export const taskToRow = (t: Task): Row => ({
  id: t.id, client_id: t.clientId || null, category_id: t.categoryId || null, title: t.title, estimate: t.estimate || 0,
  due: t.due || null, recur: t.recur, notes: t.notes, status: t.status, done_at: t.status === 'done' ? t.doneAt ?? null : null,
  demo: !!t.demo, created_at: iso(t.createdAt),
});
export const taskFromRow = (r: Row): Task => ({
  id: str(r.id), clientId: str(r.client_id), categoryId: str(r.category_id), title: str(r.title), estimate: num(r.estimate),
  due: (r.due as string) ?? null, recur: (r.recur as Task['recur']) || '', notes: str(r.notes),
  status: (r.status as Task['status']) || 'todo', doneAt: (r.done_at as string) ?? null, demo: !!r.demo,
  createdAt: Date.parse(str(r.created_at)) || 0,
});

/** Database table and converters for each collection. */
export const TABLES: { [C in Collection]: { table: string; toRow: (x: KitaData[C][number]) => Row; fromRow: (r: Row) => KitaData[C][number] } } = {
  clients: { table: 'clients', toRow: clientToRow, fromRow: clientFromRow },
  entries: { table: 'time_entries', toRow: entryToRow, fromRow: entryFromRow },
  invoices: { table: 'invoices', toRow: invoiceToRow, fromRow: invoiceFromRow },
  expenses: { table: 'expenses', toRow: expenseToRow, fromRow: expenseFromRow },
  categories: { table: 'categories', toRow: categoryToRow, fromRow: categoryFromRow },
  tasks: { table: 'tasks', toRow: taskToRow, fromRow: taskFromRow },
};
