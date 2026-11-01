import { emptyData, type Client, type KitaData, type TimeEntry } from '../store/types';
import { parseRates, ratesStale } from './fx';
import { detectCountry, region, yearSystem } from './region';
import { monthSummary, yearSummary } from './selectors';

describe('detectCountry', () => {
  it('uses the time zone first', () => {
    expect(detectCountry('Asia/Manila', ['en-US'])).toBe('PH');
    expect(detectCountry('Europe/London', ['en-US'])).toBe('GB');
  });
  it('falls back to the language region', () => {
    expect(detectCountry('Asia/Dubai', ['en-PH'])).toBe('PH');
    expect(detectCountry('Asia/Dubai', ['fil'])).toBe('PH');
    expect(detectCountry('America/Chicago', ['en-US'])).toBe('US');
    expect(detectCountry('UTC', ['en-GB'])).toBe('GB');
  });
  it('says somewhere else for the rest of Europe, and the UK otherwise', () => {
    expect(detectCountry('Europe/Paris', ['fr-FR'])).toBe('OTHER');
    expect(detectCountry('Asia/Tokyo', ['ja-JP'])).toBe('GB');
  });
});

describe('region', () => {
  it('treats accounts without a country as the UK', () => {
    const d = emptyData();
    expect(region(d).code).toBe('GB');
    expect(yearSystem(d)).toBe('uk');
    expect(yearSystem({ ...d, settings: { ...d.settings, country: 'PH' } })).toBe('calendar');
  });
});

describe('exchange rates', () => {
  it('turns the service reply into home currency per unit', () => {
    const body = { result: 'success', base_code: 'PHP', rates: { PHP: 1, USD: 0.017, GBP: 0.0135, XXX: 'bad' } };
    expect(parseRates(body, 'PHP', '2026-11-01', ['USD', 'GBP', 'PHP', 'XXX'])).toEqual({
      USD: { rate: 58.82352941, date: '2026-11-01' },
      GBP: { rate: 74.07407407, date: '2026-11-01' },
    });
  });
  it('ignores failed or mismatched replies', () => {
    expect(parseRates({ result: 'error' }, 'GBP', '2026-11-01', ['USD'])).toEqual({});
    expect(parseRates({ result: 'success', base_code: 'USD', rates: { GBP: 0.8 } }, 'GBP', '2026-11-01', ['USD'])).toEqual({});
    expect(parseRates(null, 'GBP', '2026-11-01', ['USD'])).toEqual({});
  });
  it('knows when rates need refreshing', () => {
    const rates = { USD: { rate: 56, date: '2026-10-31' } };
    expect(ratesStale(rates, ['USD'], '2026-11-01')).toBe(true);
    expect(ratesStale(rates, ['USD'], '2026-10-31')).toBe(false);
    expect(ratesStale(rates, ['EUR'], '2026-10-31')).toBe(true);
  });
});

describe('clients and invoices in other currencies', () => {
  const usd: Client = {
    id: 'u', name: 'Acme Inc', billing: 'hourly', rate: 50, fee: 0, included: 0, color: '', weekly: 0, currency: 'USD',
    email: '', address: '', createdAt: 0,
  };
  const entry: TimeEntry = { id: 'e', clientId: 'u', date: '2026-10-05', minutes: 120, billable: true, task: '', note: '', categoryId: '', taskId: '', createdAt: 0 };
  const ph = (fx: KitaData['settings']['fxRates']): KitaData => {
    const d = emptyData();
    return { ...d, clients: [usd], entries: [entry], settings: { ...d.settings, country: 'PH', currency: 'PHP', setAside: 20, fxRates: fx } };
  };

  it('values the work in the client’s currency and converts it home', () => {
    const r = monthSummary(ph({ USD: { rate: 56, date: '2026-10-05' } }), '2026-10').rows[0]!;
    expect(r).toMatchObject({ currency: 'USD', own: { value: 100, unbilled: 100 }, value: 5600, unbilled: 5600, noRate: false, hourly: 2800 });
  });

  it('leaves the work out of home totals until there is a rate', () => {
    const m = monthSummary(ph({}), '2026-10');
    expect(m.rows[0]).toMatchObject({ noRate: true, value: 0, own: { value: 100 } });
    expect(m.value).toBe(0);
  });

  it('counts a paid foreign invoice at the amount received, with a calendar year and set-aside', () => {
    const d = ph({ USD: { rate: 56, date: '2026-10-05' } });
    d.invoices = [{
      id: 'i', number: 'INV-001', clientId: 'u', clientName: 'Acme Inc', clientEmail: '', clientAddress: '', period: '2026-10',
      issueDate: '2026-10-31', dueDate: '2026-11-14', lines: [{ desc: 'Work', qty: 2, unit: 50, kind: 'time' }], subtotal: 100, vatRate: 0, vat: 0, total: 100,
      status: 'paid', paidDate: '2026-11-01', terms: '', entryIds: [], currency: 'USD', fxRate: 56, receivedHome: 5500,
      from: { name: '', business: '', email: '', address: '', payment: '', vatNumber: '' }, note: '', createdAt: 0,
    }];
    const y = yearSummary(d, 2026, '2026-11-01');
    expect(y.sys).toBe('calendar');
    expect(y.figures.income).toBe(5500);
    expect(y.figures.tax.total).toBe(1100);
    expect(y.figures.takeHome).toBe(4400);
  });
});
