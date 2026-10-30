/**
 * The shapes of data the money calculations work with.
 *
 * Conventions used everywhere in this module:
 * - Dates are plain 'YYYY-MM-DD' strings (ISODate), months are 'YYYY-MM' (MonthKey).
 *   They have no time zone, so a date never shifts by a day for users abroad.
 * - Money is in pounds as a number, rounded to whole pence where it is stored
 *   (invoice lines, totals, expenses). Use the helpers in money.ts to round.
 * - Durations are whole minutes.
 */

export type ISODate = string;
export type MonthKey = string;

export type BillingType = 'hourly' | 'retainer' | 'fixed';

export interface Client {
  id: string;
  name: string;
  billing: BillingType;
  /** Hourly: the hourly rate. Retainer: the rate for hours beyond those included. */
  rate: number;
  /** Retainer: the monthly fee. Fixed: the whole project fee. */
  fee: number;
  /** Retainer: hours included in the monthly fee. */
  included: number;
  /** Retainer: first month the fee applies. Earlier months never show the fee as earned. */
  startDate?: ISODate | null;
  /** Retainer: last day the retainer runs (optional). */
  endDate?: ISODate | null;
  archived?: boolean;
}

export interface TimeEntry {
  id: string;
  clientId: string;
  date: ISODate;
  minutes: number;
  billable: boolean;
  task?: string;
  invoiceId?: string | null;
}

/**
 * What an invoice line is for. The calculations rely on this to avoid
 * charging a retainer fee twice for the same month, and to know how many
 * overage hours or how much of a fixed fee has already been invoiced.
 */
export type InvoiceLineKind = 'time' | 'retainer_fee' | 'overage' | 'fixed_fee' | 'custom';

export interface InvoiceLine {
  desc: string;
  /** Optional smaller text under the line, e.g. the tasks it covers. */
  detail?: string;
  qty: number;
  unit: number;
  kind: InvoiceLineKind;
}

export type PaymentTerms = '7' | '14' | '30' | 'eofm';

export interface Invoice {
  id: string;
  clientId: string;
  /** The month of work the invoice covers, if any. */
  period: MonthKey | null;
  issueDate: ISODate;
  dueDate: ISODate;
  lines: InvoiceLine[];
  subtotal: number;
  /** VAT rate (%) at the time the invoice was created, so old invoices never change. */
  vatRate: number;
  vat: number;
  total: number;
  status: 'unpaid' | 'paid';
  /** Cash basis: income counts on this date. */
  paidDate?: ISODate | null;
}

export interface Expense {
  id: string;
  date: ISODate;
  amount: number;
  category: string;
}
