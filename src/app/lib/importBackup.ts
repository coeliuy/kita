/**
 * Importing a backup file into the current account.
 *
 * Accepts either the prototype's "Download everything (JSON)" file
 * (kita-backup.json from the single-page version) or a backup from this app.
 * Everything gets new ids, so importing never overwrites existing records and
 * the same file can be imported into any account. Demo data is skipped.
 */
import {
  monthOf, monthStart, ratesForTaxYear, sumPounds, taxYearOf,
  type InvoiceLine, type InvoiceLineKind, type PaymentTerms,
} from '../../lib/money';
import type { Category, Client, Expense, Invoice, KitaData, RateOverrides, Settings, Task, TimeEntry, YearSettings } from '../store/types';
import { EXPENSE_CATEGORIES } from './categories';
import { COLORS } from './demo';

export interface ImportResult {
  clients: Client[];
  invoices: Invoice[];
  entries: TimeEntry[];
  expenses: Expense[];
  categories: Category[];
  tasks: Task[];
  settings: Partial<Settings>;
  /** Per-tax-year settings (goal, salary, tax pot, rate changes). */
  years: { taxYear: number; patch: Partial<YearSettings> }[];
  skipped: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Prototype tax settings → names used now. */
const PROTOTYPE_RATES: [string, keyof RateOverrides][] = [
  ['pa', 'personalAllowance'], ['basicBand', 'basicRateBand'], ['addl', 'additionalRateThreshold'],
  ['taper', 'allowanceTaperThreshold'], ['r1', 'basicRate'], ['r2', 'higherRate'], ['r3', 'additionalRate'],
  ['c4lo', 'class4LowerProfitsLimit'], ['c4hi', 'class4UpperProfitsLimit'], ['c4a', 'class4MainRate'], ['c4b', 'class4UpperRate'],
];

/** Work out what a prototype invoice line was for, from its wording and the client. */
function lineKind(desc: string, billing: string | undefined): InvoiceLineKind {
  if (desc.startsWith('Monthly retainer')) return 'retainer_fee';
  if (desc.startsWith('Additional hours beyond the retainer')) return 'overage';
  if (billing === 'fixed' && desc.startsWith('Project fee')) return 'fixed_fee';
  if (billing === 'hourly') return 'time';
  return 'custom';
}

export class ImportError extends Error {}

export function importBackup(raw: unknown, existing: KitaData, today: string, newId: () => string): ImportResult {
  if (!isObj(raw) || !Array.isArray(raw.clients)) {
    throw new ImportError('This doesn’t look like a Kita backup. Choose the .json file from “Download everything”.');
  }
  const fromPrototype = !('years' in raw);
  const ps = isObj(raw.settings) ? raw.settings : {};
  let skipped = 0;

  // New ids for everything, remembered so links between records survive.
  const ids = new Map<string, string>();
  const idFor = (old: unknown) => {
    const k = s(old);
    if (!k) return '';
    if (!ids.has(k)) ids.set(k, newId());
    return ids.get(k)!;
  };
  const known = (old: unknown) => (ids.has(s(old)) ? ids.get(s(old))! : '');
  const real = <T extends Obj>(list: T[]) => list.filter(x => {
    if (x.demo) { skipped++; return false; }
    return true;
  });

  const rawEntries = real(arr(raw.entries));
  const firstEntry = new Map<string, string>();
  for (const e of rawEntries) {
    const cid = s(e.clientId);
    if (isDate(e.date) && (!firstEntry.has(cid) || e.date < firstEntry.get(cid)!)) firstEntry.set(cid, e.date);
  }

  const rawClients = real(arr(raw.clients));
  const clients: Client[] = rawClients.map((c, i) => {
    const billing = c.billing === 'retainer' || c.billing === 'fixed' ? c.billing : 'hourly';
    const color = /^#[0-9a-f]{6}$/i.test(s(c.color)) ? s(c.color) : COLORS[i % COLORS.length]!;
    const start = isDate(c.startDate) ? c.startDate : billing === 'retainer' ? monthStart(monthOf(firstEntry.get(s(c.id)) ?? today)) : null;
    return {
      id: idFor(c.id), name: s(c.name).slice(0, 200) || 'Unnamed client', billing, rate: n(c.rate), fee: n(c.fee),
      included: n(c.included), startDate: start, endDate: isDate(c.endDate) ? c.endDate : null, archived: !!c.archived,
      color, weekly: Math.max(0, n(c.weekly)), currency: /^[A-Z]{3}$/.test(s(c.currency)) ? s(c.currency) : '', email: s(c.email), address: s(c.address), createdAt: n(c.createdAt) || Date.now(),
    };
  });
  const billingOf = new Map(rawClients.map(c => [idFor(c.id), s(c.billing)]));
  const clientById = new Map(clients.map(c => [c.id, c]));

  // Work categories: reuse one you already have with the same name.
  const categories: Category[] = [];
  for (const c of real(arr(raw.categories))) {
    const name = s(c.name).trim().slice(0, 100);
    if (!name) { skipped++; continue; }
    const same = [...existing.categories, ...categories].find(x => x.name.toLowerCase() === name.toLowerCase());
    if (same) ids.set(s(c.id), same.id);
    else categories.push({ id: idFor(c.id), name, createdAt: n(c.createdAt) || Date.now() });
  }

  const tasks: Task[] = real(arr(raw.tasks)).flatMap(t => {
    const title = s(t.title).trim().slice(0, 300);
    if (!title) { skipped++; return []; }
    const status = t.status === 'doing' || t.status === 'done' ? t.status : 'todo';
    return [{
      id: idFor(t.id), clientId: known(t.clientId), categoryId: known(t.categoryId), title,
      estimate: Math.max(0, Math.round(n(t.estimate))), due: isDate(t.due) ? t.due : null,
      recur: t.recur === 'weekly' || t.recur === 'monthly' ? t.recur : '', notes: s(t.notes), status,
      doneAt: status === 'done' ? (isDate(t.doneAt) ? t.doneAt : null) : null, createdAt: n(t.createdAt) || Date.now(),
    }];
  });

  const sender = {
    name: s(ps.name), business: s(ps.business), address: s(ps.address), email: s(ps.email),
    payment: s(ps.payment), vatNumber: s(ps.vatNumber),
  };
  const usedNumbers = new Set(existing.invoices.map(i => i.number));
  const invoices: Invoice[] = real(arr(raw.invoices)).flatMap(i => {
    if (!isDate(i.issueDate)) { skipped++; return []; }
    const clientId = known(i.clientId);
    const client = clientById.get(clientId);
    const lines: InvoiceLine[] = arr(i.lines).map(l => ({
      desc: s(l.desc), ...(l.detail ? { detail: s(l.detail) } : {}), qty: n(l.qty), unit: n(l.unit),
      kind: (['time', 'retainer_fee', 'overage', 'fixed_fee', 'custom'] as const).includes(l.kind as InvoiceLineKind)
        ? (l.kind as InvoiceLineKind) : lineKind(s(l.desc), billingOf.get(clientId)),
    }));
    let number = s(i.number) || 'IMPORTED';
    for (let k = 2; usedNumbers.has(number); k++) number = `${s(i.number)}-${k}`;
    usedNumbers.add(number);
    const vat = n(i.vat);
    const paid = i.status === 'paid';
    return [{
      id: idFor(i.id), number, clientId, clientName: s(i.clientName) || client?.name || '',
      clientAddress: s(i.clientAddress) || client?.address || '', clientEmail: s(i.clientEmail) || client?.email || '',
      period: /^\d{4}-\d{2}$/.test(s(i.period)) ? s(i.period) : null, issueDate: i.issueDate,
      dueDate: isDate(i.dueDate) ? i.dueDate : i.issueDate, lines,
      subtotal: n(i.subtotal) || sumPounds(lines.map(l => l.qty * l.unit)), vat,
      vatRate: n(i.vatRate) || (vat > 0 ? n(ps.vatRate) || 20 : 0), total: n(i.total),
      status: paid ? 'paid' : 'unpaid',
      // Older invoices may be marked paid without a date; the issue date is the best guess.
      paidDate: paid ? (isDate(i.paidDate) ? i.paidDate : i.issueDate) : null,
      note: s(i.note), terms: s(i.terms), entryIds: [], createdAt: n(i.createdAt) || Date.now(),
      currency: /^[A-Z]{3}$/.test(s(i.currency)) ? s(i.currency) : '', fxRate: n(i.fxRate) > 0 ? n(i.fxRate) : null,
      receivedHome: paid && i.receivedHome != null && n(i.receivedHome) >= 0 ? n(i.receivedHome) : null,
      from: isObj(i.from) ? { ...sender, ...(i.from as Obj) } as Invoice['from'] : sender,
    }];
  });
  const invoiceIds = new Set(invoices.map(i => i.id));

  const entries: TimeEntry[] = rawEntries.flatMap(e => {
    const minutes = Math.round(n(e.minutes));
    if (!isDate(e.date) || minutes <= 0 || minutes > 1440) { skipped++; return []; }
    const invoiceId = known(e.invoiceId);
    return [{
      id: idFor(e.id), clientId: known(e.clientId), date: e.date, minutes, billable: e.billable !== false,
      task: s(e.task), note: s(e.note), invoiceId: invoiceIds.has(invoiceId) ? invoiceId : null,
      categoryId: known(e.categoryId), taskId: known(e.taskId), ...(e.icsKey ? { icsKey: s(e.icsKey) } : {}),
      createdAt: n(e.createdAt) || Date.now(),
    }];
  });
  for (const inv of invoices) inv.entryIds = entries.filter(e => e.invoiceId === inv.id).map(e => e.id);

  const expenses: Expense[] = real(arr(raw.expenses)).flatMap(x => {
    if (!isDate(x.date)) { skipped++; return []; }
    const category = (EXPENSE_CATEGORIES as readonly string[]).includes(s(x.category)) ? s(x.category) : 'Other allowable costs';
    return [{ id: idFor(x.id), date: x.date, amount: Math.max(0, n(x.amount)), category, desc: s(x.desc), clientId: known(x.clientId) }];
  });

  const terms = (['7', '14', '30', 'eofm'] as const).includes(s(ps.terms) as PaymentTerms) ? (s(ps.terms) as PaymentTerms) : undefined;
  const settings: Partial<Settings> = {
    ...sender,
    ...(ps.invPrefix != null && { invPrefix: s(ps.invPrefix) }),
    nextInv: Math.max(existing.settings.nextInv, Math.floor(n(ps.nextInv)) || 1),
    ...(terms && { terms }),
    vatRegistered: !!(ps.vatRegistered ?? ps.vat),
    ...(['GB', 'PH', 'US', 'OTHER'].includes(s(ps.country)) && { country: s(ps.country) as Settings['country'] }),
    ...(/^[A-Z]{3}$/.test(s(ps.currency)) && { currency: s(ps.currency) }),
    ...(ps.setAside != null && { setAside: Math.min(100, Math.max(0, n(ps.setAside))) }),
    ...(ps.capacity != null && { capacity: Math.min(168, Math.max(0, n(ps.capacity))) }),
    ...(ps.invNotes != null && { invNotes: !!ps.invNotes }),
    ...(ps.vatRate != null && { vatRate: n(ps.vatRate) }),
    ...(ps.invTerms != null && { invTerms: s(ps.invTerms) }),
  };

  const years: ImportResult['years'] = [];
  if (fromPrototype) {
    // The prototype had one goal, salary and set of rates: they become this tax year's.
    const taxYear = taxYearOf(today);
    const hmrc = ratesForTaxYear(taxYear).rates;
    const tax = isObj(ps.tax) ? ps.tax : {};
    const rateOverrides: RateOverrides = {};
    for (const [old, now] of PROTOTYPE_RATES) if (tax[old] != null && n(tax[old]) !== hmrc[now]) rateOverrides[now] = n(tax[old]);
    years.push({
      taxYear,
      patch: {
        otherIncome: n(ps.otherIncome), goal: n(ps.goal), goalType: ps.goalType === 'net' ? 'net' : 'gross',
        taxSaved: n(ps.taxSaved), rateOverrides,
      },
    });
  } else if (isObj(raw.years)) {
    for (const [k, y] of Object.entries(raw.years)) {
      if (!/^\d{4}$/.test(k) || !isObj(y)) continue;
      years.push({
        taxYear: +k,
        patch: {
          otherIncome: n(y.otherIncome), goal: n(y.goal), goalType: y.goalType === 'net' ? 'net' : 'gross',
          taxSaved: n(y.taxSaved), rateOverrides: isObj(y.rateOverrides) ? (y.rateOverrides as RateOverrides) : {},
        },
      });
    }
  }

  return { clients, categories, tasks, invoices, entries, expenses, settings, years, skipped };
}
