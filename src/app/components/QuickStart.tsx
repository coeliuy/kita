/** Quick start (⌘K or /): search tasks and actions, and start a timer from the keyboard. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryName, clientById, lastUsed } from '../lib/selectors';
import { byPriority } from '../lib/tasks';
import { useRouter, VIEWS, type View } from '../router';
import { useKita } from '../store/KitaProvider';
import { useInvoiceDraft } from '../views/invoiceDraft';
import { requestIntent } from './intents';
import { Icon } from './ui';

interface Item { label: string; sub: string; icon: string; run: () => void }

const VIEW_NAMES: Record<View, string> = {
  today: 'Today', track: 'Track', overview: 'Overview', clients: 'Clients', invoices: 'Invoices',
  expenses: 'Expenses', money: 'Money', settings: 'Settings', more: 'More',
};

export function QuickStart({ onClose }: { onClose: () => void }) {
  const { data, stopTimer, startTask, startTimer } = useKita();
  const { go } = useRouter();
  const startInvoice = useInvoiceDraft();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const all: Item[] = [];
    const t = data.timer;
    if (t) all.push({ label: 'Stop the timer', sub: `Tracking ${clientById(data, t.clientId)?.name ?? ''}`, icon: 'stop', run: () => stopTimer(true) });
    for (const x of data.tasks.filter(x => x.status !== 'done').sort(byPriority)) {
      const c = clientById(data, x.clientId);
      all.push({ label: x.title, sub: `Start task · ${c?.name ?? ''}${x.categoryId ? ` · ${categoryName(data, x.categoryId)}` : ''}`, icon: 'play', run: () => startTask(x.id) });
    }
    // Recent work not linked to a task, to start again
    const seen = new Set<string>();
    for (const e of [...data.entries].sort((a, b) => b.createdAt - a.createdAt)) {
      const c = clientById(data, e.clientId);
      if (!e.task || e.taskId || !c || c.archived || seen.size >= 10) continue;
      const k = `${e.clientId}|${e.task.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ label: e.task, sub: `Start again · ${c.name}`, icon: 'track', run: () => startTimer({ clientId: e.clientId, categoryId: e.categoryId, task: e.task }) });
    }
    all.push(
      { label: 'New task', sub: 'Action', icon: 'tasks', run: () => { go('track'); requestIntent('newTask'); } },
      { label: 'New invoice', sub: 'Action', icon: 'invoices', run: () => startInvoice(null) },
      { label: 'Add an expense', sub: 'Action', icon: 'expenses', run: () => go('expenses') },
      { label: 'Add time manually', sub: 'Action', icon: 'track', run: () => { go('track'); requestIntent('manualEntry'); } },
    );
    for (const v of VIEWS.filter(v => v !== 'more')) all.push({ label: `Go to ${VIEW_NAMES[v]}`, sub: 'Navigate', icon: v, run: () => go(v) });

    const query = q.trim().toLowerCase();
    if (!query) return all.slice(0, 8);
    const words = query.split(/\s+/);
    const found = all.filter(it => words.every(w => `${it.label} ${it.sub}`.toLowerCase().includes(w)));
    const last = lastUsed(data);
    if (last.clientId) {
      found.push({ label: `Start “${q.trim()}”`, sub: `New timer · ${clientById(data, last.clientId)?.name ?? ''}`, icon: 'play', run: () => startTimer({ clientId: last.clientId, categoryId: '', task: q.trim() }) });
    }
    return found.slice(0, 8);
  }, [data, q, go, startInvoice, startTask, startTimer, stopTimer]);

  const choose = (i: number) => {
    const it = items[i];
    onClose();
    it?.run();
  };

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  return (
    <div id="palette" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pal-box" role="dialog" aria-label="Quick start">
        <input
          autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Start a task, or type to search…" autoComplete="off"
          aria-label="Search tasks and actions" aria-controls="palList" aria-activedescendant={`pal-${sel}`}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
          }}
        />
        <div id="palList" role="listbox" ref={listRef}>
          {items.length ? items.map((it, i) => (
            <button key={`${it.label}|${it.sub}`} id={`pal-${i}`} className={`pal-it${i === sel ? ' on' : ''}`} role="option" aria-selected={i === sel}
              onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
              <Icon name={it.icon} /><span><b>{it.label}</b><small>{it.sub}</small></span>
            </button>
          )) : <p className="muted small" style={{ padding: 12 }}>Nothing matches.</p>}
        </div>
        <div className="pal-foot small muted">↑ ↓ to move · Enter to choose · Esc to close</div>
      </div>
    </div>
  );
}
