import type { Task, TimeEntry } from '../store/types';
import { comingUp, isOverdueTask, minutesLeft, nextDue, taskMinutes, tasksForToday } from './tasks';

let n = 0;
const task = (extra: Partial<Task> = {}): Task => ({
  id: `t${++n}`, clientId: 'c', categoryId: '', title: `Task ${n}`, estimate: 0, due: null, recur: '', notes: '',
  status: 'todo', doneAt: null, createdAt: n, ...extra,
});
const entry = (taskId: string, minutes: number) => ({ taskId, minutes } as TimeEntry);

describe('nextDue', () => {
  it('steps a weekly task on by a week', () => {
    expect(nextDue({ recur: 'weekly', due: '2026-10-30' }, '2026-10-30')).toBe('2026-11-06');
  });

  it('catches up to today if the task was finished late', () => {
    expect(nextDue({ recur: 'weekly', due: '2026-10-02' }, '2026-10-30')).toBe('2026-10-30');
    expect(nextDue({ recur: 'monthly', due: '2026-07-15' }, '2026-10-30')).toBe('2026-11-15');
  });

  it('keeps monthly tasks inside the month', () => {
    // Plain date maths would turn 31 January + 1 month into 3 March.
    expect(nextDue({ recur: 'monthly', due: '2027-01-31' }, '2027-01-31')).toBe('2027-02-28');
    expect(nextDue({ recur: 'monthly', due: '2026-10-31' }, '2026-10-31')).toBe('2026-11-30');
    expect(nextDue({ recur: 'monthly', due: '2026-12-15' }, '2026-12-15')).toBe('2027-01-15');
  });

  it('starts from today when a repeating task has no due date', () => {
    expect(nextDue({ recur: 'weekly', due: null }, '2026-10-30')).toBe('2026-11-06');
  });

  it('returns nothing for tasks that do not repeat', () => {
    expect(nextDue({ recur: '', due: '2026-10-30' }, '2026-10-30')).toBeNull();
  });
});

describe('time against tasks', () => {
  it('adds up time and what is left of the estimate', () => {
    const t = task({ estimate: 120 });
    const es = [entry(t.id, 45), entry(t.id, 30), entry('other', 60)];
    expect(taskMinutes(es, t.id)).toBe(75);
    expect(minutesLeft(t, es)).toBe(45);
    expect(minutesLeft({ ...t, estimate: 60 }, es)).toBe(0);
  });
});

describe('what to show on Today', () => {
  const today = '2026-10-30';
  const doing = task({ status: 'doing' });
  const late = task({ due: '2026-10-28' });
  const dueToday = task({ due: today });
  const friday = task({ due: '2026-11-01' });
  const nextWeek = task({ due: '2026-11-10' });
  const noDate = task();
  const done = task({ status: 'done', due: '2026-10-29' });
  const all = [noDate, friday, nextWeek, dueToday, done, late, doing];

  it('lists tasks in progress, then late and due today', () => {
    expect(tasksForToday(all, today).map(t => t.id)).toEqual([doing.id, late.id, dueToday.id]);
  });

  it('lists the rest of the week as coming up', () => {
    expect(comingUp(all, today, '2026-11-01').map(t => t.id)).toEqual([friday.id]);
  });

  it('suggests the next tasks when nothing is due', () => {
    expect(comingUp([noDate, nextWeek, done], today, '2026-11-01').map(t => t.id)).toEqual([nextWeek.id, noDate.id]);
  });

  it('marks unfinished tasks past their due date as overdue', () => {
    expect(isOverdueTask(late, today)).toBe(true);
    expect(isOverdueTask(dueToday, today)).toBe(false);
    expect(isOverdueTask(done, today)).toBe(false);
  });
});
