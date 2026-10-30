/**
 * Holds the user's data in memory for the screens, and saves every change
 * through the store. Screens call the actions here; they never write data directly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cleanLines, dueDate, invoiceTotals, type InvoiceLine, type ISODate, type MonthKey } from '../../lib/money';
import { buildDemoData } from '../lib/demo';
import { today, uid, ymd } from '../lib/format';
import type { ImportResult } from '../lib/importBackup';
import { clientById, yearSettings } from '../lib/selectors';
import type { Account } from '../auth/AuthGate';
import type { KitaStore } from './store';
import { DEFAULT_SETTINGS, DEFAULT_YEAR, type Client, type Collection, type Expense, type Invoice, type KitaData, type Settings, type TimeEntry, type YearSettings } from './types';

export interface NewInvoice {
  clientId: string;
  period: MonthKey | null;
  issueDate: ISODate;
  lines: InvoiceLine[];
  note: string;
  entryIds: string[];
}

interface KitaContext {
  data: KitaData;
  storeKind: KitaStore['kind'];
  /** The signed-in account, or null when using browser storage. */
  account: Account | null;
  toast: (message: string) => void;
  saveClient: (c: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveEntry: (e: TimeEntry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  startTimer: (clientId: string, task: string) => Promise<void>;
  /** Returns the minutes saved, or 0 if nothing was saved. */
  stopTimer: (save: boolean) => Promise<number>;
  createInvoice: (draft: NewInvoice) => Promise<Invoice | null>;
  markPaid: (id: string, paidDate: ISODate) => Promise<void>;
  markUnpaid: (id: string) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  saveExpense: (x: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  updateYear: (taxYear: number, patch: Partial<YearSettings>) => void;
  loadDemo: () => Promise<void>;
  clearData: (onlyDemo: boolean) => Promise<void>;
  importData: (r: ImportResult) => Promise<void>;
}

const Ctx = createContext<KitaContext | null>(null);

export function useKita(): KitaContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKita must be used inside <KitaProvider>');
  return v;
}

export function KitaProvider({ store, account = null, children }: { store: KitaStore; account?: Account | null; children: ReactNode }) {
  const [data, setData] = useState<KitaData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number } | null>(null);
  // The latest data, for actions that need it without waiting for a re-render.
  const ref = useRef<KitaData | null>(null);
  // Saves waiting for a pause in typing.
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>());

  useEffect(() => {
    const flushPending = () => {
      for (const { timer, run } of [...pending.current.values()]) {
        clearTimeout(timer);
        run();
      }
    };
    // Coming back to the tab: pick up changes made on other devices (cloud only),
    // unless there are changes here still waiting to be saved.
    const refresh = () => {
      if (store.kind !== 'cloud' || !ref.current || pending.current.size) return;
      store.load().then(d => { if (!pending.current.size) { ref.current = d; setData(d); } }, e => console.warn(e));
    };
    const onHide = () => (document.visibilityState === 'hidden' ? flushPending() : refresh());
    addEventListener('pagehide', flushPending);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      removeEventListener('pagehide', flushPending);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [store]);

  const toast = useCallback((text: string) => setToastMsg(t => ({ text, n: (t?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    store.load().then(
      d => {
        ref.current = d;
        setData(d);
      },
      e => {
        console.warn(e);
        setLoadError(true);
      },
    );
  }, [store]);

  const actions = useMemo(() => {
    const cur = () => ref.current!;
    const commit = (next: KitaData) => {
      ref.current = next;
      setData(next);
    };
    const failed = (e: unknown) => {
      console.warn(e);
      toast('That change didn’t save. Check your connection and try again.');
    };
    const save = (p: Promise<unknown>) => p.catch(failed);

    const upsert = <C extends Collection>(collection: C, rows: KitaData[C]) => {
      const d = cur();
      const list = [...d[collection]] as { id: string }[];
      for (const row of rows as { id: string }[]) {
        const i = list.findIndex(x => x.id === row.id);
        if (i >= 0) list[i] = row;
        else list.push(row);
      }
      commit({ ...d, [collection]: list });
      return save(store.upsert(collection, rows));
    };
    const remove = (collection: Collection, ids: string[]) => {
      const d = cur();
      const drop = new Set(ids);
      commit({ ...d, [collection]: (d[collection] as { id: string }[]).filter(x => !drop.has(x.id)) });
      return save(store.remove(collection, ids));
    };

    // Typing in a settings box saves after a short pause rather than on every key.
    // If the page is closed or hidden first, pending saves go straight away (see flushPending).
    const later = (key: string, fn: () => void) => {
      const p = pending.current;
      clearTimeout(p.get(key)?.timer);
      const run = () => { p.delete(key); fn(); };
      p.set(key, { timer: setTimeout(run, 400), run });
    };

    return {
      saveClient: async (c: Client) => void (await upsert('clients', [c])),
      deleteClient: async (id: string) => void (await remove('clients', [id])),
      saveEntry: async (e: TimeEntry) => void (await upsert('entries', [e])),
      deleteEntry: async (id: string) => void (await remove('entries', [id])),

      startTimer: async (clientId: string, task: string) => {
        const timer = { clientId, task: task.trim(), startedAt: Date.now() };
        commit({ ...cur(), timer });
        await save(store.saveTimer(timer));
      },

      stopTimer: async (keep: boolean) => {
        const t = cur().timer;
        if (!t) return 0;
        commit({ ...cur(), timer: null });
        await save(store.saveTimer(null));
        const minutes = Math.round((Date.now() - t.startedAt) / 60000);
        if (!keep || minutes < 1) return 0;
        await upsert('entries', [{
          id: uid(), clientId: t.clientId, task: t.task, note: '', date: ymd(new Date(t.startedAt)),
          minutes, billable: true, createdAt: Date.now(),
        }]);
        return minutes;
      },

      createInvoice: async (draft: NewInvoice) => {
        const d = cur();
        const client = clientById(d, draft.clientId);
        const lines = cleanLines(draft.lines);
        if (!client || !lines.length) return null;
        const s = d.settings;
        const vatRate = s.vatRegistered ? +s.vatRate || 0 : 0;
        const totals = invoiceTotals(lines, vatRate);
        let number: string;
        try {
          number = await store.takeInvoiceNumber();
        } catch (e) {
          failed(e);
          return null;
        }
        const invoice: Invoice = {
          id: uid(), number, clientId: client.id, clientName: client.name, clientAddress: client.address,
          clientEmail: client.email, period: draft.period, issueDate: draft.issueDate,
          dueDate: dueDate(draft.issueDate, s.terms), lines, vatRate, ...totals, status: 'unpaid', paidDate: null,
          note: draft.note.trim(), entryIds: draft.entryIds, createdAt: Date.now(),
          from: { name: s.name, business: s.business, address: s.address, email: s.email, payment: s.payment, vatNumber: s.vatRegistered ? s.vatNumber : '' },
        };
        commit({ ...cur(), settings: { ...cur().settings, nextInv: (+s.nextInv || 1) + 1 } });
        await upsert('invoices', [invoice]);
        const linked = cur().entries.filter(e => draft.entryIds.includes(e.id)).map(e => ({ ...e, invoiceId: invoice.id }));
        if (linked.length) await upsert('entries', linked);
        return invoice;
      },

      markPaid: async (id: string, paidDate: ISODate) => {
        const i = cur().invoices.find(x => x.id === id);
        if (i) await upsert('invoices', [{ ...i, status: 'paid', paidDate }]);
      },
      markUnpaid: async (id: string) => {
        const i = cur().invoices.find(x => x.id === id);
        if (i) await upsert('invoices', [{ ...i, status: 'unpaid', paidDate: null }]);
      },
      deleteInvoice: async (id: string) => {
        const freed = cur().entries.filter(e => e.invoiceId === id).map(e => ({ ...e, invoiceId: null }));
        if (freed.length) await upsert('entries', freed);
        await remove('invoices', [id]);
      },

      saveExpense: async (x: Expense) => void (await upsert('expenses', [x])),
      deleteExpense: async (id: string) => void (await remove('expenses', [id])),

      updateSettings: (patch: Partial<Settings>) => {
        const settings = { ...cur().settings, ...patch };
        commit({ ...cur(), settings });
        later('settings', () => save(store.saveSettings(cur().settings)));
      },
      updateYear: (taxYear: number, patch: Partial<YearSettings>) => {
        const year = { ...yearSettings(cur(), taxYear), ...patch };
        commit({ ...cur(), years: { ...cur().years, [taxYear]: year } });
        later(`year-${taxYear}`, () => save(store.saveYear(taxYear, yearSettings(cur(), taxYear))));
      },

      loadDemo: async () => {
        const demo = buildDemoData(today());
        const d = cur();
        let next = d.settings.nextInv;
        const invoices: Invoice[] = [];
        for (const inv of demo.invoices) {
          invoices.push({ ...inv, number: await store.takeInvoiceNumber() });
          next++;
        }
        commit({ ...cur(), settings: { ...cur().settings, nextInv: next } });
        // Clients, then invoices, then the time and expenses that point at them.
        await upsert('clients', demo.clients);
        await upsert('invoices', invoices);
        await upsert('entries', demo.entries);
        await upsert('expenses', demo.expenses);
      },

      importData: async (r: ImportResult) => {
        await upsert('clients', r.clients);
        await upsert('invoices', r.invoices);
        await upsert('entries', r.entries);
        await upsert('expenses', r.expenses);
        const settings = { ...cur().settings, ...r.settings };
        commit({ ...cur(), settings });
        await save(store.saveSettings(settings));
        for (const y of r.years) {
          const year = { ...yearSettings(cur(), y.taxYear), ...y.patch };
          commit({ ...cur(), years: { ...cur().years, [y.taxYear]: year } });
          await save(store.saveYear(y.taxYear, year));
        }
      },

      clearData: async (onlyDemo: boolean) => {
        const d = cur();
        const pick = (rows: { id: string; demo?: boolean }[]) => rows.filter(r => !onlyDemo || r.demo).map(r => r.id);
        for (const c of ['entries', 'invoices', 'expenses', 'clients'] as const) {
          const ids = pick(d[c]);
          if (ids.length) await remove(c, ids);
        }
        if (!onlyDemo) {
          // Start again from scratch, keeping only the light/dark choice.
          const years = Object.keys(d.years);
          const settings = { ...DEFAULT_SETTINGS, theme: d.settings.theme };
          commit({ ...cur(), timer: null, years: {}, settings });
          await save(Promise.all([
            store.saveTimer(null),
            store.saveSettings(settings),
            ...years.map(y => store.saveYear(+y, DEFAULT_YEAR)),
          ]));
        }
      },
    };
  }, [store, toast]);

  if (loadError) return <div className="loading">Couldn’t load your data. Reload the page to try again.</div>;
  if (!data) return <div className="loading">Loading your data…</div>;

  return (
    <Ctx.Provider value={{ data, storeKind: store.kind, account, toast, ...actions }}>
      {children}
      <div id="toast" role="status" aria-live="polite" className={toastMsg ? 'show' : ''}>
        {toastMsg?.text}
      </div>
    </Ctx.Provider>
  );
}
