/** Downloads: invoice PDFs and CSV/JSON exports. */
import { lineAmount, quarterTotals, taxYearLabel } from '../../lib/money';
import type { Invoice, KitaData } from '../store/types';
import { EXPENSE_CATEGORIES } from './categories';
import { fmtDate, gbp } from './format';

export function download(filename: string, data: Blob | string, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n');

export function entriesCsv(d: KitaData): string {
  const clientName = (id: string) => d.clients.find(c => c.id === id)?.name ?? '';
  const invoiceNo = (id?: string | null) => d.invoices.find(i => i.id === id)?.number ?? '';
  return csv([
    ['Date', 'Client', 'Category', 'Task', 'Note', 'Hours', 'Billable', 'Invoice'],
    ...[...d.entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => [e.date, clientName(e.clientId), d.categories.find(c => c.id === e.categoryId)?.name ?? '', e.task, e.note, (e.minutes / 60).toFixed(2), e.billable ? 'Yes' : 'No', invoiceNo(e.invoiceId)]),
  ]);
}

export function quartersCsv(d: KitaData, taxYear: number): { filename: string; text: string } {
  const qs = quarterTotals(d.invoices, d.expenses, taxYear, EXPENSE_CATEGORIES);
  return {
    filename: `kita-quarters-${taxYearLabel(taxYear).replace('/', '-')}.csv`,
    text: csv([
      ['Quarter', 'From', 'To', 'Income received', ...EXPENSE_CATEGORIES, 'Total expenses', 'Profit'],
      ...qs.map(q => [`Q${q.quarter}`, q.from, q.to, q.income.toFixed(2), ...q.byCategory.map(v => v.toFixed(2)), q.expenses.toFixed(2), q.profit.toFixed(2)]),
    ]),
  };
}

/**
 * An A4 invoice. Uses the details saved on the invoice when it was created.
 * The PDF library is large, so it's only downloaded the first time it's needed.
 */
export async function invoicePdf(inv: Invoice): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const f = inv.from;
  const L = 20, R = 190;
  let y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Invoice', L, y);
  doc.setFontSize(11);
  doc.text(inv.number, R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 12;
  const from = [f.business || f.name, f.business ? f.name : '', ...f.address.split('\n'), f.email, f.vatNumber ? `VAT number: ${f.vatNumber}` : ''].filter(Boolean);
  const to = [inv.clientName, ...inv.clientAddress.split('\n'), inv.clientEmail].filter(Boolean);
  doc.setTextColor(110);
  doc.text('From', L, y);
  doc.text('Bill to', 85, y);
  doc.text('Issued', 150, y);
  doc.setTextColor(20);
  let yy = y + 5;
  for (const l of from) { doc.text(l, L, yy); yy += 5; }
  let yt = y + 5;
  for (const l of to) { doc.text(l, 85, yt); yt += 5; }
  doc.text(fmtDate(inv.issueDate), 150, y + 5);
  doc.setTextColor(110);
  doc.text('Due', 150, y + 12);
  doc.setTextColor(20);
  doc.text(fmtDate(inv.dueDate), 150, y + 17);
  y = Math.max(yy, yt, y + 22) + 8;
  doc.setDrawColor(200);
  doc.line(L, y, R, y);
  y += 6;
  doc.setTextColor(110);
  doc.text('Description', L, y);
  doc.text('Qty', 130, y, { align: 'right' });
  doc.text('Unit price', 160, y, { align: 'right' });
  doc.text('Amount', R, y, { align: 'right' });
  doc.setTextColor(20);
  y += 3;
  doc.line(L, y, R, y);
  y += 6;
  for (const l of inv.lines) {
    const desc = doc.splitTextToSize(l.desc || '', 95) as string[];
    if (y + desc.length * 5 > 265) { doc.addPage(); y = 24; }
    doc.text(desc, L, y);
    doc.text(String(+l.qty), 130, y, { align: 'right' });
    doc.text(gbp(l.unit), 160, y, { align: 'right' });
    doc.text(gbp(lineAmount(l)), R, y, { align: 'right' });
    y += desc.length * 5 + 3;
  }
  doc.line(L, y, R, y);
  y += 7;
  const total = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 160, y, { align: 'right' });
    doc.text(val, R, y, { align: 'right' });
    y += 6;
  };
  total('Subtotal', gbp(inv.subtotal));
  if (inv.vatRate) total(`VAT at ${inv.vatRate}%`, gbp(inv.vat));
  total('Total due', gbp(inv.total), true);
  doc.setFont('helvetica', 'normal');
  y += 6;
  if (f.payment) {
    doc.setTextColor(110);
    doc.text('Payment details', L, y);
    doc.setTextColor(20);
    y += 5;
    for (const l of doc.splitTextToSize(f.payment, 170) as string[]) { doc.text(l, L, y); y += 5; }
    y += 3;
  }
  if (inv.note) for (const l of doc.splitTextToSize(inv.note, 170) as string[]) { doc.text(l, L, y); y += 5; }
  return doc.output('blob');
}
