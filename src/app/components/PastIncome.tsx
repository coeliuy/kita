/** Bring in what you earned before using Kita: typed in per client, or from a spreadsheet. */
import { useState } from 'react';
import { ImportInvoices } from './ImportInvoices';
import { PastEarnings } from './PastEarnings';

export function PastIncome() {
  const [mode, setMode] = useState<'type' | 'csv'>('type');
  return (
    <div>
      <div className="switch" role="tablist" aria-label="How to add past earnings">
        <button role="tab" aria-selected={mode === 'type'} onClick={() => setMode('type')}>Type it in</button>
        <button role="tab" aria-selected={mode === 'csv'} onClick={() => setMode('csv')}>From a spreadsheet</button>
      </div>
      {mode === 'type' ? <PastEarnings /> : <ImportInvoices />}
    </div>
  );
}
