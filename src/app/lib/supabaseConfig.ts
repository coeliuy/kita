/**
 * Where Supabase is. The URL and anon key are designed to be public (they ship
 * in every visitor's browser); row-level security keeps data private.
 * Never put the service_role key here.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://xblcblduzhheuualebpj.supabase.co';
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhibGNibGR1emhoZXV1YWxlYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjk5MzQsImV4cCI6MjEwODk0NTkzNH0.V35HHrUXQWSBCJGEPoWb8F73m3ZT-AtXmtpEaGgrMhk';
