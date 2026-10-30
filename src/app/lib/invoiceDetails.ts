/**
 * How Kita fills in invoice lines from tracked time: hourly time grouped by
 * work category, with the tasks and notes listed under each line.
 */
import type { DraftOptions, InvoiceLineKind } from '../../lib/money';
import type { Category, Task, TimeEntry } from '../store/types';

const MAX_ITEMS = 10;
const hours1 = (minutes: number) => String(Math.round(minutes / 6) / 10);

export function invoiceDraftOptions(
  categories: Category[],
  tasks: Task[],
  showWork: boolean,
): Required<DraftOptions<TimeEntry>> {
  const catName = (id: string) => categories.find(c => c.id === id)?.name;

  /** "Friday LinkedIn batch: Drafted 5 posts; Newsletter; and 3 more" */
  const work = (es: TimeEntry[]) => {
    if (!showWork) return '';
    const items: string[] = [];
    for (const e of es) {
      const title = tasks.find(t => t.id === e.taskId)?.title ?? e.task;
      const item = [title, e.note].filter(Boolean).join(': ');
      if (item && !items.includes(item)) items.push(item);
    }
    const more = items.length - MAX_ITEMS;
    return items.slice(0, MAX_ITEMS).join('; ') + (more > 0 ? `; and ${more} more` : '');
  };

  /** "Social media 6.5 h, Email marketing 2 h" */
  const byCategory = (es: TimeEntry[]) => {
    const g = new Map<string, number>();
    for (const e of es) {
      const k = catName(e.categoryId) ?? 'General';
      g.set(k, (g.get(k) ?? 0) + e.minutes);
    }
    return [...g].sort((a, b) => b[1] - a[1]).map(([k, m]) => `${k} ${hours1(m)} h`).join(', ');
  };

  return {
    groupBy: e => catName(e.categoryId) ?? 'Services',
    describe: (es: TimeEntry[], kind: InvoiceLineKind) => {
      if (kind === 'time') return work(es);
      if (!es.length) return '';
      const parts = [`Time by category: ${byCategory(es)}`];
      if (kind === 'retainer_fee' && work(es)) parts.push(`Work included: ${work(es)}`);
      return parts.join('. ');
    },
  };
}
