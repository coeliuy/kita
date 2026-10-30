/**
 * The connection to Supabase. The URL and anon key are designed to be public
 * (they ship in every visitor's browser); the database's row-level security
 * is what keeps data private. Never put the service_role key in the app.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the app hasn't been given Supabase details (it then uses browser storage). */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
