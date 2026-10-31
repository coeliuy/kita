/**
 * Saves everything in this browser's localStorage. Used until accounts and
 * the online database are switched on, and kept for development.
 */
import { padInvoiceNumber } from '../lib/format';
import type { KitaStore } from './store';
import { DEFAULT_SETTINGS, DEFAULT_YEAR, emptyData, type Collection, type KitaData } from './types';

const KEY = 'kita-v2';

/** Fill in any settings added since the data was saved. */
export function normalise(raw: Partial<KitaData>): KitaData {
  const base = emptyData();
  const years: KitaData['years'] = {};
  for (const [k, v] of Object.entries(raw.years ?? {})) years[k] = { ...DEFAULT_YEAR, ...v, rateOverrides: { ...v?.rateOverrides } };
  return {
    ...base,
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    years,
    timer: raw.timer ?? null,
  };
}

export class LocalStore implements KitaStore {
  readonly kind = 'local' as const;
  private data: KitaData = emptyData();

  async load(): Promise<KitaData> {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? normalise(JSON.parse(raw)) : emptyData();
    } catch {
      this.data = emptyData();
    }
    return structuredClone(this.data);
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      throw new Error('This browser wouldn’t save the change.');
    }
  }

  async upsert<C extends Collection>(collection: C, rows: KitaData[C]) {
    const list = this.data[collection] as { id: string }[];
    for (const row of rows as { id: string }[]) {
      const i = list.findIndex(x => x.id === row.id);
      if (i >= 0) list[i] = structuredClone(row);
      else list.push(structuredClone(row));
    }
    this.persist();
  }

  async remove(collection: Collection, ids: string[]) {
    const drop = new Set(ids);
    (this.data[collection] as { id: string }[]) = (this.data[collection] as { id: string }[]).filter(x => !drop.has(x.id));
    this.persist();
  }

  async saveSettings(settings: KitaData['settings']) {
    this.data.settings = structuredClone(settings);
    this.persist();
  }

  async saveYear(taxYear: number, year: KitaData['years'][string]) {
    this.data.years[taxYear] = structuredClone(year);
    this.persist();
  }

  async saveTimer(timer: KitaData['timer']) {
    this.data.timer = timer;
    this.persist();
  }

  async sendFeedback(): Promise<void> {
    throw new Error('Feedback needs an account.');
  }

  async deleteAccount() {
    this.data = emptyData();
    localStorage.removeItem(KEY);
  }

  async takeInvoiceNumber() {
    const s = this.data.settings;
    const n = Math.max(1, Math.floor(+s.nextInv || 1));
    s.nextInv = n + 1;
    this.persist();
    return s.invPrefix + padInvoiceNumber(n);
  }
}
