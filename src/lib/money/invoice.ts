/**
 * Invoice maths: line amounts, totals with VAT, due dates, and filling in a
 * new invoice from tracked time.
 */
import { billableMinutes, overageHoursToBill, retainerInvoicedForMonth, retainerUsage } from './billing';
import { addDays, monthEnd, monthLabel, monthOf, shiftMonth } from './dates';
import { roundPence, sumPounds, toPence } from './money';
import type { Client, Invoice, InvoiceLine, InvoiceLineKind, ISODate, MonthKey, PaymentTerms, TimeEntry } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quantity × unit price, rounded to the penny. */
export function lineAmount(line: Pick<InvoiceLine, 'qty' | 'unit'>): number {
  return roundPence((+line.qty || 0) * (+line.unit || 0));
}

export interface InvoiceTotals {
  subtotal: number;
  vat: number;
  total: number;
}

/**
 * Subtotal, VAT and total. Pass a VAT rate of 0 if you aren't VAT registered.
 * Each line is rounded to the penny first, then VAT is worked out on the subtotal.
 */
export function invoiceTotals(lines: Pick<InvoiceLine, 'qty' | 'unit'>[], vatRate: number): InvoiceTotals {
  const subtotal = sumPounds(lines.map(lineAmount));
  const vat = roundPence((subtotal * (vatRate || 0)) / 100);
  return { subtotal, vat, total: (toPence(subtotal) + toPence(vat)) / 100 };
}

/**
 * When an invoice is due. Terms are a number of days, or 'eofm' for the end
 * of the month after the issue date.
 */
export function dueDate(issueDate: ISODate, terms: PaymentTerms): ISODate {
  if (terms === 'eofm') return monthEnd(shiftMonth(monthOf(issueDate), 1));
  return addDays(issueDate, Number(terms) || 30);
}

export function isOverdue(invoice: Pick<Invoice, 'status' | 'dueDate'>, today: ISODate): boolean {
  return invoice.status !== 'paid' && invoice.dueDate < today;
}

/** Drop empty lines (no description and no price) before saving. */
export function cleanLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.filter(l => (l.desc || '').trim() || +l.unit);
}

export const blankLine = (): InvoiceLine => ({ desc: '', detail: '', qty: 1, unit: 0, kind: 'custom' });

export interface InvoiceDraft {
  lines: InvoiceLine[];
  /** Time entries this invoice will mark as invoiced. */
  entryIds: string[];
}

export interface DraftOptions<E extends TimeEntry> {
  /** What hourly time is grouped into lines by, e.g. its category. Default: the task name. */
  groupBy?: (e: E) => string;
  /** Smaller text under a line, describing the time it covers (e.g. the tasks done). */
  describe?: (entries: E[], kind: InvoiceLineKind) => string;
}

/**
 * Fill in a new invoice for a client and month.
 *
 * @param monthEntries  all of this client's time entries in the month
 * @param clientInvoices  all of this client's existing invoices
 *
 * - Hourly: one line per group (by default each task), from billable time
 *   not yet invoiced, largest first.
 * - Retainer: the monthly fee, unless an invoice for that month already has
 *   it, plus overage hours. Overage counts ALL billable hours in the month,
 *   minus overage already invoiced, so invoicing part-way through the month
 *   never loses or double-charges hours.
 * - Fixed fee: whatever is left of the project fee after earlier invoices.
 */
export function draftInvoiceLines<E extends TimeEntry>(
  client: Client,
  month: MonthKey,
  monthEntries: E[],
  clientInvoices: Invoice[],
  options: DraftOptions<E> = {},
): InvoiceDraft {
  const groupBy = options.groupBy ?? ((e: E) => (e.task || '').trim() || 'Work');
  const describe = (es: E[], kind: InvoiceLineKind) => {
    const text = options.describe?.(es, kind) ?? '';
    return text ? { detail: text } : {};
  };
  const label = monthLabel(month);
  const uninvoiced = monthEntries.filter(e => !e.invoiceId && e.billable !== false);
  const lines: InvoiceLine[] = [];

  if (client.billing === 'hourly') {
    const groups = new Map<string, E[]>();
    for (const e of uninvoiced) groups.set(groupBy(e), [...(groups.get(groupBy(e)) ?? []), e]);
    const minutes = (es: E[]) => es.reduce((t, e) => t + e.minutes, 0);
    for (const [name, es] of [...groups].sort((a, b) => minutes(b[1]) - minutes(a[1]))) {
      lines.push({ desc: `${name} (${label})`, ...describe(es, 'time'), qty: round2(minutes(es) / 60), unit: client.rate || 0, kind: 'time' });
    }
  } else if (client.billing === 'retainer') {
    const done = retainerInvoicedForMonth(clientInvoices, month);
    if (!done.feeInvoiced) {
      lines.push({
        desc: `Monthly retainer, ${label} (${client.included || 0} hours included)`,
        ...describe(uninvoiced, 'retainer_fee'),
        qty: 1,
        unit: client.fee || 0,
        kind: 'retainer_fee',
      });
    }
    const over = retainerUsage(client, billableMinutes(monthEntries)).overHours;
    const toBill = overageHoursToBill(over, done.overageHoursInvoiced);
    if (toBill > 0 && client.rate) {
      lines.push({ desc: `Additional hours beyond the retainer, ${label}`, qty: round2(toBill), unit: client.rate, kind: 'overage' });
    }
  } else {
    const invoicedSoFar = sumPounds(
      clientInvoices.flatMap(i => i.lines).filter(l => l.kind === 'fixed_fee').map(lineAmount),
    );
    const left = roundPence((client.fee || 0) - invoicedSoFar);
    if (left > 0) {
      lines.push({
        desc: invoicedSoFar > 0 ? 'Project fee (balance)' : 'Project fee', ...describe(uninvoiced, 'fixed_fee'),
        qty: 1, unit: left, kind: 'fixed_fee',
      });
    }
  }

  return { lines: lines.length ? lines : [blankLine()], entryIds: uninvoiced.map(e => e.id) };
}

