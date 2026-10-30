import { useState } from 'react';
import { blankLine, dueDate, invoiceTotals, isOverdue, lineAmount, monthLabel, shiftMonth, sumPounds } from '../../lib/money';
import { RowMenu } from '../components/RowMenu';
import { ClientOptions, plural } from '../components/ui';
import { download, invoicePdf } from '../lib/files';
import { fmtDate, gbp, gbp0, padInvoiceNumber, thisMonth, today } from '../lib/format';
import { activeClients, clientById } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';
import type { Invoice } from '../store/types';
import { prefill, useDraftState, useInvoiceDraft } from './invoiceDraft';

function Totals({ subtotal, vat, total, vatRate, due }: { subtotal: number; vat: number; total: number; vatRate: number; due: string }) {
  return (
    <div style={{ maxWidth: 320, marginLeft: 'auto' }}>
      <div className="kv"><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
      {vatRate > 0 && <div className="kv"><span>VAT at {vatRate}%</span><span>{gbp(vat)}</span></div>}
      <div className="kv strong"><span>Total</span><span>{gbp(total)}</span></div>
      <div className="kv small muted"><span>Due</span><span>{fmtDate(due)}</span></div>
    </div>
  );
}

function InvoiceBuilder() {
  const { data, createInvoice, toast } = useKita();
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
  const refill = (clientId: string, period: string) => setDraft({ ...draft, clientId, period, ...prefill(data, clientId, period) });

  const save = async () => {
    setSaving(true);
    const inv = await createInvoice(draft);
    setSaving(false);
    if (!inv) { toast('Add at least one line with a description or price.'); return; }
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
        </div>
        <p className="small muted">
          {draft.entryIds.length
            ? `Filled in from ${draft.entryIds.length} uninvoiced time ${plural(draft.entryIds.length, 'entry', 'entries')} for ${client?.name ?? ''}. Edit anything before you create it.`
            : 'No uninvoiced time for this client and month. Add lines yourself.'}
        </p>
        <div className="tw">
          <table>
            <thead><tr><th>Description</th><th className="r" style={{ width: 90 }}>Qty</th><th className="r" style={{ width: 120 }}>Unit price (£)</th><th className="r" style={{ width: 110 }}>Amount</th><th style={{ width: 40 }} /></tr></thead>
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
                  <td className="r">{gbp(lineAmount(l))}</td>
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
        <Totals {...totals} vatRate={vatRate} due={dueDate(draft.issueDate, s.terms)} />
        <label className="f"><span>Note on invoice (optional)</span><input value={draft.note} placeholder="Thank you for your business" onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
        {s.vatRegistered && !s.vatNumber && <div className="callout">Add your VAT registration number in Settings. UK VAT invoices need to show it.</div>}
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
  if (inv.status === 'paid') return null;
  if (!asking) return <button className="btn sm" onClick={() => { setDate(today()); setAsking(true); }}>Mark paid</button>;
  return (
    <span className="row" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="date" aria-label="Date paid" value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: 'auto', padding: '4px 6px' }} />
      <button className="btn sm primary" onClick={async () => { setAsking(false); await markPaid(inv.id, date || today()); }}>Paid</button>
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
  const total = (list: Invoice[]) => sumPounds(list.map(i => i.total));
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
          <div className="fig"><div className="v">{gbp0(total(unpaid))}</div><div className="l">Waiting to be paid</div></div>
          <div className="fig"><div className="v" style={overdue.length ? { color: 'var(--bad)' } : undefined}>{gbp0(total(overdue))}</div><div className="l">{overdue.length} overdue</div></div>
          <div className="fig"><div className="v">{gbp0(total(unpaid.filter(i => i.dueDate.slice(0, 7) <= thisM)))}</div><div className="l">Due by the end of {monthName(thisM)}</div></div>
          <div className="fig"><div className="v">{gbp0(total(unpaid.filter(i => i.dueDate.slice(0, 7) === nextM)))}</div><div className="l">Due in {monthName(nextM)}</div></div>
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
                    <td className="r">{gbp(i.total)}</td>
                    <td>{i.status === 'paid' ? <span className="tag good">Paid {fmtDate(i.paidDate)}</span> : isOverdue(i, t) ? <span className="tag bad">Overdue</span> : <span className="tag">Due {fmtDate(i.dueDate)}</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <PaidControl inv={i} />{' '}
                      <RowMenu label={`More actions for ${i.number}`} items={[
                        { label: 'Download PDF', run: async () => {
                          try { download(`${i.number}.pdf`, await invoicePdf(i)); }
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
