/** One task: play/stop, title and progress against the estimate, and actions. */
import { formatHM } from '../../lib/money';
import { fmtDate, today } from '../lib/format';
import { clientById } from '../lib/selectors';
import { isOverdueTask, taskMinutes } from '../lib/tasks';
import { useKita } from '../store/KitaProvider';
import type { Task } from '../store/types';
import { RowMenu } from './RowMenu';
import { Icon } from './ui';

export function TaskRow({ task: x, onEdit, showClient }: { task: Task; onEdit?: (id: string) => void; showClient?: boolean }) {
  const { data, startTask, stopTimer, completeTask, reopenTask, deleteTask } = useKita();
  const running = data.timer?.taskId === x.id;
  const done = x.status === 'done';
  const spent = taskMinutes(data.entries, x.id);
  const est = x.estimate || 0;
  const client = clientById(data, x.clientId);

  const lead = done ? (
    <button className="tbtn" onClick={() => reopenTask(x.id)} aria-label={`Mark ${x.title} as not done`}><Icon name="check" /></button>
  ) : running ? (
    <button className="tbtn on" onClick={() => stopTimer(true)} aria-label="Stop timer"><Icon name="stop" /></button>
  ) : (
    <button className="tbtn" onClick={() => startTask(x.id)} aria-label={`Start timer for ${x.title}`}><Icon name="play" /></button>
  );

  const meta = [
    (done || showClient) && client ? client.name : '',
    spent || est ? `${formatHM(spent)}${est ? ` of ${formatHM(est)} estimated` : ' tracked'}` : 'No time yet',
  ].filter(Boolean).join(' · ');

  return (
    <div className={`task${done ? ' done' : ''}`}>
      {lead}
      <div>
        <div className="t">
          {x.title}
          {running ? <span className="tag bad">Tracking</span> : x.status === 'doing' ? <span className="tag warn">In progress</span> : null}
          {x.recur && !done && <span className="tag">{x.recur === 'weekly' ? 'Weekly' : 'Monthly'}</span>}
        </div>
        <div className="m">
          {meta}
          {x.due && !done && <> · <span style={isOverdueTask(x, today()) ? { color: 'var(--bad)' } : undefined}>Due {fmtDate(x.due)}</span></>}
          {done && x.doneAt && ` · Done ${fmtDate(x.doneAt)}`}
          {x.notes && ` · ${x.notes}`}
        </div>
        {est > 0 && !done && <div className="bar thin"><i className={spent > est ? 'over' : ''} style={{ width: `${Math.min(100, (spent / est) * 100)}%` }} /></div>}
      </div>
      <div className="acts">
        {!done && <button className="ibtn ok" title="Mark done" aria-label={`Mark ${x.title} done`} onClick={() => completeTask(x.id)}><Icon name="check" /></button>}
        <RowMenu label={`More actions for ${x.title}`} items={[
          !done && !running && { label: 'Start timer', run: () => startTask(x.id) },
          onEdit && { label: 'Edit', run: () => onEdit(x.id) },
          done && { label: 'Mark not done', run: () => reopenTask(x.id) },
          { label: 'Delete', danger: true, run: () => deleteTask(x.id) },
        ]} />
      </div>
    </div>
  );
}
