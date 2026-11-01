/**
 * Importing past invoices or earnings from a spreadsheet (saved as CSV).
 *
 * Built for the first day with Kita: a freelancer exports their invoices from
 * a spreadsheet, accounting tool or bank and Kita fills in this year's income
 * by client. Column names are matched loosely ("Client", "Customer", "Amount",
 * "Total", "Date paid"...), so most exports work without editing.
 *
 * - Each row becomes an invoice, paid unless the row says otherwise.
 * - Clients are matched by name; new ones are created.
 * - Hours, if given, become time entries linked to the invoice, so rates,
 *   capacity and insights have something to go on without showing as unbilled.
 * - Rows already in Kita (same number, or same client, date and amount) are skipped,
 *   so importing the same file twice doesn't double anything.
 */
import { dueDate, monthOf, roundPence, type ISODate } from '../../lib/money';
import type { Client, Invoice, KitaData, Settings, TimeEntry } from '../store/types';
import { COLORS } from './demo';
import { uid } from './format';
import type { ImportResult } from './importBackup';
import { region } from './region';

/** Read CSV text (comma, semicolon or tab separated; quoted cells allowed). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => firstLine.split(c).length - 1;
  const sep = [',', ';', '\t'].reduce((a, b) => (count(b) > count(a) ? b : a), ',');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

type Field = 'client' | 'amount' | 'issueDate' | 'paidDate' | 'number' | 'hours' | 'currency' | 'received' | 'desc' | 'status' | 'tax' | 'month';

/** Header names Kita recognises for each field (lower case, without punctuation). */
const NAMES: Record<Field, string[]> = {
  client: ['client', 'client name', 'customer', 'customer name', 'company', 'bill to', 'billed to', 'payer'],
  amount: ['amount', 'total', 'invoice total', 'total amount', 'gross', 'amount due', 'amount invoiced', 'value', 'earnings', 'income', 'fee', 'net', 'subtotal', 'amount paid'],
  issueDate: ['date', 'invoice date', 'issue date', 'issued', 'date issued', 'issued on', 'created', 'date sent', 'sent'],
  paidDate: ['paid date', 'date paid', 'paid on', 'payment date', 'date received', 'received on', 'paid'],
  number: ['invoice', 'invoice number', 'invoice no', 'invoice #', 'invoice num', 'number', 'no', 'inv', 'ref', 'reference', 'invoice id'],
  hours: ['hours', 'hours worked', 'time', 'time spent', 'hrs', 'duration'],
  currency: ['currency', 'ccy'],
  received: ['received', 'amount received', 'received home', 'received in my currency', 'converted', 'amount in my currency'],
  desc: ['description', 'details', 'item', 'items', 'service', 'project', 'work', 'notes', 'memo'],
  status: ['status', 'state', 'paid status', 'payment status'],
  tax: ['vat', 'tax', 'sales tax', 'vat amount', 'tax amount'],
  month: ['month', 'month worked', 'period', 'work month'],
};

const norm = (h: string) => h.toLowerCase().replace(/[()[\]{}.:_£$€₱]/g, ' ').replace(/\s+/g, ' ').trim();

/** Which column holds each field. Exact names win over "starts with" matches. */
export function findColumns(header: string[]): Partial<Record<Field, number>> {
  const cols: Partial<Record<Field, number>> = {};
  const taken = new Set<number>();
  const hs = header.map(norm);
  for (const pass of ['exact', 'prefix'] as const) {
    for (const f of Object.keys(NAMES) as Field[]) {
      if (cols[f] != null) continue;
      for (const name of NAMES[f]) {
        const i = hs.findIndex((h, j) => !taken.has(j) && (pass === 'exact' ? h === name : h.startsWith(name + ' ')));
        if (i >= 0) { cols[f] = i; taken.add(i); break; }
      }
    }
  }
  return cols;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number): ISODate | null => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/**
 * A date as written in a spreadsheet: 2026-10-31, 31/10/2026, 10/31/2026,
 * 31 Oct 2026, Oct 31, 2026. `dayFirst` decides 01/02 (UK and PH: 1 Feb; US: 2 Jan).
 */
export function parseDate(raw: string, dayFirst: boolean): ISODate | null {
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!;
    // 31/10 can only be day first; 10/31 only month first.
    const df = a > 12 ? true : b > 12 ? false : dayFirst;
    return df ? valid(y, b, a) : valid(y, a, b);
  }
  m = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-,]+(\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[2]!)) return valid(+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[1]!)) return valid(+m[3]!, MONTHS.indexOf(m[1]!) + 1, +m[2]!);
  return null;
}

