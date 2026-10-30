import { useState, type FormEvent } from 'react';
import { addDays, formatHM, parseDuration, sumMinutes } from '../../lib/money';
import { ClientOptions, ConfirmButton, useNow } from '../components/ui';
import { clockText, fmtDate, parseYmd, today, uid } from '../lib/format';
import { activeClients, clientById, entriesIn } from '../lib/selectors';
import { useKita } from '../store/KitaProvider';
import type { TimeEntry } from '../store/types';
import { NoClients } from './NoClients';

function TimerBlock({ defaultClient }: { defaultClient?: string }) {
  const { data, startTimer, stopTimer, toast } = useKita();
  const t = data.timer;
  const now = useNow(!!t);
  if (t) {
    return (
      <section>
        <div className="clock">{clockText(now - t.startedAt)}</div>
        <p className="running-note">Tracking <b>{clientById(data, t.clientId)?.name ?? ''}</b>{t.task ? `: ${t.task}` : ''}</p>
        <button className="btn stop" onClick={async () => {
          const m = await stopTimer(true);
          toast(m ? `Saved ${formatHM(m)}` : 'Less than a minute, so nothing was saved.');
        }}>Stop and save</button>{' '}
        <ConfirmButton className="btn link" onConfirm={async () => { await stopTimer(false); toast('Timer discarded'); }}>Discard</ConfirmButton>
      </section>
    );
  }
  const onStart = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTimer(String(fd.get('clientId')), String(fd.get('task') ?? ''));
  };
  return (
    <section>
      <div className="clock idle">0:00:00</div>
      <form className="row" onSubmit={onStart}>
        <label className="f"><span>Client</span><select name="clientId" defaultValue={defaultClient}><ClientOptions /></select></label>
        <label className="f grow"><span>What are you working on?</span><input name="task" placeholder="e.g. LinkedIn posts" autoComplete="off" /></label>
        <button className="btn primary">Start timer</button>
      </form>
    </section>
  );
}

function EntryForm({ editing, defaultClient, onDone }: { editing: TimeEntry | null; defaultClient?: string; onDone: () => void }) {
  const { data, saveEntry, toast } = useKita();
  const [error, setError] = useState('');
  const invoice = editing?.invoiceId ? data.invoices.find(i => i.id === editing.invoiceId) : null;

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
      ...(editing ?? { id: uid(), createdAt: Date.now(), invoiceId: null }),
      date: String(fd.get('date')), clientId: String(fd.get('clientId')),
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
        <label className="f"><span>Client</span><select name="clientId" defaultValue={editing?.clientId ?? defaultClient}><ClientOptions /></select></label>
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

  if (!activeClients(data).length) {
    return <section><h1>Track time</h1><p className="sub" style={{ margin: '6px 0 20px' }}>Start a timer or add time after the fact.</p><NoClients /></section>;
  }

  const last = [...data.entries].sort((a, b) => b.createdAt - a.createdAt)[0];
  const defaultClient = last && !clientById(data, last.clientId)?.archived ? last.clientId : undefined;
  const editing = editId ? data.entries.find(e => e.id === editId) ?? null : null;

  // Monday of the week being shown.
  const t = today();
  const monday = addDays(t, -((parseYmd(t).getDay() + 6) % 7) + week * 7);
  const days = [...Array(7)].map((_, i) => addDays(monday, i));
  const weekEntries = entriesIn(data, days[0]!, days[6]!);
  const label = week === 0 ? 'This week' : week === -1 ? 'Last week' : `Week of ${fmtDate(days[0])}`;

  return (
    <>
      <TimerBlock defaultClient={defaultClient} />
      <section id="manual">
        <div className="head"><h2>{editing ? 'Edit time entry' : 'Add time manually'}</h2></div>
        <div className="panel"><EntryForm editing={editing} defaultClient={defaultClient} onDone={() => setEditId(null)} /></div>
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
                        {c?.name ?? 'Deleted client'}{e.note ? ` · ${e.note}` : ''}{' '}
                        {!e.billable && <span className="tag">Not billable</span>}{' '}
                        {e.invoiceId && <span className="tag good">Invoiced</span>}
                      </div>
                    </div>
                    <div className="dur">{formatHM(e.minutes)}</div>
                    <div className="acts">
                      <button className="btn link" onClick={() => { setEditId(e.id); document.getElementById('manual')?.scrollIntoView({ behavior: 'smooth' }); }}>Edit</button>
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

