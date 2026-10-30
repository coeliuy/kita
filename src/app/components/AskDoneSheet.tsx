/** After stopping a task's timer: "Is it finished?", with an optional note on the time. */
import { useEffect, useState } from 'react';
import { formatHM } from '../../lib/money';
import { useKita } from '../store/KitaProvider';

export function AskDoneSheet() {
  const { data, askDone, answerAskDone } = useKita();
  const [note, setNote] = useState('');
  const task = askDone ? data.tasks.find(t => t.id === askDone.taskId) : undefined;

  // Move messages out of the panel's way while it's open.
  useEffect(() => {
    document.body.classList.toggle('sheet-open', !!task);
    setNote('');
    return () => document.body.classList.remove('sheet-open');
  }, [task]);

  if (!askDone || !task) return null;
  return (
    <div id="sheet" role="dialog" aria-label="Task check-in">
      <p style={{ marginBottom: 12 }}>Saved {formatHM(askDone.minutes)} on <b>{task.title}</b>. Is it finished?</p>
      <label className="f">
        <span>Add a note about this time (optional)</span>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Drafted 5 posts, sent for approval" autoFocus />
      </label>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn" onClick={() => answerAskDone(false, note)}>Not yet</button>
        <button className="btn primary" onClick={() => answerAskDone(true, note)}>Mark as done</button>
      </div>
    </div>
  );
}
