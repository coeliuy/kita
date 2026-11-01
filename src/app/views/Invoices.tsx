import { useState } from 'react';
import { blankLine, CURRENCIES, currencySymbol, dueDate, inHome, invoiceTotals, isForeign, isOverdue, lineAmount, monthLabel, shiftMonth, sumPounds } from '../../lib/money';
import { RowMenu } from '../components/RowMenu';
import { ClientOptions, plural } from '../components/ui';
import { download, invoicePdf } from '../lib/files';
import { fmtDate, homeCurrencyCode, homeSymbol, money, money0, padInvoiceNumber, thisMonth, today } from '../lib/format';
import { homeCurrency, region } from '../lib/region';
import { activeClients, clientById, fxRateFor } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';
import type { Invoice } from '../store/types';
import { draftCurrency, prefill, useDraftState, useInvoiceDraft } from './invoiceDraft';

function Totals({ subtotal, vat, total, vatRate, due, currency, fxRate, taxName }: {
  subtotal: number; vat: number; total: number; vatRate: number; due: string; currency: string; fxRate: number | null; taxName: string;
}) {
  return (
    <div style={{ maxWidth: 320, marginLeft: 'auto' }}>
      <div className="kv"><span>Subtotal</span><span>{money(subtotal, currency)}</span></div>
      {vatRate > 0 && <div className="kv"><span>{taxName} at {vatRate}%</span><span>{money(vat, currency)}</span></div>}
      <div className="kv strong"><span>Total</span><span>{money(total, currency)}</span></div>
      {fxRate ? <div className="kv small muted"><span>In your currency</span><span>≈ {money(total * fxRate)}</span></div> : null}
      <div className="kv small muted"><span>Due</span><span>{fmtDate(due)}</span></div>
    </div>
  );
}

