import { useRef, useState, type FormEvent } from 'react';
import { addDays, formatHM, parseDuration, sumMinutes } from '../../lib/money';
import { TaskRow } from '../components/TaskRow';
import { TimerCard } from '../components/TimerCard';
import { CategoryOptions, ClientOptions, ConfirmButton } from '../components/ui';
import { fmtDate, parseYmd, today, uid } from '../lib/format';
import { activeClients, categoryName, clientById, entriesIn, lastUsed } from '../lib/selectors';
import { byPriority, minutesLeft } from '../lib/tasks';
import { useKita } from '../store/KitaProvider';
import type { Recur, Task, TimeEntry } from '../store/types';
import { NoClients } from './NoClients';

function TaskForm({ editing, defaultClient, onDone }: { editing: Task | null; defaultClient: string; onDone: () => void }) {
  const { data, saveTask, toast } = useKita();
  const [error, setError] = useState('');
  const title = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const raw = String(fd.get('estimate') ?? '').trim();
    const est = raw ? parseDuration(raw) : { ok: true as const, minutes: 0 };
    if (!est.ok) { setError(est.error.replace('Enter the time', 'Enter the estimate')); return; }
    setError('');
    const task: Task = {
      ...(editing ?? { id: uid(), status: 'todo', doneAt: null, createdAt: Date.now() }),
      title: String(fd.get('title')).trim(), clientId: String(fd.get('clientId')), categoryId: String(fd.get('categoryId') ?? ''),
      estimate: est.minutes, due: String(fd.get('due') ?? '') || null, recur: String(fd.get('recur') ?? '') as Recur,
      notes: String(fd.get('notes') ?? '').trim(),
    };
    await saveTask(task);
    toast(editing ? 'Task updated' : 'Task added');
    if (editing) onDone();
    else { form.reset(); title.current?.focus(); }
  };

  return (
    <form className="panel stack" id="tform" style={{ marginTop: 14 }} onSubmit={onSubmit} key={editing?.id ?? 'new'}>
      <div className="grid">
        <label className="f"><span>Task</span><input ref={title} name="title" required defaultValue={editing?.title} placeholder="e.g. Friday LinkedIn batch" autoFocus /></label>
        <label className="f"><span>Client</span><select name="clientId" defaultValue={editing?.clientId ?? defaultClient}><ClientOptions /></select></label>
        <label className="f"><span>Category</span><select name="categoryId" defaultValue={editing?.categoryId ?? ''}><CategoryOptions /></select></label>
      </div>
      <div className="grid">
        <label className="f">
          <span>Estimate (optional)</span>
          <input name="estimate" placeholder="e.g. 2h or 1:30" defaultValue={editing?.estimate ? formatHM(editing.estimate) : ''} aria-invalid={!!error} />
          {error && <small style={{ color: 'var(--bad)' }}>{error}</small>}
        </label>
        <label className="f"><span>Due (optional)</span><input type="date" name="due" defaultValue={editing?.due ?? ''} /></label>
        <label className="f"><span>Repeats</span>
          <select name="recur" defaultValue={editing?.recur ?? ''}>
            <option value="">Doesn’t repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
          </select>
        </label>
      </div>
      <label className="f"><span>Notes (optional)</span><input name="notes" defaultValue={editing?.notes} /></label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn link" onClick={onDone}>{editing ? 'Cancel' : 'Close'}</button>
        <button className="btn primary">{editing ? 'Save task' : 'Add task'}</button>
      </div>
    </form>
  );
}

