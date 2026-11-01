/**
 * Everything Kita stores for one user. The money module's types hold the
 * fields the calculations need; these add what the screens need.
 */
import type * as M from '../../lib/money';
import type { ISODate } from '../../lib/money';

export interface Client extends M.Client {
  color: string;
  /** Expected hours a week from this client, for capacity planning (0 = work it out). */
  weekly: number;
  /** The currency this client is billed in ('' = your home currency). */
  currency: string;
  email: string;
  address: string;
  createdAt: number;
  demo?: boolean;
}

export interface TimeEntry extends M.TimeEntry {
  /** What was done (free text, or the task's title when tracked against a task). */
  task: string;
  categoryId: string;
  /** The task this time was tracked against, if any. */
  taskId: string;
  /** Set on meetings imported from a calendar file, so they aren't imported twice. */
  icsKey?: string;
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
  /** '' = home currency. */
  currency: string;
  fxRate: number | null;
  receivedHome: number | null;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  note: string;
  entryIds: string[];
  from: InvoiceSender;
  createdAt: number;
  demo?: boolean;
}

/** A kind of work, e.g. Social media or Email marketing. */
export interface Category {
  id: string;
  name: string;
  createdAt: number;
  demo?: boolean;
}

export type TaskStatus = 'todo' | 'doing' | 'done';
export type Recur = '' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  clientId: string;
  categoryId: string;
  title: string;
  /** Estimated minutes (0 = no estimate). */
  estimate: number;
  due: ISODate | null;
  recur: Recur;
  notes: string;
  status: TaskStatus;
  doneAt: ISODate | null;
  createdAt: number;
  demo?: boolean;
}

export interface Expense extends M.Expense {
  desc: string;
  clientId: string;
  demo?: boolean;
}

export type Theme = '' | 'light' | 'dark';

/** Where you're based. '' = not chosen yet. */
export type Country = '' | 'GB' | 'PH' | 'US' | 'OTHER';

/** A remembered exchange rate: home currency per 1 unit of another currency. */
export interface FxRate {
  rate: number;
  date: ISODate;
}

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
  /** Hours a week you can work (0 = not set). */
  capacity: number;
  /** Show task names and notes under invoice lines. */
  invNotes: boolean;
  /** Hide the "Get set up" checklist on Today. */
  hideSetup: boolean;
  country: Country;
  /** Home currency: income, expenses, tax and goals are counted in this. */
  currency: string;
  /** Outside the UK: the % of profit to set aside for tax. */
  setAside: number;
  /** Last known exchange rates into the home currency, by currency code. */
  fxRates: Record<string, FxRate>;
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
  categoryId: string;
  /** The task being tracked, if started from one. */
  taskId: string;
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
  categories: Category[];
  tasks: Task[];
}

export const DEFAULT_SETTINGS: Settings = {
  name: '', business: '', address: '', email: '', payment: '', vatNumber: '',
  invPrefix: 'INV-', nextInv: 1, terms: '30', vatRegistered: false, vatRate: 20, theme: '',
  capacity: 0, invNotes: true, hideSetup: false, country: '', currency: 'GBP', setAside: 25, fxRates: {},
};

export const DEFAULT_YEAR: YearSettings = { otherIncome: 0, goal: 0, goalType: 'gross', taxSaved: 0, rateOverrides: {} };

export const emptyData = (): KitaData => ({
  settings: { ...DEFAULT_SETTINGS }, years: {}, timer: null, clients: [], entries: [], invoices: [], expenses: [],
  categories: [], tasks: [],
});

export type Collection = 'clients' | 'entries' | 'invoices' | 'expenses' | 'categories' | 'tasks';
