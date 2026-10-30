import { emptyData } from '../store/types';
import { importBackup, ImportError } from './importBackup';

// A backup in the shape the prototype's "Download everything (JSON)" produced.
const prototypeBackup = {
  settings: {
    name: 'Coeli', business: 'Dahil Digital', address: '1 High St', email: 'hi@example.com', payment: 'Sort 00-00-00',
    invPrefix: 'DD-', nextInv: 7, terms: 'eofm', vat: true, vatRate: 20,
    otherIncome: 25000, goal: 40000, goalType: 'net', taxSaved: 1500,
    tax: { pa: 12570, basicBand: 37700, addl: 125140, taper: 100000, r1: 20, r2: 41, r3: 45, c4lo: 12570, c4hi: 50270, c4a: 6, c4b: 2 },
    timer: null, theme: 'dark',
  },
  clients: [
    { id: 'mfa1', name: 'Northlight Legal', billing: 'retainer', fee: 1200, included: 25, rate: 50, color: '#1F6F5C', email: 'ap@nl.co', address: '2 Law Lane' },
    { id: 'mfa2', name: 'Harbour', billing: 'hourly', rate: 45, color: 'red' },
    { id: 'demo1', name: 'Demo client', billing: 'hourly', rate: 10, color: '#3B6FB6', demo: true },
  ],
  entries: [
    { id: 'e1', clientId: 'mfa1', task: 'Posts', note: '', date: '2026-08-14', minutes: 90, billable: true, createdAt: 1, invoiceId: 'inv1' },
    { id: 'e2', clientId: 'mfa2', task: 'Call', note: 'n', date: '2026-09-02', minutes: 30, billable: false, createdAt: 2 },
    { id: 'e3', clientId: 'mfa2', task: 'Bad', date: '2026-09-03', minutes: 5400, createdAt: 3 }, // 90 hours: skipped
    { id: 'e4', clientId: 'gone', task: 'Orphan', date: '2026-09-04', minutes: 60, createdAt: 4 },
    { id: 'd1', clientId: 'demo1', date: '2026-09-05', minutes: 60, demo: true },
  ],
  invoices: [
    {
      id: 'inv1', number: 'DD-006', clientId: 'mfa1', clientName: 'Northlight Legal', period: '2026-08',
      issueDate: '2026-08-31', dueDate: '2026-09-30', subtotal: 1225, vat: 245, total: 1470, status: 'paid', paidDate: '2026-09-20',
      lines: [
        { desc: 'Monthly retainer, August 2026 (25 hours included)', qty: 1, unit: 1200 },
        { desc: 'Additional hours beyond the retainer, August 2026', qty: 0.5, unit: 50 },
      ],
      note: '', entryIds: ['e1'], createdAt: 5,
    },
    { id: 'inv2', number: 'DD-005', clientId: 'mfa2', issueDate: '2026-07-31', dueDate: '2026-08-30', subtotal: 45, vat: 0, total: 45, status: 'paid', lines: [{ desc: 'Work (July 2026)', qty: 1, unit: 45 }] },
  ],
  expenses: [
    { id: 'x1', date: '2026-09-10', amount: 13, category: 'Software and subscriptions', desc: 'Canva', clientId: '' },
    { id: 'x2', date: '2026-09-11', amount: 20, category: 'Snacks', desc: 'Biscuits', clientId: 'mfa2' },
  ],
};

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const run = (raw: unknown = prototypeBackup, existing = emptyData()) => importBackup(structuredClone(raw), existing, '2026-10-30', newId);

