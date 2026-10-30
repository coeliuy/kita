import { useRef, useState, type FormEvent } from 'react';
import { ratesForTaxYear, taxYearLabel, taxYearOf, type PaymentTerms } from '../../lib/money';
import { ConfirmButton, NumberField, TaxYearSelect } from '../components/ui';
import { download, entriesCsv } from '../lib/files';
import { today, uid } from '../lib/format';
import { importBackup, ImportError } from '../lib/importBackup';
import { ratesFor, sortedCategories, yearSettings } from '../lib/selectors';
import { SUGGESTED_CATEGORIES } from '../lib/tasks';
import { useKita } from '../store/KitaProvider';
import type { RateOverrides, Settings as SettingsT, Theme } from '../store/types';

const RATE_FIELDS: [keyof RateOverrides, string, number][][] = [
  [['personalAllowance', 'Personal Allowance (£)', 1], ['basicRateBand', 'Basic rate band (£)', 1], ['additionalRateThreshold', 'Additional rate starts (£)', 1], ['allowanceTaperThreshold', 'Allowance tapers above (£)', 1]],
  [['basicRate', 'Basic rate (%)', 0.1], ['higherRate', 'Higher rate (%)', 0.1], ['additionalRate', 'Additional rate (%)', 0.1]],
  [['class4LowerProfitsLimit', 'Class 4 lower limit (£)', 1], ['class4UpperProfitsLimit', 'Class 4 upper limit (£)', 1], ['class4MainRate', 'Class 4 main rate (%)', 0.1], ['class4UpperRate', 'Class 4 rate above upper limit (%)', 0.1]],
];

function Text({ k, label, type = 'text', area }: { k: keyof SettingsT; label: string; type?: string; area?: boolean }) {
  const { data, updateSettings } = useKita();
  const value = String(data.settings[k] ?? '');
  const onChange = (v: string) => updateSettings({ [k]: v });
  return (
    <label className="f"><span>{label}</span>
      {area ? <textarea value={value} onChange={e => onChange(e.target.value)} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} />}
    </label>
  );
}

function Categories() {
  const { data, saveCategory, deleteCategory, addSuggestedCategories, toast } = useKita();
  const [name, setName] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (data.categories.some(c => c.name.toLowerCase() === n.toLowerCase())) { toast('You already have that category.'); return; }
    await saveCategory({ id: uid(), name: n.slice(0, 100), createdAt: Date.now() });
    setName('');
    toast(`Added ${n}`);
  };
  return (
    <section className="cats">
      <div className="head"><h2>Work categories</h2></div>
      <p className="sub" style={{ marginBottom: 14 }}>Group your tasks and time by the type of work, such as Social media or Email marketing.</p>
      {sortedCategories(data).map(c => (
        <div className="row" key={c.id}>
          <input defaultValue={c.name} aria-label="Category name" style={{ maxWidth: 320 }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) { saveCategory({ ...c, name: v.slice(0, 100) }); toast('Category renamed'); } }} />
          <ConfirmButton onConfirm={async () => { await deleteCategory(c.id); toast('Category deleted. Its time and tasks are kept, without a category.'); }}>Delete</ConfirmButton>
        </div>
      ))}
      <form className="row" style={{ marginTop: 6 }} onSubmit={add}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New category, e.g. Paid ads" style={{ maxWidth: 320 }} aria-label="New category name" />
        <button className="btn">Add</button>
      </form>
      {!data.categories.length && (
        <p style={{ marginTop: 10 }}>
          <button className="btn link" style={{ padding: 0, color: 'var(--accent)' }} onClick={addSuggestedCategories}>Add suggested categories</button>{' '}
          <span className="small muted">({SUGGESTED_CATEGORIES.join(', ')})</span>
        </p>
      )}
    </section>
  );
}

