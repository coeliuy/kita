/**
 * Holds the user's data in memory for the screens, and saves every change
 * through the store. Screens call the actions here; they never write data directly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cleanLines, dueDate, invoiceTotals, type InvoiceLine, type ISODate, type MonthKey } from '../../lib/money';
import { buildDemoData } from '../lib/demo';
import { formatHM, inHome, isForeign, taxYearLabel, taxYearOf } from '../../lib/money';
import { yearSystem } from '../lib/region';
import { burst, milestoneCrossed } from '../lib/celebrate';
import { fmtDate, money0, today, uid, ymd } from '../lib/format';
import { nextDue, SUGGESTED_CATEGORIES } from '../lib/tasks';
import type { ImportResult } from '../lib/importBackup';
import { clientById, yearSettings, yearSummary } from '../lib/selectors';
import type { Account } from '../auth/AuthGate';
import type { KitaStore } from './store';
import { DEFAULT_SETTINGS, DEFAULT_YEAR, emptyData, type Category, type Task, type Client, type Collection, type Expense, type Invoice, type KitaData, type Settings, type TimeEntry, type YearSettings } from './types';

export interface ToastAction {
  label: string;
  run: () => unknown;
}

export interface NewInvoice {
  clientId: string;
  period: MonthKey | null;
  issueDate: ISODate;
  lines: InvoiceLine[];
  note: string;
  entryIds: string[];
  /** '' = home currency. */
  currency: string;
  /** Home currency per 1 unit of `currency`, for invoices in another currency. */
  fxRate: number | null;
}