function InvoiceBuilder() {
  const { data, createInvoice, toast, updateSettings } = useKita();
  const { draft, setDraft } = useDraftState();
  const [saving, setSaving] = useState(false);
  if (!draft) return null;
  const s = data.settings;
  const vatRate = s.vatRegistered ? +s.vatRate || 0 : 0;
  const totals = invoiceTotals(draft.lines, vatRate);
  const client = clientById(data, draft.clientId);
  const months = [...Array(6)].map((_, i) => shiftMonth(thisMonth(), -i));
  const setLine = (i: number, patch: Partial<(typeof draft.lines)[number]>) =>
    setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const refill = (clientId: string, period: string) => setDraft({
    ...draft, clientId, period, ...prefill(data, clientId, period),
    ...(clientId !== draft.clientId ? draftCurrency(data, clientId) : {}),
  });
  const home = homeCurrency(data);
  const cur = draft.currency || home;
  const foreign = cur !== home;
  const setCurrency = (code: string) => setDraft({ ...draft, currency: code, fxRate: code === home ? null : fxRateFor(data, code) });

  const save = async () => {
    if (foreign && !(draft.fxRate && draft.fxRate > 0)) { toast(`Enter the exchange rate from ${cur} to ${home}.`); return; }
    setSaving(true);
    const inv = await createInvoice(draft);
    setSaving(false);
    if (!inv) { toast('Add at least one line with a description or price.'); return; }
    // Remember a rate typed in by hand, so the next invoice in this currency starts with it.
    if (foreign && draft.fxRate !== fxRateFor(data, cur)) updateSettings({ fxRates: { ...data.settings.fxRates, [cur]: { rate: draft.fxRate!, date: today() } } });
    setDraft(null);
    toast(`Created ${inv.number}`);
  };

  return (
    <section>
      <div className="head"><h1>New invoice</h1><span className="sub">{s.invPrefix}{padInvoiceNumber(s.nextInv)}</span></div>
      <div className="panel stack">
        <div className="grid">
          <label className="f"><span>Client</span><select value={draft.clientId} onChange={e => refill(e.target.value, draft.period)}><ClientOptions /></select></label>
          <label className="f"><span>Work done in</span>
            <select value={draft.period} onChange={e => refill(draft.clientId, e.target.value)}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
          <label className="f"><span>Issue date</span><input type="date" value={draft.issueDate} onChange={e => setDraft({ ...draft, issueDate: e.target.value || today() })} /></label>
          <label className="f"><span>Currency</span>
            <select value={cur} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
            </select>
          </label>
        </div>
        {foreign && (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="f" style={{ maxWidth: 260 }}>
              <span>Exchange rate: 1 {cur} = ? {home}</span>
              <input type="number" step="any" min="0" aria-label={`Exchange rate from ${cur} to ${home}`} value={draft.fxRate ?? ''}
                onChange={e => setDraft({ ...draft, fxRate: e.target.value === '' ? null : +e.target.value })} />
            </label>
            <p className="fine" style={{ paddingBottom: 8 }}>
              {draft.fxRate ? 'Used to estimate this invoice in your currency until it’s paid. When it’s paid, you’ll enter what actually arrived.' : `Kita doesn’t have a rate for ${cur} yet. Enter today’s rate, e.g. from your bank.`}
            </p>
          </div>
        )}
        <p className="small muted">
          {draft.entryIds.length
            ? `Filled in from ${draft.entryIds.length} uninvoiced time ${plural(draft.entryIds.length, 'entry', 'entries')} for ${client?.name ?? ''}. Edit anything before you create it.`
            : 'No uninvoiced time for this client and month. Add lines yourself.'}
        </p>
        <div className="tw">
          <table>
            <thead><tr><th>Description</th><th className="r" style={{ width: 90 }}>Qty</th><th className="r" style={{ width: 120 }}>Unit price ({currencySymbol(cur)})</th><th className="r" style={{ width: 110 }}>Amount</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {draft.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input aria-label="Description" value={l.desc} onChange={e => setLine(i, { desc: e.target.value })} />
                    <input className="detail" aria-label="Details under this line" value={l.detail ?? ''} placeholder="Details shown under this line (optional)"
                      onChange={e => setLine(i, { detail: e.target.value })} />
                  </td>
                  <td><input aria-label="Quantity" type="number" step="0.01" style={{ textAlign: 'right' }} value={l.qty} onChange={e => setLine(i, { qty: e.target.value === '' ? 0 : +e.target.value })} /></td>
                  <td><input aria-label="Unit price" type="number" step="0.01" style={{ textAlign: 'right' }} value={l.unit} onChange={e => setLine(i, { unit: e.target.value === '' ? 0 : +e.target.value })} /></td>
                  <td className="r">{money(lineAmount(l), cur)}</td>
                  <td><button className="btn link danger" aria-label="Remove line" onClick={() => {
                    const lines = draft.lines.filter((_, j) => j !== i);
                    setDraft({ ...draft, lines: lines.length ? lines : [blankLine()] });
                  }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><button className="btn sm" onClick={() => setDraft({ ...draft, lines: [...draft.lines, blankLine()] })}>Add line</button></div>
        <Totals {...totals} vatRate={vatRate} due={dueDate(draft.issueDate, s.terms)} currency={cur} fxRate={foreign ? draft.fxRate : null} taxName={region(data).salesTax} />
        <label className="f"><span>Note on invoice (optional)</span><input value={draft.note} placeholder="Thank you for your business" onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
        {s.vatRegistered && !s.vatNumber && region(data).code === 'GB' && <div className="callout">Add your VAT registration number in Settings. UK VAT invoices need to show it.</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn link" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={save}>Create invoice</button>
        </div>
      </div>
    </section>
  );
}

/** Mark paid, asking for the date the money arrived (it decides which tax year the income counts in). */
function PaidControl({ inv }: { inv: Invoice }) {
  const { markPaid } = useKita();
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState(today());
  const foreign = isForeign(inv);
  // For another currency: what actually arrived, in your currency (starts as the estimate).
  const [received, setReceived] = useState<number | ''>('');
  if (inv.status === 'paid') return null;
  if (!asking) {
    return <button className="btn sm secondary" onClick={() => { setDate(today()); setReceived(foreign ? inHome(inv, 'total') : ''); setAsking(true); }}>Mark paid</button>;
  }
  return (
    <span className="row" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="date" aria-label="Date paid" value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: 'auto', padding: '4px 6px' }} />
      {foreign && (
        <input type="number" step="0.01" min="0" aria-label={`Amount received in ${homeCurrencyCode()}`} title="Amount that arrived in your currency"
          placeholder={`Received (${homeSymbol()})`} value={received} onChange={e => setReceived(e.target.value === '' ? '' : +e.target.value)}
          style={{ width: 130, padding: '4px 6px' }} />
      )}
      <button className="btn sm primary" onClick={async () => { setAsking(false); await markPaid(inv.id, date || today(), foreign && received !== '' ? received : null); }}>Paid</button>
      <button className="btn link" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}

export function Invoices() {
  const { data, deleteInvoice, markUnpaid, toast } = useKita();
  const { draft } = useDraftState();
  const startInvoice = useInvoiceDraft();
  const t = today();
  const unpaid = data.invoices.filter(i => i.status !== 'paid');
  const overdue = unpaid.filter(i => isOverdue(i, t));
  const thisM = thisMonth(), nextM = shiftMonth(thisM, 1);
  // Summary figures are in your currency; foreign invoices are converted.
  const total = (list: Invoice[]) => sumPounds(list.map(i => inHome(i, 'total')));
  const monthName = (m: string) => monthLabel(m).split(' ')[0];
  const rows = [...data.invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

  return (
    <>
      {draft && <InvoiceBuilder />}
      <section>
        <div className="head">
          <h1>Invoices</h1>
          {!draft && <button className="btn primary" disabled={!activeClients(data).length} onClick={() => startInvoice(null)}>New invoice</button>}
        </div>
        <div className="figs" style={{ marginBottom: 20 }}>
          <div className="fig"><div className="v">{money0(total(unpaid))}</div><div className="l">Waiting to be paid</div></div>
          <div className="fig"><div className="v" style={overdue.length ? { color: 'var(--bad)' } : undefined}>{money0(total(overdue))}</div><div className="l">{overdue.length} overdue</div></div>
          <div className="fig"><div className="v">{money0(total(unpaid.filter(i => i.dueDate.slice(0, 7) <= thisM)))}</div><div className="l">Due by the end of {monthName(thisM)}</div></div>
          <div className="fig"><div className="v">{money0(total(unpaid.filter(i => i.dueDate.slice(0, 7) === nextM)))}</div><div className="l">Due in {monthName(nextM)}</div></div>
        </div>
        {rows.length ? (
          <div className="tw">
            <table>
              <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map(i => (
                  <tr key={i.id}>
                    <td>{i.number}</td>
                    <td>{clientById(data, i.clientId)?.name ?? i.clientName}</td>
                    <td>{fmtDate(i.issueDate)}</td>
                    <td className="r">{money(i.total, i.currency || undefined)}</td>
                    <td>{i.status === 'paid' ? <span className="tag good">Paid {fmtDate(i.paidDate)}</span> : isOverdue(i, t) ? <span className="tag bad">Overdue</span> : <span className="tag">Due {fmtDate(i.dueDate)}</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <PaidControl inv={i} />{' '}
                      <RowMenu label={`More actions for ${i.number}`} items={[
                        { label: 'Download PDF', run: async () => {
                          try { download(`${i.number}.pdf`, await invoicePdf(i, region(data).salesTax)); }
                          catch { toast('The PDF couldn’t be made. Check your connection and try again.'); }
                        } },
                        i.status === 'paid' && { label: 'Mark unpaid', run: () => markUnpaid(i.id) },
                        { label: 'Delete', danger: true, run: () => deleteInvoice(i.id) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No invoices yet. Kita fills them in from your tracked time.</div>}
      </section>
    </>
  );
}
