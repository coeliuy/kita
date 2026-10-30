import { useRouter } from '../router';
import { useKita } from '../store/KitaProvider';

export function NoClients() {
  const { go } = useRouter();
  const { loadDemo, toast } = useKita();
  return (
    <div className="empty">
      <p>Add a client first. Kita uses each client’s rate to work out what your time is worth.</p>
      <button className="btn primary" onClick={() => go('clients')}>Add a client</button>{' '}
      <button className="btn secondary" onClick={async () => { await loadDemo(); toast('Demo data added. Remove it any time in Settings.'); }}>Try it with demo data</button>
    </div>
  );
}
