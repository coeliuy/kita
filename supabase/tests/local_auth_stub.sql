-- FOR LOCAL TESTING ONLY. Never run this on the real Supabase project.
-- Imitates the parts of Supabase the schema relies on (the auth schema,
-- auth.uid(), and the anon/authenticated roles) in a plain Postgres database.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
