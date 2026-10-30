/**
 * A small router: each screen has its own address (/app/invoices and so on),
 * so the browser's back and forward buttons work and links can be bookmarked.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export const VIEWS = ['track', 'overview', 'clients', 'invoices', 'expenses', 'money', 'settings', 'more'] as const;
export type View = (typeof VIEWS)[number];

const isView = (s: string): s is View => (VIEWS as readonly string[]).includes(s);

function viewFromLocation(): View {
  const seg = location.pathname.replace(/^\/app\/?/, '').split('/')[0] ?? '';
  return isView(seg) ? seg : 'track';
}

const Ctx = createContext<{ view: View; go: (v: View) => void } | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(viewFromLocation);

  useEffect(() => {
    const onPop = () => setView(viewFromLocation());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((v: View) => {
    if (v !== viewFromLocation()) history.pushState(null, '', `/app/${v}`);
    setView(v);
    scrollTo(0, 0);
  }, []);

  return <Ctx.Provider value={{ view, go }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouter must be used inside <RouterProvider>');
  return v;
}