/** "£1,234.50", "1234.5", "(200.00)", "USD 1,000" → a number; null if there isn't one. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[^\d.,]/g, '');
  // 1.234,56 (comma as the decimal point) → 1234.56
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!s || isNaN(+s)) return null;
  return roundPence(negative ? -+s : +s);
}

/** "7.5", "7:30", "7h 30m" → hours. */
export function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return +m[1]! + +m[2]! / 60;
  m = /^(?:(\d+(?:\.\d+)?)\s*h[a-z]*)?\s*(?:(\d+)\s*m[a-z]*)?$/.exec(s);
  if (m && (m[1] || m[2])) return (+(m[1] ?? 0)) + (+(m[2] ?? 0)) / 60;
  const n = +s.replace(/,/g, '.');
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const UNPAID = /^(unpaid|outstanding|due|overdue|sent|open|pending|awaiting|draft|not paid|no)$/i;

export interface ImportPreviewClient { name: string; isNew: boolean; invoices: number; total: number; hours: number }
export interface InvoiceImport {
  result: ImportResult;
  clients: ImportPreviewClient[];
  invoices: number;
  unpaid: number;
  /** Paid income in the home currency. */
  paidTotal: number;
  skipped: { line: number; reason: string }[];
  /** Columns that were recognised, for showing people what Kita understood. */
  columns: Partial<Record<Field, string>>;
}

export class InvoiceImportError extends Error {}

