/** Task rules: what's due, what's next, and when a repeating task comes round again. */
import { addDays, monthEnd, shiftMonth, type ISODate } from '../../lib/money';
import type { Task, TimeEntry } from '../store/types';

/** Minutes tracked against a task. */
export const taskMinutes = (entries: TimeEntry[], taskId: string) =>
  entries.reduce((t, e) => (e.taskId === taskId ? t + e.minutes : t), 0);

/** Minutes of an estimate still to do (0 if there's no estimate or it's used up). */
export const minutesLeft = (task: Task, entries: TimeEntry[]) =>
  Math.max(0, (task.estimate || 0) - taskMinutes(entries, task.id));

/** One month later, staying in the month: 31 January → 28 February, not 3 March. */
function addMonth(date: ISODate, originalDay: number): ISODate {
  const month = shiftMonth(date.slice(0, 7), 1);
  const last = +monthEnd(month).slice(8);
  return `${month}-${String(Math.min(originalDay, last)).padStart(2, '0')}`;
}

/**
 * When a repeating task is next due, after finishing it. Steps forward a week
 * or a month from its due date (or today, if it had none) until it reaches today.
 * Monthly tasks keep their day of the month where it exists; in a shorter
 * month they fall on its last day (and stay on that day from then on).
 */
export function nextDue(task: Pick<Task, 'recur' | 'due'>, today: ISODate): ISODate | null {
  if (!task.recur) return null;
  const start = task.due || today;
  const day = +start.slice(8);
  const step = (d: ISODate) => (task.recur === 'weekly' ? addDays(d, 7) : addMonth(d, day));
  let next = step(start);
  while (next < today) next = step(next);
  return next;
}

/** In progress first, then by due date, then oldest first. Tasks with no due date go last. */
export const byPriority = (a: Task, b: Task) =>
  Number(b.status === 'doing') - Number(a.status === 'doing') ||
  (a.due || '9999').localeCompare(b.due || '9999') ||
  a.createdAt - b.createdAt;

/** Tasks for the Today screen: in progress, or due today or earlier. */
export const tasksForToday = (tasks: Task[], today: ISODate) =>
  tasks.filter(t => t.status !== 'done' && (t.status === 'doing' || (!!t.due && t.due <= today))).sort(byPriority);

/**
 * "Coming up": to-do tasks due later this week. If there's nothing for today
 * or this week, the next three to-do tasks so the list is never empty.
 */
export function comingUp(tasks: Task[], today: ISODate, weekEnd: ISODate): Task[] {
  const later = tasks
    .filter(t => t.status === 'todo' && !!t.due && t.due > today && t.due <= weekEnd)
    .sort(byPriority)
    .slice(0, 5);
  if (later.length || tasksForToday(tasks, today).length) return later;
  return tasks.filter(t => t.status === 'todo').sort(byPriority).slice(0, 3);
}

export const isOverdueTask = (t: Task, today: ISODate) => t.status !== 'done' && !!t.due && t.due < today;

export const SUGGESTED_CATEGORIES = [
  'Social media', 'Email marketing', 'Content writing', 'Paid ads', 'Strategy and calls', 'Admin and reporting',
];
