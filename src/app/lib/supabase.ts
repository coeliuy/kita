/**
 * The connection to Supabase. The URL and anon key are designed to be public
 * (they ship in every visitor's browser); the database's row-level security
 * is what keeps data private. Never put the service_role key in the app.
 *
 * Set VITE_SUPABASE_URL to "off" in .env.local to run the app with browser
 * storage only, without accounts.
 */
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://xblcblduzhheuualebpj.supabase.co';
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhibGNibGR1emhoZXV1YWxlYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjk5MzQsImV4cCI6MjEwODk0NTkzNH0.V35HHrUXQWSBCJGEPoWb8F73m3ZT-AtXmtpEaGgrMhk';

/** Null when accounts are switched off (the app then uses browser storage). */
export const supabase = URL === 'off' ? null : createClient(URL, ANON_KEY);

/** Google sign-in appears once it's set up in Supabase (step 6). */
export const GOOGLE_SIGN_IN = import.meta.env.VITE_GOOGLE_SIGN_IN === 'on';
