/**
 * "Import past invoices": choose a CSV, see what Kita understood, then import.
 * Nothing is saved until you press Import.
 */
import { useRef, useState } from 'react';
import { download } from '../lib/files';
import { money0, today } from '../lib/format';
import { importInvoicesCsv, invoiceTemplateCsv, InvoiceImportError, type InvoiceImport } from '../lib/importInvoices';
import { useKita } from '../store/KitaProvider';
import { plural } from './ui';

const LABELS: Record<string, string> = {
  client: 'Client', amount: 'Amount', issueDate: 'Date', paidDate: 'Date paid', number: 'Invoice number', hours: 'Hours',
  currency: 'Currency', received: 'Amount received', desc: 'Description', status: 'Status', tax: 'Tax', month: 'Month worked',
};

export function ImportInvoices({ compact = false }: { compact?: boolean }) {
  const { data, importData, toast } = useKita();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<(InvoiceImport & { file: string }) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (file?: File) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    setError('');
    setPreview(null);
    if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) {
      setError('Save the spreadsheet as a CSV file first. In Google Sheets: File → Download → CSV. In Excel: File → Save As → CSV. In Numbers: File → Export To → CSV.');
      return;
    }
    try {
      setPreview({ ...importInvoicesCsv(await file.text(), data, today()), file: file.name });
    } catch (e) {
      setError(e instanceof InvoiceImportError ? e.message : 'That file couldn’t be read. Choose a CSV file with a header row.');
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await importData(preview.result);
      toast(`Imported ${preview.invoices} ${plural(preview.invoices, 'invoice')}. Your income, tax estimate and insights now include them.`);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const picker = (
    <>
      <button className="btn secondary" onClick={() => input.current?.click()}>Import past invoices (CSV)</button>
      <input ref={input} type="file" accept=".csv,text/csv,.txt,.xlsx,.xls,.numbers,.ods" hidden onChange={e => choose(e.target.files?.[0])} />
    </>
  );

  return (
    <div className="stack import-invoices">
      {!preview && (
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          {picker}
          <button className="btn link pop" onClick={() => download('kita-invoices-template.csv', invoiceTemplateCsv(data), 'text/csv')}>Download a template</button>
        </div>
      )}
      {!preview && !compact && (
        <p className="fine">
          Started the year before Kita? Bring in what you’ve invoiced so far from a spreadsheet, so your income by client, tax estimate and insights are complete.
          You need columns for the client, amount and date; date paid, hours, invoice number, currency and description are optional.
        </p>
      )}
      {error && <div className="callout">{error}</div>}
      {preview && (
        <div className="panel stack">
          <h3>Ready to import from {preview.file}</h3>
          {preview.invoices ? (
            <>
              <p>
                <b>{preview.invoices} {plural(preview.invoices, 'invoice')}</b> for {preview.clients.length} {plural(preview.clients.length, 'client')}
                {preview.paidTotal > 0 && <>, with <b>{money0(preview.paidTotal)}</b> paid</>}
                {preview.unpaid > 0 && <> and {preview.unpaid} still waiting to be paid</>}.
              </p>
              <div className="tw">
                <table>
                  <thead><tr><th>Client</th><th className="r">Invoices</th><th className="r">Hours</th><th className="r">Total</th></tr></thead>
                  <tbody>
                    {preview.clients.map(c => (
                      <tr key={c.name}>
                        <td>{c.name}{c.isNew && <span className="tag" style={{ marginLeft: 8 }}>New client</span>}</td>
                        <td className="r">{c.invoices}</td>
                        <td className="r">{c.hours ? Math.round(c.hours * 10) / 10 : '—'}</td>
                        <td className="r">{money0(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p>There’s nothing new to import in this file.</p>}
          <p className="fine">
            Kita read these columns: {Object.entries(preview.columns).map(([f, h]) => `${LABELS[f]} (“${h}”)`).join(', ')}.
            {' '}{preview.columns.status ? 'Whether each invoice is paid comes from the status column.'
              : preview.columns.paidDate && preview.columns.issueDate ? 'Rows with no date paid are treated as not paid yet.'
              : 'Every row counts as paid on its date.'}
          </p>
          {preview.skipped.length > 0 && (
            <details>
              <summary className="small">{preview.skipped.length} {plural(preview.skipped.length, 'row')} skipped</summary>
              <ul className="small" style={{ marginTop: 6 }}>
                {preview.skipped.slice(0, 20).map(x => <li key={x.line}>Row {x.line}: {x.reason}</li>)}
                {preview.skipped.length > 20 && <li>…and {preview.skipped.length - 20} more</li>}
              </ul>
            </details>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn link" onClick={() => setPreview(null)}>Cancel</button>
            {preview.invoices > 0 && <button className="btn primary" disabled={busy} onClick={confirm}>{busy ? 'Importing…' : `Import ${preview.invoices} ${plural(preview.invoices, 'invoice')}`}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
