/**
 * Invoice maths: line amounts, totals with VAT, due dates, and filling in a
 * new invoice from tracked time.
 */
import { billableMinutes, overageHoursToBill, retainerInvoicedForMonth, retainerUsage } from './billing';
import { addDays, monthEnd, monthLabel, monthOf, shiftMonth } from './dates';
import { roundPence, sumPounds, toPence } from './money';
import type { Client, Invoice, InvoiceLine, ISODate, MonthKey, PaymentTerms, TimeEntry } from './types';

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

export const blankLine = (): InvoiceLine => ({ desc: '', qty: 1, unit: 0, kind: 'custom' });

export interface InvoiceDraft {
  lines: InvoiceLine[];
  /** Time entries this invoice will mark as invoiced. */
  entryIds: string[];
}

/**
 * Fill in a new invoice for a client and month.
 *
 * @param monthEntries  all of this client's time entries in the month
 * @param clientInvoices  all of this client's existing invoices
 *
 * - Hourly: one line per task, from billable time not yet invoiced.
 * - Retainer: the monthly fee, unless an invoice for that month already has
 *   it, plus overage hours. Overage counts ALL billable hours in the month,
 *   minus overage already invoiced, so invoicing part-way through the month
 *   never loses or double-charges hours.
 * - Fixed fee: whatever is left of the project fee after earlier invoices.
 */
export function draftInvoiceLines(
  client: Client,
  month: MonthKey,
  monthEntries: TimeEntry[],
  clientInvoices: Invoice[],
): InvoiceDraft {
  const label = monthLabel(month);
  const uninvoiced = monthEntries.filter(e => !e.invoiceId && e.billable !== false);
  const lines: InvoiceLine[] = [];

  if (client.billing === 'hourly') {
    const byTask = new Map<string, number>();
    for (const e of uninvoiced) {
      const task = (e.task || '').trim() || 'Work';
      byTask.set(task, (byTask.get(task) ?? 0) + e.minutes);
    }
    for (const [task, mins] of byTask) {
      lines.push({ desc: `${task} (${label})`, qty: round2(mins / 60), unit: client.rate || 0, kind: 'time' });
    }
  } else if (client.billing === 'retainer') {
    const done = retainerInvoicedForMonth(clientInvoices, month);
    if (!done.feeInvoiced) {
      lines.push({
        desc: `Monthly retainer, ${label} (${client.included || 0} hours included)`,
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
      lines.push({ desc: invoicedSoFar > 0 ? 'Project fee (balance)' : 'Project fee', qty: 1, unit: left, kind: 'fixed_fee' });
    }
  }

  return { lines: lines.length ? lines : [blankLine()], entryIds: uninvoiced.map(e => e.id) };
}

