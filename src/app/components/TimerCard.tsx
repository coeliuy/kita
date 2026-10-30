/** The timer: a start form when idle; the running clock, with progress against the task's estimate, when tracking. */
import type { CSSProperties, FormEvent } from 'react';
import { formatHM } from '../../lib/money';
import { clockText } from '../lib/format';
import { activeClients, categoryName, clientById, lastUsed } from '../lib/selectors';
import { taskMinutes } from '../lib/tasks';
import { useKita } from '../store/KitaProvider';
import { CategoryOptions, ClientOptions, ConfirmButton, Icon, useNow } from './ui';

const RING = 2 * Math.PI * 52;

/** A ring filling up as time is spent against an estimate; amber near it, red over it. */
function EstimateRing({ spent, estimate }: { spent: number; estimate: number }) {
  const f = spent / estimate;
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" className="ring-bg" />
      <circle cx="60" cy="60" r="52" className={`ring-fg${f > 1 ? ' over' : f >= 0.8 ? ' near' : ''}`}
        strokeDasharray={RING} strokeDashoffset={RING * (1 - Math.min(f, 1))} />
      <text x="60" y="68" textAnchor="middle" className="ring-t">{Math.round(f * 100)}%</text>
    </svg>
  );
}

export function TimerCard() {
  const { data, startTimer, stopTimer, toast } = useKita();
  const t = data.timer;
  const now = useNow(!!t);
  if (!activeClients(data).length) return null;

  if (t) {
    const c = clientById(data, t.clientId);
    const task = t.taskId ? data.tasks.find(x => x.id === t.taskId) : undefined;
    const elapsedMin = (now - t.startedAt) / 60000;
    const spent = task ? taskMinutes(data.entries, task.id) + elapsedMin : 0;
    const est = task?.estimate || 0;
    return (
      <section className="timer-card running" style={{ '--cc': c?.color ?? '#999' } as CSSProperties}>
        <div className="tc-row">
          {est > 0 && <EstimateRing spent={spent} estimate={est} />}
          <div>
            <div className="tc-label"><span className="live" />Tracking {c?.name ?? ''}{t.categoryId ? ` · ${categoryName(data, t.categoryId)}` : ''}</div>
            <div className="clock">{clockText(now - t.startedAt)}</div>
            <p className="tc-task">{t.task || 'No description'}</p>
            {est > 0 && (
              <p className="small muted">
                {spent <= est ? `${formatHM(spent)} of ${formatHM(est)} estimated` : `${formatHM(spent - est)} over the ${formatHM(est)} estimate`}
              </p>
            )}
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn stop" onClick={() => stopTimer(true)}><Icon name="stop" />Stop and save</button>
          <ConfirmButton className="btn link" onConfirm={async () => { await stopTimer(false); toast('Timer discarded'); }}>Discard</ConfirmButton>
        </div>
      </section>
    );
  }

  const last = lastUsed(data);
  const onStart = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTimer({ clientId: String(fd.get('clientId')), categoryId: String(fd.get('categoryId') ?? ''), task: String(fd.get('task') ?? '') });
  };
  return (
    <section className="timer-card">
      <div className="head"><h2>Start tracking</h2></div>
      <form className="row" onSubmit={onStart}>
        <label className="f"><span>Client</span><select name="clientId" defaultValue={last.clientId}><ClientOptions /></select></label>
        <label className="f"><span>Category</span><select name="categoryId" defaultValue={last.categoryId}><CategoryOptions /></select></label>
        <label className="f grow"><span>What are you working on?</span><input name="task" placeholder="e.g. LinkedIn posts" autoComplete="off" /></label>
        <button className="btn primary"><Icon name="play" />Start</button>
      </form>
      {data.tasks.some(x => x.status !== 'done') && <p className="small muted" style={{ marginTop: 10 }}>Or press play on one of your tasks.</p>}
    </section>
  );
}