interface KitaContext {
  data: KitaData;
  storeKind: KitaStore['kind'];
  /** The signed-in account, or null when using browser storage. */
  account: Account | null;
  /** Show a short message, optionally with a button such as Undo. */
  toast: (message: string, action?: ToastAction) => void;
  duplicateEntry: (id: string) => Promise<void>;
  saveClient: (c: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveEntry: (e: TimeEntry) => Promise<void>;
  saveEntries: (es: TimeEntry[]) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  /** Start a timer. Any timer already running is stopped and its time saved first. */
  startTimer: (t: { clientId: string; categoryId: string; task: string }) => Promise<void>;
  /**
   * Stop the timer, saving the time if `save` (and it's at least a minute).
   * Tells the user what happened, and asks whether a task is finished.
   */
  stopTimer: (save: boolean) => Promise<void>;
  /** Throw away the running timer, with Undo. */
  discardTimer: () => Promise<void>;
  /** After stopping a task's timer: the question "Is it finished?" */
  askDone: { taskId: string; entryId: string; minutes: number } | null;
  answerAskDone: (finished: boolean, note: string) => Promise<void>;
  saveCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addSuggestedCategories: () => Promise<void>;
  saveTask: (t: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  createInvoice: (draft: NewInvoice) => Promise<Invoice | null>;
  /** For a foreign-currency invoice, `receivedHome` is what arrived in your currency. */
  markPaid: (id: string, paidDate: ISODate, receivedHome?: number | null) => Promise<void>;
  markUnpaid: (id: string) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  saveExpense: (x: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  updateYear: (taxYear: number, patch: Partial<YearSettings>) => void;
  loadDemo: () => Promise<void>;
  clearData: (onlyDemo: boolean) => Promise<void>;
  importData: (r: ImportResult) => Promise<void>;
  /** Returns true if the message was sent. */
  sendFeedback: (message: string) => Promise<boolean>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<KitaContext | null>(null);

export function useKita(): KitaContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKita must be used inside <KitaProvider>');
  return v;
}

/** An invoice's currency fields: none for the home currency, otherwise the code and exchange rate. */
function invoiceCurrency(draft: NewInvoice, home: string) {
  const foreign = !!draft.currency && draft.currency !== home && !!draft.fxRate && draft.fxRate > 0;
  return foreign
    ? { currency: draft.currency, fxRate: draft.fxRate, receivedHome: null }
    : { currency: '', fxRate: null, receivedHome: null };
}

export function KitaProvider({ store, account = null, children }: { store: KitaStore; account?: Account | null; children: ReactNode }) {
  const [data, setData] = useState<KitaData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number; action?: ToastAction } | null>(null);
  const [askDone, setAskDone] = useState<KitaContext['askDone']>(null);
  // The latest data, for actions that need it without waiting for a re-render.
  const ref = useRef<KitaData | null>(null);
  const askRef = useRef<KitaContext['askDone']>(null);
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

  const toast = useCallback((text: string, action?: ToastAction) => setToastMsg(t => ({ text, action, n: (t?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (!toastMsg) return;
    // Messages with an Undo button stay longer, to give time to use it.
    const t = setTimeout(() => setToastMsg(null), toastMsg.action ? 6000 : 2800);
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

    const begin = async (timer: NonNullable<KitaData['timer']> extends infer T ? Omit<T, 'startedAt'> : never) => {
      const t = { ...timer, startedAt: Date.now() };
      commit({ ...cur(), timer: t });
      await save(store.saveTimer(t));
    };

    /** Stop the timer. `quiet` = no messages (used when another timer takes over). */
    const stop = async (keep: boolean, quiet: boolean) => {
      const t = cur().timer;
      if (!t) return;
      commit({ ...cur(), timer: null });
      await save(store.saveTimer(null));
      const minutes = Math.round((Date.now() - t.startedAt) / 60000);
      if (!keep) return;
      if (minutes < 1) {
        if (!quiet) toast('Less than a minute, so nothing was saved.');
        return;
      }
      const entry: TimeEntry = {
        id: uid(), clientId: t.clientId, categoryId: t.categoryId, taskId: t.taskId, task: t.task, note: '',
        date: ymd(new Date(t.startedAt)), minutes, billable: true, createdAt: Date.now(),
      };
      await upsert('entries', [entry]);
      if (quiet) return;
      const task = t.taskId ? cur().tasks.find(x => x.id === t.taskId) : null;
      if (task && task.status !== 'done') {
        askRef.current = { taskId: task.id, entryId: entry.id, minutes };
        setAskDone(askRef.current);
      } else toast(`Saved ${formatHM(minutes)}${new Date().getHours() >= 17 ? '. See you tomorrow.' : ''}`);
    };

    /** Mark a task done; a repeating task gets its next one. */
    const complete = async (id: string) => {
      const t = cur().tasks.find(x => x.id === id);
      if (!t) return;
      const done: Task = { ...t, status: 'done', doneAt: today() };
      const due = nextDue(t, today());
      if (due) {
        await upsert('tasks', [done, { ...t, id: uid(), status: 'todo', doneAt: null, due, createdAt: Date.now(), demo: undefined }]);
        toast(`Done. The next one is due ${fmtDate(due)}.`);
      } else {
        await upsert('tasks', [done]);
        toast('Task done.');
      }
      burst(16);
    };

    return {
      saveClient: async (c: Client) => void (await upsert('clients', [c])),
      deleteClient: async (id: string) => {
        const d = cur();
        const client = d.clients.find(c => c.id === id);
        if (!client) return;
        if (d.timer?.clientId === id) await stop(true, true);
        // The database unlinks this client's time, tasks, invoices and expenses,
        // so Undo puts the links back as well as the client.
        const linked = {
          tasks: d.tasks.filter(x => x.clientId === id), invoices: d.invoices.filter(x => x.clientId === id),
          entries: d.entries.filter(x => x.clientId === id), expenses: d.expenses.filter(x => x.clientId === id),
        };
        await remove('clients', [id]);
        toast(`${client.name} deleted. Their time is kept.`, {
          label: 'Undo',
          run: async () => {
            await upsert('clients', [client]);
            for (const k of ['tasks', 'invoices', 'entries', 'expenses'] as const) if (linked[k].length) await upsert(k, linked[k] as never);
          },
        });
      },
      saveEntry: async (e: TimeEntry) => void (await upsert('entries', [e])),
      saveEntries: async (es: TimeEntry[]) => void (await upsert('entries', es)),
      deleteEntry: async (id: string) => {
        const e = cur().entries.find(x => x.id === id);
        if (!e) return;
        await remove('entries', [id]);
        toast(e.invoiceId ? 'Entry deleted. The invoice it was on hasn’t changed.' : 'Entry deleted', { label: 'Undo', run: () => upsert('entries', [e]) });
      },
      duplicateEntry: async (id: string) => {
        const e = cur().entries.find(x => x.id === id);
        if (!e) return;
        const copy: TimeEntry = { ...e, id: uid(), date: today(), createdAt: Date.now(), invoiceId: null, demo: undefined };
        delete copy.icsKey;
        await upsert('entries', [copy]);
        toast(`Added ${formatHM(copy.minutes)} to today`);
      },

      startTimer: async (t: { clientId: string; categoryId: string; task: string }) => {
        await stop(true, true);
        await begin({ clientId: t.clientId, categoryId: t.categoryId, taskId: '', task: t.task.trim() });
      },

      stopTimer: (keep: boolean) => stop(keep, false),
      discardTimer: async () => {
        const t = cur().timer;
        if (!t) return;
        await stop(false, true);
        toast('Timer discarded', {
          label: 'Undo',
          run: async () => { if (!cur().timer) { commit({ ...cur(), timer: t }); await save(store.saveTimer(t)); } },
        });
      },

      answerAskDone: async (finished: boolean, note: string) => {
        const a = askRef.current;
        setAskDone(null);
        askRef.current = null;
        if (!a) return;
        const e = cur().entries.find(x => x.id === a.entryId);
        if (e && note.trim()) await upsert('entries', [{ ...e, note: note.trim() }]);
        if (finished) await complete(a.taskId);
        else toast('Kept in progress');
      },

      saveCategory: async (c: Category) => void (await upsert('categories', [c])),
      deleteCategory: async (id: string) => void (await remove('categories', [id])),
      addSuggestedCategories: async () => {
        const have = new Set(cur().categories.map(c => c.name.toLowerCase()));
        const add = SUGGESTED_CATEGORIES.filter(n => !have.has(n.toLowerCase())).map(name => ({ id: uid(), name, createdAt: Date.now() }));
        if (add.length) await upsert('categories', add);
        toast('Categories added. Rename or remove them in Settings.');
      },

      saveTask: async (t: Task) => void (await upsert('tasks', [t])),
      deleteTask: async (id: string) => {
        if (cur().timer?.taskId === id) await stop(true, true);
        const task = cur().tasks.find(x => x.id === id);
        if (!task) return;
        const linked = cur().entries.filter(e => e.taskId === id);
        await remove('tasks', [id]);
        toast('Task deleted. Its tracked time is kept.', {
          label: 'Undo',
          run: async () => { await upsert('tasks', [task]); if (linked.length) await upsert('entries', linked); },
        });
      },
      startTask: async (id: string) => {
        const t = cur().tasks.find(x => x.id === id);
        if (!t) return;
        await stop(true, true);
        if (t.status !== 'doing') await upsert('tasks', [{ ...t, status: 'doing', doneAt: null }]);
        await begin({ clientId: t.clientId, categoryId: t.categoryId, taskId: t.id, task: t.title });
        toast(`Tracking ${t.title}`);
      },
      completeTask: async (id: string) => {
        if (cur().timer?.taskId === id) await stop(true, true);
        await complete(id);
      },
      reopenTask: async (id: string) => {
        const t = cur().tasks.find(x => x.id === id);
        if (t) await upsert('tasks', [{ ...t, status: 'todo', doneAt: null }]);
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
          ...invoiceCurrency(draft, s.currency),
          from: { name: s.name, business: s.business, address: s.address, email: s.email, payment: s.payment, vatNumber: s.vatRegistered ? s.vatNumber : '' },
        };
        commit({ ...cur(), settings: { ...cur().settings, nextInv: (+s.nextInv || 1) + 1 } });
        await upsert('invoices', [invoice]);
        const linked = cur().entries.filter(e => draft.entryIds.includes(e.id)).map(e => ({ ...e, invoiceId: invoice.id }));
        if (linked.length) await upsert('entries', linked);
        return invoice;
      },

      markPaid: async (id: string, paidDate: ISODate, receivedHome: number | null = null) => {
        const i = cur().invoices.find(x => x.id === id);
        if (!i) return;
        const ty = taxYearOf(paidDate, yearSystem(cur()));
        const goalShare = () => yearSummary(cur(), ty, today()).goal?.share ?? 0;
        const before = goalShare();
        const paid: Invoice = { ...i, status: 'paid', paidDate, receivedHome: isForeign(i) ? receivedHome : null };
        await upsert('invoices', [paid]);
        const landed = money0(inHome(paid, 'total'));
        const y = yearSummary(cur(), ty, today());
        const hit = milestoneCrossed(before, goalShare());
        burst(hit ? 48 : 36);
        if (hit === 1) toast(`${landed} landed. You’ve reached your ${taxYearLabel(ty, yearSystem(cur()))} goal! Brilliant work.`);
        else if (hit) toast(`${landed} landed. ${hit === 0.5 ? 'Halfway' : hit === 0.25 ? 'A quarter of the way' : 'Three quarters of the way'} to your goal. Keep going!`);
        else toast(`${landed} landed. You’ve been paid ${money0(y.figures.income)}${cur().settings.vatRegistered ? ' (before VAT)' : ''} this tax year.`);
      },
      markUnpaid: async (id: string) => {
        const i = cur().invoices.find(x => x.id === id);
        if (i) await upsert('invoices', [{ ...i, status: 'unpaid', paidDate: null, receivedHome: null }]);
      },
      deleteInvoice: async (id: string) => {
        const invoice = cur().invoices.find(x => x.id === id);
        if (!invoice) return;
        const linked = cur().entries.filter(e => e.invoiceId === id);
        if (linked.length) await upsert('entries', linked.map(e => ({ ...e, invoiceId: null })));
        await remove('invoices', [id]);
        toast(`${invoice.number} deleted. Its time is uninvoiced again.`, {
          label: 'Undo',
          run: async () => { await upsert('invoices', [invoice]); if (linked.length) await upsert('entries', linked); },
        });
      },

      saveExpense: async (x: Expense) => void (await upsert('expenses', [x])),
      deleteExpense: async (id: string) => {
        const x = cur().expenses.find(v => v.id === id);
        if (!x) return;
        await remove('expenses', [id]);
        toast('Expense deleted', { label: 'Undo', run: () => upsert('expenses', [x]) });
      },

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
        const demo = buildDemoData(today(), cur().categories);
        const d = cur();
        let next = d.settings.nextInv;
        const invoices: Invoice[] = [];
        for (const inv of demo.invoices) {
          invoices.push({ ...inv, number: await store.takeInvoiceNumber() });
          next++;
        }
        // A typical working week, so capacity planning has something to show.
        const settings = { ...cur().settings, nextInv: next, capacity: cur().settings.capacity || 30 };
        commit({ ...cur(), settings });
        await save(store.saveSettings(settings));
        // Things are saved before anything that points at them.
        await upsert('categories', demo.categories);
        await upsert('clients', demo.clients);
        await upsert('tasks', demo.tasks);
        await upsert('invoices', invoices);
        await upsert('entries', demo.entries);
        await upsert('expenses', demo.expenses);
      },

      sendFeedback: async (message: string) => {
        try {
          await store.sendFeedback(message.trim(), location.pathname);
          return true;
        } catch (e) {
          console.warn(e);
          return false;
        }
      },

      deleteAccount: async () => {
        try {
          await store.deleteAccount();
          if (store.kind === 'local') commit(emptyData());
        } catch (e) {
          failed(e);
        }
      },

      importData: async (r: ImportResult) => {
        await upsert('categories', r.categories);
        await upsert('clients', r.clients);
        await upsert('tasks', r.tasks);
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
        // A running timer for something being removed is stopped without saving.
        const t = d.timer;
        if (t && (!onlyDemo || d.clients.find(c => c.id === t.clientId)?.demo)) await stop(false, true);
        for (const c of ['entries', 'invoices', 'expenses', 'tasks', 'clients', 'categories'] as const) {
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
    <Ctx.Provider value={{ data, storeKind: store.kind, account, toast, askDone, ...actions }}>
      {children}
      <div id="toast" role="status" aria-live="polite" className={`${toastMsg ? 'show' : ''}${toastMsg?.action ? ' has-act' : ''}`}>
        <span>{toastMsg?.text}</span>
        {toastMsg?.action && (
          <button className="tact" onClick={() => { const a = toastMsg.action!; setToastMsg(null); void a.run(); }}>{toastMsg.action.label}</button>
        )}
      </div>
    </Ctx.Provider>
  );
}
