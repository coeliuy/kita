import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/kita.css';
import { App } from './App';
import { RouterProvider } from './router';
import { KitaProvider } from './store/KitaProvider';
import { LocalStore } from './store/localStore';
import { InvoiceDraftProvider } from './views/invoiceDraft';

const store = new LocalStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider>
      <KitaProvider store={store}>
        <InvoiceDraftProvider>
          <App />
        </InvoiceDraftProvider>
      </KitaProvider>
    </RouterProvider>
  </StrictMode>,
);