describe('importBackup from the prototype', () => {
  it('imports real records and skips demo data and impossible entries', () => {
    const r = run();
    expect(r.clients.map(c => c.name)).toEqual(['Northlight Legal', 'Harbour']);
    expect(r.entries.map(e => e.task)).toEqual(['Posts', 'Call', 'Orphan']);
    expect(r.invoices).toHaveLength(2);
    expect(r.expenses).toHaveLength(2);
    expect(r.skipped).toBe(3); // demo client, demo entry, 90-hour entry
  });

  it('gives everything new ids and keeps the links between records', () => {
    const r = run();
    const [northlight, harbour] = r.clients;
    const posts = r.entries.find(e => e.task === 'Posts')!;
    const inv = r.invoices.find(i => i.number === 'DD-006')!;
    expect(northlight!.id).toMatch(/^0{8}-/);
    expect(posts.clientId).toBe(northlight!.id);
    expect(posts.invoiceId).toBe(inv.id);
    expect(inv.clientId).toBe(northlight!.id);
    expect(inv.entryIds).toEqual([posts.id]);
    expect(r.expenses[1]!.clientId).toBe(harbour!.id);
    expect(r.entries.find(e => e.task === 'Orphan')!.clientId).toBe(''); // client no longer exists
  });

  it('works out what each invoice line was for', () => {
    const inv = run().invoices.find(i => i.number === 'DD-006')!;
    expect(inv.lines.map(l => l.kind)).toEqual(['retainer_fee', 'overage']);
    expect(run().invoices.find(i => i.number === 'DD-005')!.lines[0]!.kind).toBe('time');
  });

  it('keeps payment dates, and uses the issue date for paid invoices without one', () => {
    const r = run();
    expect(r.invoices.find(i => i.number === 'DD-006')!.paidDate).toBe('2026-09-20');
    expect(r.invoices.find(i => i.number === 'DD-005')!.paidDate).toBe('2026-07-31');
  });

  it('records the VAT rate and your details on each invoice', () => {
    const r = run();
    const inv = r.invoices.find(i => i.number === 'DD-006')!;
    expect(inv.vatRate).toBe(20);
    expect(r.invoices.find(i => i.number === 'DD-005')!.vatRate).toBe(0);
    expect(inv.from.business).toBe('Dahil Digital');
    expect(inv.clientAddress).toBe('2 Law Lane');
  });

  it('starts a retainer from the month of its first time entry', () => {
    expect(run().clients[0]!.startDate).toBe('2026-08-01');
  });

  it('fixes invalid colours and unknown expense categories', () => {
    const r = run();
    expect(r.clients[1]!.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(r.expenses[1]!.category).toBe('Other allowable costs');
  });

  it('carries settings over, and the goal, salary and changed rates to this tax year', () => {
    const r = run();
    expect(r.settings).toMatchObject({ name: 'Coeli', invPrefix: 'DD-', nextInv: 7, terms: 'eofm', vatRegistered: true, vatRate: 20 });
    expect(r.years).toEqual([{
      taxYear: 2026,
      patch: { otherIncome: 25000, goal: 40000, goalType: 'net', taxSaved: 1500, rateOverrides: { higherRate: 41 } },
    }]);
  });

  it('never reuses an invoice number already in the account', () => {
    const existing = emptyData();
    existing.invoices.push({ number: 'DD-006' } as never);
    existing.settings.nextInv = 20;
    const r = run(prototypeBackup, existing);
    expect(r.invoices.find(i => i.clientName === 'Northlight Legal')!.number).toBe('DD-006-2');
    expect(r.settings.nextInv).toBe(20);
  });

  it('rejects files that are not Kita backups', () => {
    expect(() => run({ hello: 'world' })).toThrow(ImportError);
    expect(() => run([1, 2])).toThrow(ImportError);
  });
});

describe('importBackup with tasks and categories (later prototype)', () => {
  const backup = {
    ...structuredClone(prototypeBackup),
    settings: { ...prototypeBackup.settings, capacity: 30, invNotes: false },
    categories: [{ id: 'k1', name: 'Social media' }, { id: 'k2', name: 'Email marketing' }, { id: 'kd', name: 'Demo cat', demo: true }],
    tasks: [
      { id: 't1', clientId: 'mfa1', categoryId: 'k1', title: 'LinkedIn batch', estimate: 120, due: '2026-11-06', recur: 'weekly', status: 'doing', notes: 'Five posts' },
      { id: 't2', clientId: 'mfa2', categoryId: '', title: 'Old task', status: 'done', doneAt: '2026-09-01' },
    ],
  };
  backup.entries[0] = { ...backup.entries[0]!, categoryId: 'k1', taskId: 't1' } as never;

  it('brings categories and tasks across, keeping links', () => {
    const r = run(backup);
    expect(r.categories.map(c => c.name)).toEqual(['Social media', 'Email marketing']);
    const social = r.categories[0]!;
    const [batch, old] = r.tasks;
    expect(batch).toMatchObject({ title: 'LinkedIn batch', estimate: 120, due: '2026-11-06', recur: 'weekly', status: 'doing', categoryId: social.id, clientId: r.clients[0]!.id });
    expect(old).toMatchObject({ status: 'done', doneAt: '2026-09-01', categoryId: '' });
    const posts = r.entries.find(e => e.task === 'Posts')!;
    expect(posts.categoryId).toBe(social.id);
    expect(posts.taskId).toBe(batch!.id);
    expect(r.settings).toMatchObject({ capacity: 30, invNotes: false });
  });

  it('reuses a category you already have with the same name', () => {
    const existing = emptyData();
    existing.categories.push({ id: 'mine', name: 'social MEDIA', createdAt: 0 });
    const r = run(backup, existing);
    expect(r.categories.map(c => c.name)).toEqual(['Email marketing']);
    expect(r.tasks[0]!.categoryId).toBe('mine');
  });
});

describe('importBackup from this app', () => {
  it('imports per-year settings', () => {
    const backup = { ...emptyData(), years: { 2025: { otherIncome: 1, goal: 2, goalType: 'gross', taxSaved: 3, rateOverrides: {} } } };
    expect(run(backup).years).toEqual([{ taxYear: 2025, patch: { otherIncome: 1, goal: 2, goalType: 'gross', taxSaved: 3, rateOverrides: {} } }]);
  });
});
