import { useState, type FormEvent } from 'react';
import { monthEnd, monthLabel, monthOf, monthStart, type BillingType } from '../../lib/money';
import { COLORS } from '../lib/demo';
import { gbp, gbp0, thisMonth, uid } from '../lib/format';
import { useKita } from '../store/KitaProvider';
import type { Client } from '../store/types';

function terms(c: Client) {
  if (c.billing === 'hourly') return `${gbp(c.rate)} per hour`;
  if (c.billing === 'retainer') {
    const from = c.startDate ? ` from ${monthLabel(monthOf(c.startDate))}` : '';
    return `${gbp0(c.fee)} a month for ${c.included || 0} h${c.rate ? `, extra hours ${gbp(c.rate)}` : ''}${from}`;
  }
  return `Fixed fee ${gbp0(c.fee)}`;
}

function ClientForm({ client, onDone }: { client: Client | null; onDone: () => void }) {
  const { data, saveClient, deleteClient, toast } = useKita();
  const [billing, setBilling] = useState<BillingType>(client?.billing ?? 'hourly');
  const color = client?.color ?? COLORS[data.clients.length % COLORS.length]!;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) === '' || fd.get(k) == null ? 0 : +fd.get(k)!);
    const str = (k: string) => String(fd.get(k) ?? '').trim();
    const startMonth = str('startMonth');
    const endMonth = str('endMonth');
    const c: Client = {
      ...(client ?? { id: uid(), createdAt: Date.now() }),
      name: str('name'), billing, color: str('color'), weekly: num('weekly'), rate: num('rate'), fee: num('fee'), included: num('included'),
      email: str('email'), address: str('address'), archived: fd.get('archived') === 'on',
      startDate: billing === 'retainer' && startMonth ? monthStart(startMonth) : client?.startDate ?? null,
      endDate: billing === 'retainer' && endMonth ? monthEnd(endMonth) : null,
    };
    await saveClient(c);
    toast(client ? 'Client updated' : `Added ${c.name}`);
    onDone();
  };

  return (
    <section id="cform">
      <div className="head"><h2>{client ? `Edit ${client.name}` : 'New client'}</h2></div>
      <form className="panel stack" onSubmit={onSubmit}>
        <div className="grid">
          <label className="f"><span>Client name</span><input name="name" defaultValue={client?.name} required /></label>
          <label className="f"><span>How you bill them</span>
            <select value={billing} onChange={e => setBilling(e.target.value as BillingType)}>
              <option value="hourly">Hourly</option>
              <option value="retainer">Monthly retainer</option>
              <option value="fixed">Fixed project fee</option>
            </select>
          </label>
          <label className="f"><span>Colour</span><input type="color" name="color" defaultValue={color} /></label>
        </div>
        <div className="grid">
          {billing !== 'fixed' && (
            <label className="f"><span>{billing === 'retainer' ? 'Rate for extra hours (£)' : 'Hourly rate (£)'}</span>
              <input type="number" step="0.01" min="0" name="rate" defaultValue={client?.rate || ''} /></label>
          )}
          {billing !== 'hourly' && (
            <label className="f"><span>{billing === 'retainer' ? 'Monthly fee (£)' : 'Project fee (£)'}</span>
              <input type="number" step="0.01" min="0" name="fee" defaultValue={client?.fee || ''} /></label>
          )}
          {billing === 'retainer' && (
            <label className="f"><span>Hours included each month</span>
              <input type="number" step="0.5" min="0" name="included" defaultValue={client?.included || ''} /></label>
          )}
        </div>
        <div className="grid">
          <label className="f"><span>Expected hours a week (optional)</span>
            <input type="number" step="0.5" min="0" name="weekly" defaultValue={client?.weekly || ''} placeholder="Uses your recent average" /></label>
        </div>
        {billing === 'retainer' && (
          <div className="grid">
            <label className="f"><span>Retainer starts</span>
              <input type="month" name="startMonth" defaultValue={client?.startDate ? monthOf(client.startDate) : thisMonth()} required /></label>
            <label className="f"><span>Retainer ends (optional)</span>
              <input type="month" name="endMonth" defaultValue={client?.endDate ? monthOf(client.endDate) : ''} /></label>
          </div>
        )}
        <div className="grid">
          <label className="f"><span>Billing email</span><input type="email" name="email" defaultValue={client?.email} /></label>
          <label className="f"><span>Billing address</span><textarea name="address" defaultValue={client?.address} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{client && <label className="check"><input type="checkbox" name="archived" defaultChecked={client.archived} /> Archived (hidden from timers)</label>}</div>
          <div className="row">
            {client && <button type="button" className="btn link danger" onClick={async () => { onDone(); await deleteClient(client.id); }}>Delete</button>}
            <button type="button" className="btn link" onClick={onDone}>Cancel</button>
            <button className="btn primary">{client ? 'Save changes' : 'Add client'}</button>
          </div>
        </div>
      </form>
    </section>
  );
}

export function Clients() {
  const { data, loadDemo, toast } = useKita();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const open = (id: string | 'new') => {
    setEditing(id);
    setTimeout(() => document.getElementById('cform')?.scrollIntoView({ behavior: 'smooth' }));
  };
  const list = [...data.clients].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name));
  const editClient = editing && editing !== 'new' ? data.clients.find(c => c.id === editing) ?? null : null;

  return (
    <>
      <section>
        <div className="head"><h1>Clients</h1>{!editing && <button className="btn primary" onClick={() => open('new')}>Add client</button>}</div>
        {list.length ? list.map(c => (
          <div className="entry" key={c.id}>
            <span className="dot" style={{ background: c.color }} />
            <div><div className="t">{c.name} {c.archived && <span className="tag">Archived</span>}</div><div className="m">{terms(c)}</div></div>
            <div />
            <div className="acts"><button className="btn link" onClick={() => open(c.id)}>Edit</button></div>
          </div>
        )) : !editing && (
          <div className="empty">
            No clients yet. Add one with their rate or retainer, and Kita does the maths from there.<br />
            <button className="btn primary" onClick={() => open('new')}>Add client</button>{' '}
            <button className="btn" onClick={async () => { await loadDemo(); toast('Demo data added. Remove it any time in Settings.'); }}>Try it with demo data</button>
          </div>
        )}
      </section>
      {editing && <ClientForm key={editing} client={editClient} onDone={() => setEditing(null)} />}
    </>
  );
}
