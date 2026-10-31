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

const PAGE = 1000;

export class SupabaseStore implements KitaStore {
  readonly kind = 'cloud' as const;
  /** The invoice counter as last seen in the database, to tell whether the user changed it. */
  private knownNextInv = 1;

  constructor(private sb: SupabaseClient) {}

  async load(): Promise<KitaData> {
    const d = emptyData();
    // Supabase returns at most 1,000 rows per request, so read big tables a page at a time.
    // Pages need a fixed order; `orderBy` must be a column the table has.
    const all = async (table: string, orderBy = 'id') => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const page = check(await this.sb.from(table).select('*').order(orderBy).range(from, from + PAGE - 1)) ?? [];
        rows.push(...page);
        if (page.length < PAGE) return { data: rows, error: null };
      }
    };
    const [settings, years, timer, clients, entries, invoices, expenses, categories, tasks] = await Promise.all([
      this.sb.from('settings').select('*').maybeSingle(),
      all('year_settings', 'tax_year'),
      this.sb.from('timers').select('*').maybeSingle(),
      all(TABLES.clients.table),
      all(TABLES.entries.table),
      all(TABLES.invoices.table),
      all(TABLES.expenses.table),
      all(TABLES.categories.table),
      all(TABLES.tasks.table),
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
    d.categories = (check(categories) ?? []).map(TABLES.categories.fromRow);
    d.tasks = (check(tasks) ?? []).map(TABLES.tasks.fromRow);
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

  async sendFeedback(message: string, page: string) {
    const { data } = await this.sb.auth.getUser();
    check(await this.sb.from('feedback').insert({ message: message.slice(0, 5000), page: page.slice(0, 200), email: data.user?.email ?? '' }));
  }

  async deleteAccount() {
    check(await this.sb.rpc('delete_my_account'));
    try { sessionStorage.setItem('kita-deleted', '1'); } catch { /* only used for a message */ }
    await this.sb.auth.signOut();
  }

  async takeInvoiceNumber() {
    const number = check(await this.sb.rpc('take_invoice_number')) as string;
    this.knownNextInv++;
    return number;
  }
}
