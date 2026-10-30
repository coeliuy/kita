import type { Category, Task, TimeEntry } from '../store/types';
import { invoiceDraftOptions } from './invoiceDetails';

const cats: Category[] = [{ id: 'k1', name: 'Social media', createdAt: 0 }, { id: 'k2', name: 'Email marketing', createdAt: 0 }];
const tasks = [{ id: 't1', title: 'Friday LinkedIn batch' }] as Task[];
const e = (minutes: number, extra: Partial<TimeEntry>): TimeEntry =>
  ({ id: '', clientId: 'c', date: '2026-10-01', minutes, billable: true, task: '', note: '', categoryId: '', taskId: '', createdAt: 0, ...extra });

describe('invoice line details', () => {
  const es = [
    e(120, { categoryId: 'k1', taskId: 't1', task: 'old title', note: 'Drafted 5 posts' }),
    e(30, { categoryId: 'k2', task: 'Newsletter' }),
    e(30, { categoryId: 'k2', task: 'Newsletter' }),
    e(15, { task: 'Quick call' }),
  ];

  it('groups by category, with uncategorised time as Services', () => {
    const o = invoiceDraftOptions(cats, tasks, true);
    expect(es.map(o.groupBy)).toEqual(['Social media', 'Email marketing', 'Email marketing', 'Services']);
  });

  it('lists each task once, using its current title and the note', () => {
    const o = invoiceDraftOptions(cats, tasks, true);
    expect(o.describe(es, 'time')).toBe('Friday LinkedIn batch: Drafted 5 posts; Newsletter; Quick call');
  });

  it('shows time by category on retainer and fixed-fee lines', () => {
    const o = invoiceDraftOptions(cats, tasks, true);
    expect(o.describe(es, 'fixed_fee')).toBe('Time by category: Social media 2 h, Email marketing 1 h, General 0.3 h');
    expect(o.describe(es, 'retainer_fee')).toBe(
      'Time by category: Social media 2 h, Email marketing 1 h, General 0.3 h. Work included: Friday LinkedIn batch: Drafted 5 posts; Newsletter; Quick call',
    );
    expect(o.describe([], 'retainer_fee')).toBe('');
  });

  it('leaves out task names and notes when switched off in Settings', () => {
    const o = invoiceDraftOptions(cats, tasks, false);
    expect(o.describe(es, 'time')).toBe('');
    expect(o.describe(es, 'retainer_fee')).toBe('Time by category: Social media 2 h, Email marketing 1 h, General 0.3 h');
  });

  it('keeps long lists short', () => {
    const many = [...Array(13)].map((_, i) => e(10, { task: `Task ${i + 1}` }));
    expect(invoiceDraftOptions(cats, tasks, true).describe(many, 'time')).toMatch(/Task 10; and 3 more$/);
  });
});
