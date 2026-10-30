/**
 * What a client's work is worth: retainer usage, the value of a month's work,
 * what is still to be invoiced, and the effective hourly rate.
 */
import { monthOf } from './dates';
import { roundPence } from './money';
import type { Client, Invoice, MonthKey, TimeEntry } from './types';

/** Retainer bars turn amber at this share of included hours. */
export const RETAINER_WARNING_SHARE = 0.8;

const hours = (minutes: number) => minutes / 60;

export const sumMinutes = (entries: TimeEntry[]) => entries.reduce((t, e) => t + (e.minutes || 0), 0);
export const billableMinutes = (entries: TimeEntry[]) => sumMinutes(entries.filter(e => e.billable !== false));

/**
 * Whether a retainer's monthly fee applies in a month.
 *
 * The fee applies from the start date's month to the end date's month.
 * Clients saved before start dates existed fall back to the month of their
 * first time entry. An archived retainer with no end date only counts in
 * months where time was logged.
 */
export function retainerActiveInMonth(
  client: Client,
  month: MonthKey,
  opts: { minutesInMonth: number; firstEntryDate?: string | null },
): boolean {
  if (client.billing !== 'retainer') return false;
  const start = client.startDate ?? opts.firstEntryDate ?? null;
  if (!start) return opts.minutesInMonth > 0;
  if (month < monthOf(start)) return false;
  if (client.endDate && month > monthOf(client.endDate)) return false;
  if (client.archived && !client.endDate) return opts.minutesInMonth > 0;
  return true;
}

export type RetainerStatus = 'ok' | 'near' | 'over';

export interface RetainerUsage {
  usedHours: number;
  includedHours: number;
  /** Used / included, e.g. 1.2 = 120%. 0 if no hours are included. */
  share: number;
  overHours: number;
  leftHours: number;
  status: RetainerStatus;
}

/** How much of a retainer's included hours a month's billable time uses. */
export function retainerUsage(client: Client, billableMins: number): RetainerUsage {
  const used = hours(billableMins);
  const included = client.included || 0;
  const share = included > 0 ? used / included : 0;
  return {
    usedHours: used,
    includedHours: included,
    share,
    overHours: Math.max(0, used - included),
    leftHours: Math.max(0, included - used),
    status: share > 1 ? 'over' : share >= RETAINER_WARNING_SHARE ? 'near' : 'ok',
  };
}

/**
 * Effective hourly rate of a fixed-fee project: the whole fee divided by all
 * the hours ever tracked for it. Spreading the fee by hours avoids a month
 * showing £0/h and the invoice month showing a huge rate.
 */
export function fixedFeeHourlyRate(client: Client, allTimeMinutes: number): number {
  return allTimeMinutes > 0 ? (client.fee || 0) / hours(allTimeMinutes) : 0;
}

/**
 * Value of one client's work in one month.
 * - Hourly: billable hours × rate.
 * - Retainer: the monthly fee (when active) plus overage hours × overage rate.
 * - Fixed fee: this month's share of the fee, in proportion to hours worked.
 */
export function monthWorkValue(
  client: Client,
  m: { minutes: number; billableMinutes: number; retainerActive: boolean; fixedAllTimeMinutes: number },
): number {
  if (client.billing === 'hourly') return roundPence(hours(m.billableMinutes) * (client.rate || 0));
  if (client.billing === 'retainer') {
    if (!m.retainerActive) return 0;
    const over = retainerUsage(client, m.billableMinutes).overHours;
    return roundPence((client.fee || 0) + over * (client.rate || 0));
  }
  return roundPence(hours(m.minutes) * fixedFeeHourlyRate(client, m.fixedAllTimeMinutes));
}

/** What you earn per hour actually worked (billable or not). Null when there's nothing to show. */
export function effectiveHourlyRate(value: number, minutes: number): number | null {
  return minutes > 0 && value > 0 ? value / hours(minutes) : null;
}

/** Retainer fee and overage hours already invoiced for a month. */
export function retainerInvoicedForMonth(clientInvoices: Invoice[], month: MonthKey) {
  const lines = clientInvoices.filter(i => i.period === month).flatMap(i => i.lines);
  return {
    feeInvoiced: lines.some(l => l.kind === 'retainer_fee'),
    overageHoursInvoiced: lines.filter(l => l.kind === 'overage').reduce((t, l) => t + (l.qty || 0), 0),
  };
}

/**
 * Overage hours still to bill. Invoice lines round hours to 2 decimal places,
 * so anything under 0.01 h (36 seconds) left over is treated as nothing.
 */
export function overageHoursToBill(overHours: number, alreadyInvoiced: number): number {
  const left = overHours - alreadyInvoiced;
  return left >= 0.01 ? left : 0;
}

/**
 * Value of a month's work not yet on an invoice.
 * - Hourly: billable entries without an invoice.
 * - Retainer: the fee if no invoice for that month includes it, plus overage
 *   hours not yet invoiced.
 * - Fixed fee: not time-based, so 0 (the project fee is tracked separately).
 */
export function unbilledForMonth(
  client: Client,
  m: { month: MonthKey; entries: TimeEntry[]; clientInvoices: Invoice[]; retainerActive: boolean },
): number {
  if (client.billing === 'hourly') {
    const mins = billableMinutes(m.entries.filter(e => !e.invoiceId));
    return roundPence(hours(mins) * (client.rate || 0));
  }
  if (client.billing === 'retainer') {
    if (!m.retainerActive) return 0;
    const done = retainerInvoicedForMonth(m.clientInvoices, m.month);
    const over = retainerUsage(client, billableMinutes(m.entries)).overHours;
    const overLeft = overageHoursToBill(over, done.overageHoursInvoiced);
    return roundPence((done.feeInvoiced ? 0 : client.fee || 0) + overLeft * (client.rate || 0));
  }
  return 0;
}
