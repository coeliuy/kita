/** Downloads: invoice PDFs and CSV/JSON exports. */
import { billableMinutes, formatHM, lineAmount, monthEnd, monthLabel, quarterTotals, retainerUsage, sumMinutes, taxYearLabel } from '../../lib/money';
import type { Invoice, KitaData } from '../store/types';
import { EXPENSE_CATEGORIES } from './categories';
import { fmtDate, homeCurrencyCode, money, parseYmd } from './format';
import { yearSystem } from './region';

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
  const sys = yearSystem(d);
  const qs = quarterTotals(d.invoices, d.expenses, taxYear, EXPENSE_CATEGORIES, sys);
  return {
    filename: `kita-quarters-${taxYearLabel(taxYear, sys).replace('/', '-')}.csv`,
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
export async function invoicePdf(inv: Invoice, taxName = 'VAT'): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const cur = inv.currency || homeCurrencyCode();
  // The PDF's built-in fonts have £, $ and € but not ₱, so other symbols are shown as the code (PHP 1,000.00).
  const m = (n: number) => {
    const s = money(n, cur);
    return /^[\x00-\xff€]*$/.test(s) ? s : `${cur} ${money(n, cur).replace(/[^\d.,\-]/g, '')}`;
  };
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
  const from = [f.business || f.name, f.business ? f.name : '', ...f.address.split('\n'), f.email, f.vatNumber ? `${taxName === 'VAT' ? 'VAT number' : 'Tax ID'}: ${f.vatNumber}` : ''].filter(Boolean);
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
    doc.setFontSize(8.5);
    const detail = l.detail ? (doc.splitTextToSize(l.detail, 95) as string[]) : [];
    doc.setFontSize(10);
    if (y + desc.length * 5 + detail.length * 4 > 265) { doc.addPage(); y = 24; }
    doc.text(desc, L, y);
    doc.text(String(+l.qty), 130, y, { align: 'right' });
    doc.text(m(l.unit), 160, y, { align: 'right' });
    doc.text(m(lineAmount(l)), R, y, { align: 'right' });
    y += desc.length * 5;
    if (detail.length) {
      doc.setFontSize(8.5);
      doc.setTextColor(110);
      doc.text(detail, L, y - 1);
      doc.setTextColor(20);
      doc.setFontSize(10);
      y += detail.length * 4;
    }
    y += 3;
  }
  doc.line(L, y, R, y);
  y += 7;
  const total = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 160, y, { align: 'right' });
    doc.text(val, R, y, { align: 'right' });
    y += 6;
  };
  total('Subtotal', m(inv.subtotal));
  if (inv.vatRate) total(`${taxName} at ${inv.vatRate}%`, m(inv.vat));
  total('Total due', m(inv.total), true);
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

/**
 * A monthly report for a client: hours, retainer use, tasks completed, time by
 * category and a full work log. Useful to send retainer clients with their invoice.
 */
export async function clientReportPdf(d: KitaData, clientId: string, month: string): Promise<{ filename: string; blob: Blob }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = d.settings;
  const c = d.clients.find(x => x.id === clientId);
  const name = c?.name ?? 'Client';
  const from = `${month}-01`, to = monthEnd(month);
  const es = d.entries.filter(e => e.clientId === clientId && e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const catName = (id: string) => d.categories.find(x => x.id === id)?.name ?? 'General';
  const L = 20, R = 190;
  let y = 24;
  const page = (need: number) => { if (y + need > 278) { doc.addPage(); y = 24; } };
  const head = (t: string) => {
    y += 4; page(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t, L, y);
    y += 3; doc.setDrawColor(210); doc.line(L, y, R, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Monthly report', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text(`${name}, ${monthLabel(month)}`, L, y + 8);
  const by = s.business || s.name;
  if (by) { doc.setFontSize(9); doc.setTextColor(110); doc.text(`Prepared by ${by}`, L, y + 14); doc.setTextColor(20); }
  y += 28;

  // Summary figures
  const done = d.tasks.filter(t => t.clientId === clientId && t.status === 'done' && t.doneAt && t.doneAt >= from && t.doneAt <= to);
  const summary: [string, string][] = [['Hours worked', formatHM(sumMinutes(es))]];
  if (c?.billing === 'retainer' && c.included > 0) {
    const u = retainerUsage(c, billableMinutes(es));
    summary.push(['Retainer hours', formatHM(c.included * 60)]);
    summary.push(u.overHours > 0 ? ['Over the retainer', formatHM(u.overHours * 60)] : ['Hours remaining', formatHM(u.leftHours * 60)]);
  }
  summary.push(['Tasks completed', String(done.length)]);
  summary.forEach(([label, value], i) => {
    const x = L + i * 43;
    doc.setFontSize(9); doc.setTextColor(110); doc.text(label, x, y);
    doc.setTextColor(20); doc.setFontSize(18); doc.text(value, x, y + 9);
  });
  doc.setFontSize(10);
  y += 18;

  head('Time by category');
  const g = new Map<string, number>();
  for (const e of es) g.set(catName(e.categoryId), (g.get(catName(e.categoryId)) ?? 0) + e.minutes);
  const max = Math.max(1, ...g.values());
  for (const [k, m] of [...g].sort((a, b) => b[1] - a[1])) {
    page(8);
    doc.text(k, L, y);
    doc.setFillColor(196, 73, 0); doc.rect(80, y - 3.2, (90 * m) / max, 3.6, 'F');
    doc.text(formatHM(m), R, y, { align: 'right' });
    y += 7;
  }
  if (!g.size) { doc.setTextColor(110); doc.text('No time tracked this month.', L, y); doc.setTextColor(20); y += 7; }

  if (done.length) {
    head('Completed this month');
    for (const t of done) {
      const lines = doc.splitTextToSize(t.title + (t.notes ? `: ${t.notes}` : ''), 160) as string[];
      page(lines.length * 5 + 2);
      doc.text('•', L, y); doc.text(lines, L + 5, y);
      y += lines.length * 5 + 1.5;
    }
  }

  head('Work log');
  doc.setFontSize(8.5); doc.setTextColor(110);
  doc.text('Date', L, y); doc.text('Category', 42, y); doc.text('Work done', 82, y); doc.text('Time', R, y, { align: 'right' });
  doc.setTextColor(20); y += 5;
  for (const e of es) {
    const work = doc.splitTextToSize([e.task, e.note].filter(Boolean).join(': ') || '-', 90) as string[];
    const cat = doc.splitTextToSize(catName(e.categoryId), 36) as string[];
    const h = Math.max(work.length, cat.length) * 4;
    page(h + 2);
    doc.text(fmtDateShort(e.date), L, y); doc.text(cat, 42, y); doc.text(work, 82, y); doc.text(formatHM(e.minutes), R, y, { align: 'right' });
    y += h + 2;
  }

  const slug = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'client';
  return { filename: `${slug}-report-${month}.pdf`, blob: doc.output('blob') };
}

const fmtDateShort = (date: string) => parseYmd(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