function TasksSection() {
  const { data, addSuggestedCategories } = useKita();
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<'new' | string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const mine = (t: Task) => !filter || t.clientId === filter;
  const open = data.tasks.filter(t => t.status !== 'done' && mine(t)).sort(byPriority);
  const done = data.tasks.filter(t => t.status === 'done' && mine(t)).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const editing = form && form !== 'new' ? data.tasks.find(t => t.id === form) ?? null : null;
  const edit = (id: string) => {
    setForm(id);
    setTimeout(() => document.getElementById('tform')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  // Open tasks grouped by client, then by category.
  const byClient = new Map<string, Task[]>();
  for (const t of open) byClient.set(t.clientId, [...(byClient.get(t.clientId) ?? []), t]);

  return (
    <section id="tasks">
      <div className="head">
        <h2>Tasks</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="Filter by client">
            <option value="">All clients</option>
            {activeClients(data).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!form && <button className="btn primary sm" onClick={() => setForm('new')}>Add task</button>}
        </div>
      </div>
      {!data.categories.length && (
        <p className="small muted">
          Tip: set up work categories such as Social media and Email marketing to group your tasks and time.{' '}
          <button className="btn link" style={{ padding: 0, color: 'var(--accent)' }} onClick={addSuggestedCategories}>Add suggested categories</button>
        </p>
      )}
      {form && <TaskForm editing={editing} defaultClient={filter || lastUsed(data).clientId} onDone={() => setForm(null)} />}
      {[...byClient].map(([cid, list]) => {
        const c = clientById(data, cid);
        const left = list.reduce((t, x) => t + minutesLeft(x, data.entries), 0);
        const byCat = new Map<string, Task[]>();
        for (const t of list) byCat.set(t.categoryId, [...(byCat.get(t.categoryId) ?? []), t]);
        return (
          <div className="tgroup" key={cid}>
            <div className="tg-h">
              <span className="dot" style={{ background: c?.color ?? '#999' }} /><b>{c?.name ?? 'Deleted client'}</b>
              <span className="muted small">{list.length} open{left ? ` · about ${formatHM(left)} left` : ''}</span>
            </div>
            {[...byCat].map(([k, xs]) => (
              <div key={k}>
                <div className="tcat">{categoryName(data, k, 'No category')}</div>
                {xs.map(x => <TaskRow key={x.id} task={x} onEdit={edit} />)}
              </div>
            ))}
          </div>
        );
      })}
      {!open.length && !form && <div className="empty" style={{ marginTop: 12 }}>No open tasks. Add tasks for each client, then press play to start tracking.</div>}
      {done.length > 0 && (
        <>
          <p style={{ marginTop: 14 }}><button className="btn link" onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide' : 'Show'} completed ({done.length})</button></p>
          {showDone && done.slice(0, 25).map(x => <TaskRow key={x.id} task={x} onEdit={edit} />)}
        </>
      )}
    </section>
  );
}

function EntryForm({ editing, onDone }: { editing: TimeEntry | null; onDone: () => void }) {
  const { data, saveEntry, toast } = useKita();
  const [error, setError] = useState('');
  const invoice = editing?.invoiceId ? data.invoices.find(i => i.id === editing.invoiceId) : null;
  const last = lastUsed(data);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const dur = parseDuration(String(fd.get('dur')));
    if (!dur.ok) {
      setError(dur.error);
      (form.elements.namedItem('dur') as HTMLInputElement).focus();
      return;
    }
    setError('');
    const entry: TimeEntry = {
      ...(editing ?? { id: uid(), createdAt: Date.now(), invoiceId: null, taskId: '' }),
      date: String(fd.get('date')), clientId: String(fd.get('clientId')), categoryId: String(fd.get('categoryId') ?? ''),
      task: String(fd.get('task') ?? '').trim(), note: String(fd.get('note') ?? '').trim(),
      minutes: dur.minutes, billable: fd.get('billable') === 'on',
    };
    await saveEntry(entry);
    toast(editing ? 'Entry updated' : `Added ${formatHM(dur.minutes)}`);
    if (!editing) form.reset();
    onDone();
  };

  return (
    <form className="stack" onSubmit={onSubmit} key={editing?.id ?? 'new'}>
      {invoice && <div className="callout">This time is on invoice {invoice.number}. Changing it here won’t change the invoice.</div>}
      <div className="grid">
        <label className="f"><span>Date</span><input type="date" name="date" defaultValue={editing?.date ?? today()} required /></label>
        <label className="f"><span>Client</span><select name="clientId" defaultValue={editing?.clientId ?? last.clientId}><ClientOptions /></select></label>
        <label className="f"><span>Category</span><select name="categoryId" defaultValue={editing?.categoryId ?? ''}><CategoryOptions /></select></label>
        <label className="f">
          <span>Time spent</span>
          <input name="dur" placeholder="1:30, 1.5 or 90m" defaultValue={editing ? formatHM(editing.minutes) : ''} required
            aria-invalid={!!error} aria-describedby={error ? 'dur-error' : undefined} />
          {error && <small id="dur-error" style={{ color: 'var(--bad)' }}>{error}</small>}
        </label>
      </div>
      <div className="grid">
        <label className="f"><span>Task</span><input name="task" defaultValue={editing?.task ?? ''} placeholder="e.g. Campaign report" /></label>
        <label className="f"><span>Note (optional)</span><input name="note" defaultValue={editing?.note ?? ''} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <label className="check"><input type="checkbox" name="billable" defaultChecked={editing ? editing.billable : true} /> Billable</label>
        <div className="row">
          {editing ? (
            <><button type="button" className="btn link" onClick={onDone}>Cancel</button><button className="btn primary">Save changes</button></>
          ) : <button className="btn primary">Add time</button>}
        </div>
      </div>
    </form>
  );
}

export function Track() {
  const { data, deleteEntry, toast } = useKita();
  const [week, setWeek] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  if (!activeClients(data).length) {
    return <section><h1>Track time</h1><p className="sub" style={{ margin: '6px 0 20px' }}>Start a timer or add time after the fact.</p><NoClients /></section>;
  }

  const editing = editId ? data.entries.find(e => e.id === editId) ?? null : null;

  // Monday of the week being shown.
  const t = today();
  const monday = addDays(t, -((parseYmd(t).getDay() + 6) % 7) + week * 7);
  const days = [...Array(7)].map((_, i) => addDays(monday, i));
  const weekEntries = entriesIn(data, days[0]!, days[6]!);
  const label = week === 0 ? 'This week' : week === -1 ? 'Last week' : `Week of ${fmtDate(days[0])}`;

  return (
    <>
      <TimerCard />
      <TasksSection />
      <section id="manual">
        <details className="fold" open={manualOpen || !!editing} onToggle={e => setManualOpen((e.target as HTMLDetailsElement).open)}>
          <summary><h2>{editing ? 'Edit time entry' : 'Add time manually'}</h2></summary>
          <div className="panel" style={{ marginTop: 14 }}><EntryForm editing={editing} onDone={() => setEditId(null)} /></div>
        </details>
      </section>
      <section>
        <div className="head">
          <h2>{label} <span className="sub">{formatHM(sumMinutes(weekEntries))} tracked</span></h2>
          <div className="row">
            <button className="btn sm" onClick={() => setWeek(w => w - 1)}>Previous</button>
            <button className="btn sm" onClick={() => setWeek(w => Math.min(0, w + 1))} disabled={week >= 0}>Next</button>
          </div>
        </div>
        {weekEntries.length ? [...days].reverse().map(d => {
          const es = weekEntries.filter(e => e.date === d).sort((a, b) => b.createdAt - a.createdAt);
          if (!es.length) return null;
          return (
            <div className="day" key={d}>
              <div className="day-h">
                <span>{parseYmd(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                <span>{formatHM(sumMinutes(es))}</span>
              </div>
              {es.map(e => {
                const c = clientById(data, e.clientId);
                return (
                  <div className="entry" key={e.id}>
                    <span className="dot" style={{ background: c?.color ?? '#999' }} />
                    <div>
                      <div className="t">{e.task || 'Untitled task'}</div>
                      <div className="m">
                        {c?.name ?? 'Deleted client'}{e.categoryId ? ` · ${categoryName(data, e.categoryId)}` : ''}{e.note ? ` · ${e.note}` : ''}{' '}
                        {!e.billable && <span className="tag">Not billable</span>}{' '}
                        {e.invoiceId && <span className="tag good">Invoiced</span>}
                      </div>
                    </div>
                    <div className="dur">{formatHM(e.minutes)}</div>
                    <div className="acts">
                      <button className="btn link" onClick={() => { setEditId(e.id); setTimeout(() => document.getElementById('manual')?.scrollIntoView({ behavior: 'smooth' })); }}>Edit</button>
                      <ConfirmButton onConfirm={async () => {
                        await deleteEntry(e.id);
                        if (editId === e.id) setEditId(null);
                        toast(e.invoiceId ? 'Entry deleted. The invoice it was on hasn’t changed.' : 'Entry deleted');
                      }}>Delete</ConfirmButton>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }) : <div className="empty">No time tracked this week yet.</div>}
      </section>
    </>
  );
}
