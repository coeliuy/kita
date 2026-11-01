import { emptyData, type Invoice, type KitaData } from '../store/types';
import { invoiceFileName } from './files';
import { findColumns, importInvoicesCsv, invoiceTemplateCsv, parseAmount, parseCsv, parseDate, parseHours } from './importInvoices';

const today = '2026-11-01';
const withSettings = (patch: Partial<KitaData['settings']>): KitaData => {
  const d = emptyData();
  return { ...d, settings: { ...d.settings, ...patch } };
};

describe('reading spreadsheet cells', () => {
  it('reads CSV with quotes, commas inside cells and other separators', () => {
    expect(parseCsv('﻿Client,Amount\r\n"Smith, Jones & Co","1,200.00"\n\n')).toEqual([['Client', 'Amount'], ['Smith, Jones & Co', '1,200.00']]);
    expect(parseCsv('Client;Amount\nA;"say ""hi"""')).toEqual([['Client', 'Amount'], ['A', 'say "hi"']]);
    expect(parseCsv('Client\tAmount\nA\t5')).toEqual([['Client', 'Amount'], ['A', '5']]);
  });

  it('reads dates the way people write them', () => {
    expect(parseDate('2026-10-31', true)).toBe('2026-10-31');
    expect(parseDate('01/02/2026', true)).toBe('2026-02-01');
    expect(parseDate('01/02/2026', false)).toBe('2026-01-02');
    expect(parseDate('31/10/26', false)).toBe('2026-10-31'); // can only be day first
    expect(parseDate('31 Oct 2026', true)).toBe('2026-10-31');
    expect(parseDate('October 3rd, 2026', true)).toBe('2026-10-03');
    expect(parseDate('31/02/2026', true)).toBeNull();
    expect(parseDate('soon', true)).toBeNull();
  });

  it('reads amounts and hours', () => {
    expect(parseAmount('£1,234.50')).toBe(1234.5);
    expect(parseAmount('₱ 25,000')).toBe(25000);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('(200.00)')).toBe(-200);
    expect(parseAmount('')).toBeNull();
    expect(parseHours('7.5')).toBe(7.5);
    expect(parseHours('7:30')).toBe(7.5);
    expect(parseHours('7h 30m')).toBe(7.5);
  });

  it('finds columns by their usual names', () => {
    expect(findColumns(['Invoice #', 'Customer', 'Invoice Date', 'Date Paid', 'Total (£)', 'Hours worked'])).toEqual({
      number: 0, client: 1, issueDate: 2, paidDate: 3, amount: 4, hours: 5,
    });
  });
});

