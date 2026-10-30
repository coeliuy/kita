/**
 * Everything Kita stores for one user. The money module's types hold the
 * fields the calculations need; these add what the screens need.
 */
import type * as M from '../../lib/money';

export interface Client extends M.Client {
  color: string;
  email: string;
  address: string;
  createdAt: number;
  demo?: boolean;
}

export interface TimeEntry extends M.TimeEntry {
  task: string;
  note: string;
  createdAt: number;
  demo?: boolean;
}

/** Your details as they were when an invoice was created, so old invoices never change. */
export interface InvoiceSender {
  name: string;
  business: string;
  address: string;
  email: string;
  payment: string;
  vatNumber: string;
}

export interface Invoice extends M.Invoice {
  number: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  note: string;
  entryIds: string[];
  from: InvoiceSender;
  createdAt: number;
  demo?: boolean;
}

export interface Expense extends M.Expense {
  desc: string;
  clientId: string;
  demo?: boolean;
}

export type Theme = '' | 'light' | 'dark';

export interface Settings {
  name: string;
  business: string;
  address: string;
  email: string;
  payment: string;
  vatNumber: string;
  invPrefix: string;
  nextInv: number;
  terms: M.PaymentTerms;
  vatRegistered: boolean;
  vatRate: number;
  theme: Theme;
}

/** The numeric tax rate fields a user can override for a year. */
export type RateField = {
  [K in keyof M.TaxYearRates]: M.TaxYearRates[K] extends number ? K : never;
}[keyof M.TaxYearRates];
export type RateOverrides = Partial<Pick<M.TaxYearRates, Exclude<RateField, 'taxYear'>>>;

/** Settings that belong to one tax year. */
export interface YearSettings {
  otherIncome: number;
  goal: number;
  goalType: M.GoalType;
  taxSaved: number;
  rateOverrides: RateOverrides;
}

export interface Timer {
  clientId: string;
  task: string;
  startedAt: number;
}

export interface KitaData {
  settings: Settings;
  /** Keyed by tax year, e.g. '2026' for 2026/27. */
  years: Record<string, YearSettings>;
  timer: Timer | null;
  clients: Client[];
  entries: TimeEntry[];
  invoices: Invoice[];
  expenses: Expense[];
}

export const DEFAULT_SETTINGS: Settings = {
  name: '', business: '', address: '', email: '', payment: '', vatNumber: '',
  invPrefix: 'INV-', nextInv: 1, terms: '30', vatRegistered: false, vatRate: 20, theme: '',
};

export const DEFAULT_YEAR: YearSettings = { otherIncome: 0, goal: 0, goalType: 'gross', taxSaved: 0, rateOverrides: {} };

export const emptyData = (): KitaData => ({
  settings: { ...DEFAULT_SETTINGS }, years: {}, timer: null, clients: [], entries: [], invoices: [], expenses: [],
});

export type Collection = 'clients' | 'entries' | 'invoices' | 'expenses';
