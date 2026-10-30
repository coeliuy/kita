/**
 * Shows the sign-in screen until someone is signed in, then the app with
 * their own data. Signing out (here or on another tab) returns to sign-in.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore } from '../store/supabaseStore';
import type { KitaStore } from '../store/store';
import { AuthScreen, type AuthMode } from './AuthScreen';

export interface Account {
  email: string;
  signOut: () => Promise<void>;
}

export function AuthGate({ sb, children }: { sb: SupabaseClient; children: (store: KitaStore, account: Account, userId: string) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      // Arriving from a "reset your password" email
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const userId = session?.user.id;
  // A fresh store for each person who signs in, so nothing carries over between accounts.
  const store = useMemo(() => (userId ? new SupabaseStore(sb) : null), [sb, userId]);

  if (session === undefined) return <div className="loading">Loading…</div>;
  if (recovering) return <AuthScreen sb={sb} initialMode="newPassword" onPasswordSet={() => setRecovering(false)} />;
  if (!session || !store) {
    const wantsSignup = new URLSearchParams(location.search).has('signup');
    const mode: AuthMode = wantsSignup ? 'signup' : 'signin';
    return <AuthScreen sb={sb} initialMode={mode} />;
  }
  const account: Account = { email: session.user.email ?? '', signOut: async () => { await sb.auth.signOut(); } };
  return <>{children(store, account, session.user.id)}</>;
}