describe('importing past invoices', () => {
  const csv = [
    'Client,Invoice number,Date,Date paid,Amount,Hours,Description',
    'Northlight Legal,INV-007,30/04/2026,14/05/2026,"1,200",20,April retainer',
    'northlight legal,INV-008,31/05/2026,10/06/2026,1200,24,May retainer',
    'Fennel Bakery,INV-009,31/10/2026,,850,,Website updates',
    'Fennel Bakery,,,,100,,No date',
    ',INV-010,31/10/2026,,50,,No client',
    'Future Co,INV-011,31/12/2026,,50,,Not yet',
  ].join('\n');

  it('creates clients, paid and unpaid invoices and linked time', () => {
    const r = importInvoicesCsv(csv, withSettings({ nextInv: 3 }), today);
    expect(r.invoices).toBe(3);
    expect(r.unpaid).toBe(1);
    expect(r.paidTotal).toBe(2400);
    expect(r.clients).toEqual([
      { name: 'Northlight Legal', isNew: true, invoices: 2, total: 2400, hours: 44 },
      { name: 'Fennel Bakery', isNew: true, invoices: 1, total: 850, hours: 0 },
    ]);
    expect(r.skipped.map(x => x.reason)).toEqual(['no date', 'no client name', 'date is in the future']);
    const [a, , c] = r.result.invoices as [Invoice, Invoice, Invoice];
    expect(a).toMatchObject({ number: 'INV-007', status: 'paid', issueDate: '2026-04-30', paidDate: '2026-05-14', total: 1200, period: '2026-04' });
    expect(c).toMatchObject({ status: 'unpaid', paidDate: null, dueDate: '2026-11-30' });
    // Hours become time already linked to the invoice, so they don't show as unbilled.
    expect(r.result.entries).toHaveLength(2);
    expect(r.result.entries[0]).toMatchObject({ minutes: 1200, invoiceId: a.id, date: '2026-04-30' });
    expect(r.result.clients.find(x => x.name === 'Northlight Legal')!.rate).toBe(55); // 2400 / 44 h
    // Numbering carries on after the highest imported number.
    expect(r.result.settings).toEqual({ nextInv: 10 });
  });

  it('matches existing clients and skips invoices already in Kita', () => {
    const first = importInvoicesCsv(csv, emptyData(), today);
    const d: KitaData = { ...emptyData(), clients: first.result.clients, invoices: first.result.invoices };
    const again = importInvoicesCsv(csv, d, today);
    expect(again.invoices).toBe(0);
    expect(again.skipped.filter(x => x.reason.startsWith('already in Kita'))).toHaveLength(3);
    const more = importInvoicesCsv('Client,Date,Amount\nNorthlight Legal,2026-07-31,1200', d, today);
    expect(more.clients[0]).toMatchObject({ name: 'Northlight Legal', isNew: false });
    expect(more.result.clients).toEqual([]);
  });

  it('uses US dates in the US, and the amount received for other currencies', () => {
    const d = withSettings({ country: 'PH', currency: 'PHP' });
    const r = importInvoicesCsv('Client,Date,Amount,Currency,Amount received\nAcme,03/04/2026,500,USD,28000\nBeta,03/04/2026,100,EUR,', d, today);
    expect(r.result.invoices[0]).toMatchObject({ issueDate: '2026-04-03', currency: 'USD', receivedHome: 28000, fxRate: 56 });
    expect(r.paidTotal).toBe(28000);
    expect(r.skipped[0]!.reason).toMatch(/EUR with no exchange rate/);
    const us = importInvoicesCsv('Client,Date,Amount\nAcme,03/04/2026,500', withSettings({ country: 'US', currency: 'USD' }), today);
    expect(us.result.invoices[0]!.issueDate).toBe('2026-03-04');
  });

  it('respects a status column and explains missing columns', () => {
    const r = importInvoicesCsv('Customer,Date,Total,Status\nA,2026-10-01,10,Outstanding\nB,2026-10-01,20,Paid', emptyData(), today);
    expect(r.result.invoices.map(i => i.status)).toEqual(['unpaid', 'paid']);
    expect(() => importInvoicesCsv('Name,When\nA,2026-01-01', emptyData(), today)).toThrow(/client or amount/);
  });

  it('accepts its own template', () => {
    for (const country of ['GB', 'PH', 'US'] as const) {
      const d = withSettings({ country, currency: { GB: 'GBP', PH: 'PHP', US: 'USD' }[country] });
      const r = importInvoicesCsv(invoiceTemplateCsv(d), d, today);
      expect(r.skipped).toEqual([]);
      expect(r.invoices).toBe(3);
    }
  });
});

describe('invoice file names', () => {
  const inv = { number: 'INV-012', period: '2026-10', issueDate: '2026-11-01', from: { name: 'Coeli', business: 'Kita App' } } as Invoice;
  it('uses the business name, the month worked and the number', () => {
    expect(invoiceFileName(inv)).toBe('Kita App - Oct-26 - INV-012.pdf');
    expect(invoiceFileName({ ...inv, period: null, from: { ...inv.from, business: '' } })).toBe('Coeli - Nov-26 - INV-012.pdf');
    expect(invoiceFileName({ ...inv, from: { ...inv.from, business: '', name: '' } }, 'New Name Ltd')).toBe('New Name Ltd - Oct-26 - INV-012.pdf');
    expect(invoiceFileName({ ...inv, number: 'A/B 1', from: { ...inv.from, business: '' , name: '' } })).toBe('Oct-26 - A-B 1.pdf');
  });
});
