import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/kita.css';
import { App } from './App';
import { AuthGate } from './auth/AuthGate';
import { supabase } from './lib/supabase';
import { RouterProvider } from './router';
import { KitaProvider } from './store/KitaProvider';
import { LocalStore } from './store/localStore';
import { InvoiceDraftProvider } from './views/invoiceDraft';

const app = (
  <RouterProvider>
    <InvoiceDraftProvider>
      <App />
    </InvoiceDraftProvider>
  </RouterProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabase ? (
      // Signed in: each person's own data, from their account.
      <AuthGate sb={supabase}>
        {(store, account, userId) => <KitaProvider key={userId} store={store} account={account}>{app}</KitaProvider>}
      </AuthGate>
    ) : (
      // Accounts switched off (development): data stays in this browser.
      <KitaProvider store={new LocalStore()}>{app}</KitaProvider>
    )}
  </StrictMode>,
);
