import { emptyData, type Client, type KitaData, type Task, type TimeEntry } from '../store/types';
import { capacity, commitments, insights, whatIf } from './planning';

const today = '2026-10-30';
let n = 0;
const client = (extra: Partial<Client>): Client => ({
  id: `c${++n}`, name: `Client ${n}`, billing: 'hourly', rate: 50, fee: 0, included: 0, color: '#000000', weekly: 0, currency: '',
  email: '', address: '', createdAt: 0, ...extra,
});
const entry = (clientId: string, date: string, minutes: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `e${++n}`, clientId, date, minutes, billable: true, task: '', note: '', categoryId: '', taskId: '', createdAt: 0, ...extra,
});
const task = (extra: Partial<Task>): Task => ({
  id: `t${++n}`, clientId: '', categoryId: '', title: 'T', estimate: 0, due: null, recur: '', notes: '', status: 'todo',
  doneAt: null, createdAt: 0, ...extra,
});
const data = (patch: Partial<KitaData>): KitaData => ({ ...emptyData(), ...patch });

describe('commitments', () => {
  it('uses your estimate first, then the larger of retainer hours and the last 4 weeks', () => {
    const own = client({ weekly: 6 });
    const ret = client({ billing: 'retainer', included: 26 }); // 26 h a month = 6 h a week
    const busy = client({});
    const quiet = client({});
    const d = data({
      clients: [own, ret, busy, quiet],
      entries: [
        entry(busy.id, '2026-10-20', 8 * 60), entry(busy.id, '2026-10-06', 4 * 60), // 12 h in 4 weeks = 3 h a week
        entry(busy.id, '2026-09-01', 50 * 60), // older than 4 weeks: ignored
        entry(ret.id, '2026-10-10', 4 * 60), // 1 h a week, less than the retainer
      ],
    });
    const c = commitments(d, today);
    expect(c.map(r => [r.client.id, r.hours, r.source])).toEqual([
      [own.id, 6, 'your estimate'],
      [ret.id, 6, 'retainer hours'],
      [busy.id, 3, 'last 4 weeks'],
    ]);
  });

  it('works out free hours and what-ifs against your capacity', () => {
    const a = client({ weekly: 20 });
    const d = data({ clients: [a], settings: { ...emptyData().settings, capacity: 30 } });
    const c = capacity(d, today, '2026-11-01');
    expect(c).toMatchObject({ capacity: 30, committed: 20, free: 10 });
    expect(whatIf(c, 5)).toMatch(/25 of 30 hours a week \(83%\). There’s room/);
    expect(whatIf(c, 9)).toMatch(/Doable, but tight/);
    expect(whatIf(c, 15)).toBe('That’s 5 hours a week more than you have. You’d need to reduce other work first.');
    expect(whatIf({ ...c, capacity: 0 }, 5)).toBe('');
  });

  it('adds up estimates still to do for tasks due this week', () => {
    const t1 = task({ estimate: 120, due: '2026-10-31' });
    const t2 = task({ estimate: 60, due: '2026-11-20' }); // next month: not this week
    const t3 = task({ estimate: 90, due: '2026-10-29', status: 'done' });
    const d = data({ tasks: [t1, t2, t3], entries: [entry('x', '2026-10-30', 30, { taskId: t1.id })] });
    expect(capacity(d, today, '2026-11-01').plannedThisWeek).toBe(90);
  });
});

describe('insights', () => {
  it('flags clients paying well below and above your average', () => {
    const cheap = client({ name: 'Cheap Co', rate: 20 });
    const dear = client({ name: 'Dear Ltd', rate: 80 });
    const mid = client({ name: 'Mid', rate: 50 });
    const d = data({
      clients: [cheap, dear, mid],
      entries: [entry(cheap.id, '2026-10-01', 600), entry(dear.id, '2026-10-02', 600), entry(mid.id, '2026-10-03', 600)],
    });
    const texts = insights(d, today).map(i => i.text);
    expect(texts).toContain('Cheap Co pays you £20 an hour in practice, 60% below your £50 average. Worth reviewing your rate or the scope of work.');
    expect(texts).toContain('Dear Ltd is your best-paid work at £80 an hour, 60% above your average.');
    expect(texts.some(t => t.startsWith('Mid'))).toBe(false);
  });

  it('ignores clients with under 3 hours of time', () => {
    const cheap = client({ rate: 20 });
    const mid = client({ rate: 50 });
    const d = data({ clients: [cheap, mid], entries: [entry(cheap.id, '2026-10-01', 120), entry(mid.id, '2026-10-02', 600)] });
    expect(insights(d, today)).toEqual([]);
  });

  it('flags retainers that ran over in two of the last three months', () => {
    const r = client({ name: 'Busy Retainer', billing: 'retainer', fee: 1000, included: 10, rate: 0, startDate: '2026-01-01' });
    const d = data({ clients: [r], entries: [entry(r.id, '2026-10-01', 11 * 60), entry(r.id, '2026-09-01', 12 * 60), entry(r.id, '2026-08-01', 5 * 60)] });
    expect(insights(d, today).map(i => i.text)).toContain('Busy Retainer went over its retainer in 2 of the last 3 months. Consider raising the included hours.');
  });

  it('compares finished tasks with their estimates', () => {
    const tasks = [1, 2, 3].map(() => task({ status: 'done', doneAt: '2026-10-20', estimate: 60, categoryId: 'k' }));
    const d = data({
      tasks,
      categories: [{ id: 'k', name: 'Social media', createdAt: 0 }],
      entries: tasks.map(t => entry('x', '2026-10-20', 90, { taskId: t.id })),
    });
    expect(insights(d, today).map(i => i.text)).toEqual([
      'Finished tasks took 50% longer than you estimated (4:30 against 3:00).',
      'Social media tasks run 50% over your estimates. Build that into your quotes.',
    ]);
  });
});