export function Settings() {
  const { data, storeKind, account, updateSettings, updateYear, loadDemo, clearData, importData, toast } = useKita();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = importBackup(JSON.parse(await file.text()), data, today(), uid);
      await importData(result);
      const parts = [`${result.clients.length} clients`, `${result.entries.length} time entries`, `${result.invoices.length} invoices`, `${result.expenses.length} expenses`];
      toast(`Imported ${parts.join(', ')}${result.skipped ? `. Skipped ${result.skipped} demo or unreadable records.` : '.'}`);
    } catch (e) {
      toast(e instanceof ImportError ? e.message : 'That file couldn’t be read. Choose the .json file from “Download everything”.');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const s = data.settings;
  const [ty, setTy] = useState(() => taxYearOf(today()));
  const r = ratesFor(data, ty);
  const hmrc = ratesForTaxYear(ty).rates;
  const setRate = (k: keyof RateOverrides, v: number) => {
    const overrides = { ...yearSettings(data, ty).rateOverrides };
    if (v === hmrc[k]) delete overrides[k];
    else overrides[k] = v;
    updateYear(ty, { rateOverrides: overrides });
  };

  return (
    <>
      <section>
        <h1>Settings</h1>
        <p className="sub" style={{ marginTop: 6 }}>{storeKind === 'cloud' ? 'Your data is saved to your account and is private to you.' : 'Your data is saved in this browser only.'}</p>
      </section>
      {account && (
        <section>
          <div className="head"><h2>Your account</h2></div>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <p>Signed in as <b>{account.email}</b></p>
            <button className="btn" onClick={account.signOut}>Sign out</button>
          </div>
        </section>
      )}
      <section>
        <div className="head"><h2>Your details on invoices</h2></div>
        <div className="grid"><Text k="name" label="Your name" /><Text k="business" label="Business name (optional)" /><Text k="email" label="Email" type="email" /></div>
        <div className="grid" style={{ marginTop: 12 }}><Text k="address" label="Address" area /><Text k="payment" label="How to pay you (bank details, payment link)" area /></div>
        <p className="fine" style={{ marginTop: 10 }}>Changes apply to new invoices. Invoices you’ve already created keep the details they were made with.</p>
      </section>
      <section>
        <div className="head"><h2>Invoices</h2></div>
        <div className="grid">
          <Text k="invPrefix" label="Number prefix" />
          <NumberField label="Next invoice number" value={s.nextInv} onChange={v => updateSettings({ nextInv: Math.max(1, Math.floor(v)) })} />
          <label className="f"><span>Payment terms</span>
            <select value={s.terms} onChange={e => updateSettings({ terms: e.target.value as PaymentTerms })}>
              <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="eofm">End of the following month</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
          <label className="check"><input type="checkbox" checked={s.vatRegistered} onChange={e => updateSettings({ vatRegistered: e.target.checked })} /> I’m VAT registered</label>
          {s.vatRegistered && <div style={{ maxWidth: 140 }}><NumberField label="VAT rate (%)" value={s.vatRate} onChange={v => updateSettings({ vatRate: v })} /></div>}
          {s.vatRegistered && <div style={{ minWidth: 200 }}><Text k="vatNumber" label="VAT registration number" /></div>}
        </div>
      </section>
      <Categories />
      <section>
        <div className="head">
          <h2>Tax rates</h2>
          <TaxYearSelect value={ty} onChange={setTy} />
        </div>
        <p className="sub" style={{ marginBottom: 12 }}>
          {taxYearLabel(ty)}, England, Wales and Northern Ireland.{' '}
          {r.isFallback ? `HMRC’s rates for this year aren’t in Kita yet, so ${taxYearLabel(r.ratesYear)} rates are shown.` : 'Filled in from HMRC’s published rates.'}
        </p>
        {RATE_FIELDS.map((row, i) => (
          <div className="grid" key={i} style={{ marginTop: i ? 12 : 0 }}>
            {row.map(([k, label, step]) => <NumberField key={k} label={label} step={step} value={r.rates[k]} onChange={v => setRate(k, v)} />)}
          </div>
        ))}
        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          <p className="fine">You only need to change these if your situation differs from the standard rates. Kita adds HMRC’s new rates each April.</p>
          {r.overridden && <button className="btn sm" onClick={() => updateYear(ty, { rateOverrides: {} })}>Reset to HMRC rates</button>}
        </div>
      </section>
      <section>
        <div className="head"><h2>Appearance</h2></div>
        <label className="f" style={{ maxWidth: 220 }}><span>Theme</span>
          <select value={s.theme} onChange={e => updateSettings({ theme: e.target.value as Theme })}>
            <option value="">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
      </section>
      <section>
        <div className="head"><h2>Your data</h2></div>
        <div className="row">
          <button className="btn" onClick={() => download('kita-time-entries.csv', entriesCsv(data), 'text/csv')}>Download time entries (CSV)</button>
          <button className="btn" onClick={() => download('kita-backup.json', JSON.stringify(data, null, 2), 'application/json')}>Download everything (JSON)</button>
        </div>
        <p className="fine" style={{ marginTop: 10 }}>To use your time in Google Sheets, download the CSV and choose File, then Import, in Sheets.</p>
        <div className="row" style={{ marginTop: 16, alignItems: 'center' }}>
          <button className="btn" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? 'Importing…' : 'Import a backup (JSON)'}</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => onImport(e.target.files?.[0])} />
          <p className="fine">Bring in a “Download everything” file, including one from the earlier single-page version of Kita. It adds to what’s here and doesn’t replace anything.</p>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          {data.clients.some(c => c.demo)
            ? <button className="btn" onClick={async () => { await clearData(true); toast('Demo data removed'); }}>Remove demo data</button>
            : <button className="btn" onClick={async () => { await loadDemo(); toast('Demo data added. Remove it any time in Settings.'); }}>Load demo data</button>}
          <ConfirmButton className="btn danger" onConfirm={async () => { await clearData(false); toast('All data deleted'); }}>Delete all my data</ConfirmButton>
        </div>
      </section>
    </>
  );
}
