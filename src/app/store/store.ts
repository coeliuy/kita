/**
 * Where Kita's data is saved. The screens only talk to this interface, so
 * browser storage (now) can be swapped for the online database (step 3)
 * without changing any screen.
 */
import type { Collection, KitaData, Settings, Timer, YearSettings } from './types';

export interface KitaStore {
  /** 'local' = this browser only; 'cloud' = the user's account. */
  readonly kind: 'local' | 'cloud';
  load(): Promise<KitaData>;
  upsert<C extends Collection>(collection: C, rows: KitaData[C]): Promise<void>;
  remove(collection: Collection, ids: string[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  saveYear(taxYear: number, year: YearSettings): Promise<void>;
  saveTimer(timer: Timer | null): Promise<void>;
  /** Hand out the next invoice number and move the counter on, in one step. */
  takeInvoiceNumber(): Promise<string>;
}
