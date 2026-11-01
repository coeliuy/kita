/**
 * The invoice being written. Kept above the screens so "Create an invoice"
 * on Overview can open it on the Invoices screen.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { blankLine, draftInvoiceLines, monthEnd, monthStart, type MonthKey } from '../../lib/money';
import { thisMonth, today } from '../lib/format';
import { invoiceDraftOptions } from '../lib/invoiceDetails';
import { homeCurrency } from '../lib/region';
import { activeClients, clientById, entriesIn, fxRateFor } from '../lib/selectors';
import { useRouter } from '../router';
import { useKita, type NewInvoice } from '../store/KitaProvider';
import type { KitaData } from '../store/types';

type Draft = NewInvoice & { period: MonthKey };

const Ctx = createContext<{ draft: Draft | null; setDraft: (d: Draft | null) => void } | null>(null);

export function InvoiceDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  return <Ctx.Provider value={{ draft, setDraft }}>{children}</Ctx.Provider>;
}

export function useDraftState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDraftState must be used inside <InvoiceDraftProvider>');
  return v;
}

/** Lines and linked entries for a client and month, from tracked time. */
export function prefill(data: KitaData, clientId: string, month: MonthKey) {
  const client = clientById(data, clientId);
  if (!client) return { lines: [blankLine()], entryIds: [] };
  return draftInvoiceLines(
    client,
    month,
    entriesIn(data, monthStart(month), monthEnd(month), clientId),
    data.invoices.filter(i => i.clientId === clientId),
    invoiceDraftOptions(data.categories, data.tasks, data.settings.invNotes),
  );
}

/** A new invoice uses its client's currency, with the last known exchange rate. */
export function draftCurrency(data: KitaData, clientId: string): { currency: string; fxRate: number | null } {
  const home = homeCurrency(data);
  const currency = clientById(data, clientId)?.currency || home;
  return { currency, fxRate: currency === home ? null : fxRateFor(data, currency) };
}

/** Start a new invoice (optionally for a client and month) and open the Invoices screen. */
export function useInvoiceDraft() {
  const { data } = useKita();
  const { setDraft } = useDraftState();
  const { go } = useRouter();
  return useCallback((clientId: string | null, month?: MonthKey) => {
    const cid = clientId ?? activeClients(data)[0]?.id ?? '';
    const period = month ?? thisMonth();
    setDraft({ clientId: cid, period, issueDate: today(), note: '', terms: data.settings.invTerms, number: '', dueDate: null, ...prefill(data, cid, period), ...draftCurrency(data, cid) });
    go('invoices');
  }, [data, setDraft, go]);
}