/** Work out what importing this CSV would add. Nothing is saved until the result is passed to importData. */
export function importInvoicesCsv(text: string, d: KitaData, todayDate: ISODate): InvoiceImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new InvoiceImportError('That file doesn’t have any rows to import. It needs a header row, then one row per invoice.');
  const header = rows[0]!;
  const cols = findColumns(header);
  if (cols.client == null || cols.amount == null || (cols.issueDate == null && cols.paidDate == null)) {
    const missing = [cols.client == null && 'client', cols.amount == null && 'amount', cols.issueDate == null && cols.paidDate == null && 'date'].filter(Boolean);
    throw new InvoiceImportError(`Kita couldn’t find a column for the ${missing.join(' or ')}. Name your columns Client, Amount and Date (see the template).`);
  }
  const s = d.settings;
  const home = s.currency || 'GBP';
  const dayFirst = region(d).code !== 'US';
  const get = (r: string[], f: Field) => (cols[f] == null ? '' : r[cols[f]!] ?? '');

  const clientsByName = new Map(d.clients.map(c => [c.name.trim().toLowerCase(), c]));
  const newClients = new Map<string, Client>();
  const usedNumbers = new Set(d.invoices.map(i => i.number));
  const seen = new Set(d.invoices.map(i => `${i.clientName.trim().toLowerCase()}|${i.issueDate}|${i.total}`));
  const from = { name: s.name, business: s.business, address: s.address, email: s.email, payment: s.payment, vatNumber: s.vatRegistered ? s.vatNumber : '' };
  const invoices: Invoice[] = [];
  const entries: TimeEntry[] = [];
  const skipped: InvoiceImport['skipped'] = [];
  const stats = new Map<Client, ImportPreviewClient>();
  let maxNumber = 0, unpaid = 0, paidTotal = 0, k = 0;
  const now = Date.now();

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = get(r, 'client').trim();
    const amount = parseAmount(get(r, 'amount'));
    const issued = parseDate(get(r, 'issueDate'), dayFirst);
    const paidRaw = get(r, 'paidDate');
    const paidOn = parseDate(paidRaw, dayFirst);
    const issueDate = issued ?? paidOn;
    if (!name) return skipped.push({ line, reason: 'no client name' });
    if (amount == null) return skipped.push({ line, reason: 'no amount' });
    if (amount <= 0) return skipped.push({ line, reason: 'amount is zero or a refund' });
    if (!issueDate) {
      const raw = get(r, 'issueDate') || paidRaw;
      return skipped.push({ line, reason: raw ? `couldn’t read the date “${raw}”` : 'no date' });
    }
    if (issueDate > todayDate) return skipped.push({ line, reason: 'date is in the future' });

    // Paid unless the row says otherwise: a blank "date paid" column or an "unpaid"-type status.
    const status = get(r, 'status').trim();
    const paid = status ? !UNPAID.test(status) : cols.paidDate != null && cols.issueDate != null ? !!paidOn || /^(yes|paid|y)$/i.test(paidRaw.trim()) : true;
    const paidDate = paid ? (paidOn && paidOn >= issueDate ? paidOn : issueDate) : null;

    const code = get(r, 'currency').trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(code) && code !== home ? code : '';
    let fxRate: number | null = null, receivedHome: number | null = null;
    if (currency) {
      const received = parseAmount(get(r, 'received'));
      if (received && received > 0) { receivedHome = received; fxRate = received / amount; }
      else if (s.fxRates[currency]) fxRate = s.fxRates[currency]!.rate;
      else return skipped.push({ line, reason: `amount in ${currency} with no exchange rate (add an “Amount received” column in ${home})` });
    }

    const key = name.toLowerCase();
    let client = clientsByName.get(key) ?? newClients.get(key);
    if (!client) {
      client = {
        id: uid(), name, billing: 'hourly', rate: 0, fee: 0, included: 0, weekly: 0, currency,
        color: COLORS[(d.clients.length + newClients.size) % COLORS.length]!, email: '', address: '', createdAt: now,
      };
      newClients.set(key, client);
    }

    const tax = parseAmount(get(r, 'tax')) ?? 0;
    const total = amount;
    const subtotal = roundPence(Math.max(0, total - Math.max(0, tax)));
    const dup = `${key}|${issueDate}|${total}`;
    let number = get(r, 'number').trim();
    if ((number && usedNumbers.has(number)) || seen.has(dup)) return skipped.push({ line, reason: `already in Kita${number ? ` (${number})` : ''}` });
    seen.add(dup);
    if (!number) {
      do number = `Imported ${issueDate} ${++k}`; while (usedNumbers.has(number));
    }
    usedNumbers.add(number);
    if (number.startsWith(s.invPrefix)) {
      const n = /^\d+$/.test(number.slice(s.invPrefix.length)) ? +number.slice(s.invPrefix.length) : 0;
      maxNumber = Math.max(maxNumber, n);
    }

    const monthRaw = get(r, 'month').trim();
    const period = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : parseDate(`1 ${monthRaw}`, true)?.slice(0, 7) ?? monthOf(issueDate);
    const desc = get(r, 'desc').trim() || 'Work';
    const kind = client.billing === 'retainer' ? 'retainer_fee' as const : client.billing === 'fixed' ? 'fixed_fee' as const : 'custom' as const;
    const id = uid();
    const hours = parseHours(get(r, 'hours'));
    const entryIds: string[] = [];
    if (hours && hours > 0 && hours < 1000) {
      const e: TimeEntry = {
        id: uid(), clientId: client.id, date: issueDate, minutes: Math.round(hours * 60), billable: true,
        task: desc, note: 'Imported with past invoices', invoiceId: id, categoryId: '', taskId: '', createdAt: now,
      };
      entries.push(e);
      entryIds.push(e.id);
    }
    invoices.push({
      id, number, clientId: client.id, clientName: client.name, clientAddress: client.address, clientEmail: client.email,
      period, issueDate, dueDate: dueDate(issueDate, s.terms), lines: [{ desc, qty: 1, unit: subtotal, kind }],
      subtotal, vatRate: subtotal > 0 && tax > 0 ? Math.round((tax / subtotal) * 1000) / 10 : 0, vat: roundPence(total - subtotal), total,
      status: paid ? 'paid' : 'unpaid', paidDate, note: '', terms: '', entryIds, createdAt: now,
      currency, fxRate, receivedHome: paid ? receivedHome : null, from,
    });

    const st = stats.get(client) ?? { name: client.name, isNew: newClients.has(key), invoices: 0, total: 0, hours: 0 };
    const inHomeTotal = currency ? receivedHome ?? roundPence(total * fxRate!) : total;
    st.invoices++;
    st.total = roundPence(st.total + inHomeTotal);
    st.hours += hours ?? 0;
    stats.set(client, st);
    if (paid) paidTotal = roundPence(paidTotal + inHomeTotal); else unpaid++;
  });

  // New hourly clients get the rate they actually earned, where hours were given.
  for (const c of newClients.values()) {
    const st = stats.get(c);
    if (st && st.hours > 0) c.rate = Math.round((st.total / st.hours) * (c.currency ? 1 / (invoices.find(i => i.clientId === c.id)?.fxRate || 1) : 1));
  }

  const settings: Partial<Settings> = maxNumber >= s.nextInv ? { nextInv: maxNumber + 1 } : {};
  const columns: InvoiceImport['columns'] = {};
  for (const [f, i] of Object.entries(cols) as [Field, number][]) columns[f] = header[i];
  return {
    result: {
      clients: [...newClients.values()].filter(c => stats.has(c)), invoices, entries, expenses: [], categories: [], tasks: [],
      settings, years: [], skipped: skipped.length,
    },
    clients: [...stats.values()].sort((a, b) => b.total - a.total),
    invoices: invoices.length, unpaid, paidTotal, skipped, columns,
  };
}

/** A starter spreadsheet showing the columns Kita understands. */
export function invoiceTemplateCsv(d: KitaData): string {
  const us = region(d).code === 'US';
  const date = (y: number, m: number, day: number) => (us ? `${m}/${day}/${y}` : `${day}/${m}/${y}`);
  const cur = d.settings.currency || 'GBP';
  return [
    'Client,Invoice number,Date,Date paid,Amount,Hours,Currency,Amount received,Description',
    `Northlight Legal,INV-001,${date(2026, 4, 30)},${date(2026, 5, 14)},1200,20,,,April retainer`,
    `Fennel Bakery,INV-002,${date(2026, 5, 31)},,850,12.5,,,Website updates`,
    // A client paid in dollars: what arrived in your own currency goes in "Amount received".
    cur === 'USD'
      ? `Acme Inc,INV-003,${date(2026, 6, 30)},${date(2026, 7, 10)},500,8,,,Ad campaign`
      : `Acme Inc,INV-003,${date(2026, 6, 30)},${date(2026, 7, 10)},500,8,USD,${cur === 'PHP' ? 28000 : cur === 'GBP' ? 370 : 460},Ad campaign`,
  ].join('\n');
}
