/**
 * Saves the signed-in user's data in Supabase. Row-level security in the
 * database (supabase/migrations) makes sure each user only reaches their own rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KitaStore } from './store';
import { settingsFromRow, settingsToRow, TABLES, timerFromRow, timerToRow, yearFromRow, yearToRow } from './supabaseRows';
import { DEFAULT_SETTINGS, DEFAULT_YEAR, emptyData, type Collection, type KitaData, type Settings, type Timer, type YearSettings } from './types';

/** Throw Supabase errors so the app can tell the user a change didn't save. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseStore implements KitaStore {
  readonly kind = 'cloud' as const;
  /** The invoice counter as last seen in the database, to tell whether the user changed it. */
  private knownNextInv = 1;

  constructor(private sb: SupabaseClient) {}

  async load(): Promise<KitaData> {
    const d = emptyData();
    const all = (table: string) => this.sb.from(table).select('*');
    const [settings, years, timer, clients, entries, invoices, expenses] = await Promise.all([
      this.sb.from('settings').select('*').maybeSingle(),
      all('year_settings'),
      this.sb.from('timers').select('*').maybeSingle(),
      all(TABLES.clients.table),
      all(TABLES.entries.table),
      all(TABLES.invoices.table),
      all(TABLES.expenses.table),
    ]);
    const s = check(settings);
    d.settings = { ...DEFAULT_SETTINGS, ...(s ? settingsFromRow(s) : {}) };
    this.knownNextInv = d.settings.nextInv;
    for (const r of check(years) ?? []) d.years[String(r.tax_year)] = { ...DEFAULT_YEAR, ...yearFromRow(r) };
    const t = check(timer);
    d.timer = t ? timerFromRow(t) : null;
    d.clients = (check(clients) ?? []).map(TABLES.clients.fromRow);
    d.entries = (check(entries) ?? []).map(TABLES.entries.fromRow);
    d.invoices = (check(invoices) ?? []).map(TABLES.invoices.fromRow);
    d.expenses = (check(expenses) ?? []).map(TABLES.expenses.fromRow);
    return d;
  }

  async upsert<C extends Collection>(collection: C, rows: KitaData[C]) {
    if (!rows.length) return;
    const { table, toRow } = TABLES[collection];
    // Big batches (like demo data) go in chunks to keep each request small.
    for (let i = 0; i < rows.length; i += 200) {
      check(await this.sb.from(table).upsert((rows.slice(i, i + 200) as KitaData[C][number][]).map(r => toRow(r as never))));
    }
  }

  async remove(collection: Collection, ids: string[]) {
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 200) {
      check(await this.sb.from(TABLES[collection].table).delete().in('id', ids.slice(i, i + 200)));
    }
  }

  async saveSettings(settings: Settings) {
    const row = settingsToRow(settings);
    // The database owns the invoice counter. Only send it when the user has
    // changed it themselves, so an out-of-date copy never winds it back.
    if (settings.nextInv === this.knownNextInv) delete row.next_inv;
    else this.knownNextInv = settings.nextInv;
    check(await this.sb.from('settings').upsert(row));
  }

  async saveYear(taxYear: number, year: YearSettings) {
    check(await this.sb.from('year_settings').upsert(yearToRow(taxYear, year)));
  }

  async saveTimer(timer: Timer | null) {
    if (timer) check(await this.sb.from('timers').upsert(timerToRow(timer)));
    else {
      const { data } = await this.sb.auth.getUser();
      if (data.user) check(await this.sb.from('timers').delete().eq('user_id', data.user.id));
    }
  }

  async takeInvoiceNumber() {
    const number = check(await this.sb.rpc('take_invoice_number')) as string;
    this.knownNextInv++;
    return number;
  }
}
