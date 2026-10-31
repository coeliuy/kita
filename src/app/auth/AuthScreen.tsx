/** Sign in, sign up, and password reset. */
import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Logo } from '../components/Layout';
import { GOOGLE_SIGN_IN } from '../lib/supabase';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'newPassword';

const MIN_PASSWORD = 8;
const appUrl = () => `${location.origin}/app/`;

/** Supabase's error messages, in plainer words. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Check them, or reset your password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link we sent.';
  if (m.includes('already registered')) return 'There’s already an account with that email. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Couldn’t reach Kita. Check your connection and try again.';
  if (m.includes('password')) return message;
  return 'Something went wrong. Please try again.';
}

export function AuthScreen({ sb, initialMode = 'signin', onPasswordSet }: { sb: SupabaseClient; initialMode?: AuthMode; onPasswordSet?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shown once after someone deletes their account.
  const [notice, setNotice] = useState(() => {
    try {
      if (!sessionStorage.getItem('kita-deleted')) return '';
      sessionStorage.removeItem('kita-deleted');
      return 'Your account and everything in it have been deleted.';
    } catch { return ''; }
  });

  const switchTo = (m: AuthMode) => { setMode(m); setError(''); setNotice(''); };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    setError(''); setNotice('');
    if ((mode === 'signup' || mode === 'newPassword') && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
        if (error) throw error;
        if (!data.session) setNotice(`Nearly there. We’ve sent a link to ${email}. Click it to confirm your email, then you’re in.`);
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
        if (error) throw error;
        setNotice(`If there’s an account for ${email}, we’ve sent it a link to reset the password.`);
      } else {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        onPasswordSet?.();
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) setError(friendly(error.message));
  };

  const title = { signin: 'Sign in to Kita', signup: 'Create your Kita account', forgot: 'Reset your password', newPassword: 'Choose a new password' }[mode];

  return (
    <div className="auth">
      <a className="brand" href="/"><Logo />Kita</a>
      <section className="auth-card">
        <h1>{title}</h1>
        {mode === 'signup' && <p className="sub">Free during early preview. Your data is private to your account. <a href="/privacy">How Kita handles your data</a></p>}
        {GOOGLE_SIGN_IN && (mode === 'signin' || mode === 'signup') && (
          <>
            <button type="button" className="btn lg auth-google" onClick={google}>Continue with Google</button>
            <div className="auth-or"><span>or use your email</span></div>
          </>
        )}
        {notice ? <div className="callout info" role="status">{notice}</div> : (
          <form className="stack" onSubmit={onSubmit}>
            {mode !== 'newPassword' && (
              <label className="f"><span>Email</span><input type="email" name="email" autoComplete="email" required autoFocus /></label>
            )}
            {mode !== 'forgot' && (
              <label className="f">
                <span>{mode === 'newPassword' ? 'New password' : 'Password'}</span>
                <input type="password" name="password" required minLength={mode === 'signin' ? undefined : MIN_PASSWORD}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
                {mode !== 'signin' && <small className="muted">At least {MIN_PASSWORD} characters.</small>}
              </label>
            )}
            {error && <div className="callout" role="alert" style={{ borderColor: 'var(--bad)', background: 'var(--bad-soft)' }}>{error}</div>}
            <button className="btn primary lg" disabled={busy}>
              {busy ? 'One moment…' : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', newPassword: 'Save password' }[mode]}
            </button>
          </form>
        )}
        <div className="auth-links">
          {mode === 'signin' && <>
            <button className="btn link" onClick={() => switchTo('forgot')}>Forgotten your password?</button>
            <span>New to Kita? <button className="btn link" onClick={() => switchTo('signup')}>Create an account</button></span>
          </>}
          {(mode === 'signup' || mode === 'forgot') && <span>Already have an account? <button className="btn link" onClick={() => switchTo('signin')}>Sign in</button></span>}
        </div>
      </section>
      <p className="fine auth-foot">Tax figures in Kita are estimates, not tax advice.</p>
    </div>
  );
}
