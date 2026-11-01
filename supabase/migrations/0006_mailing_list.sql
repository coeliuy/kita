-- Kita: email updates list for the homepage
--
-- Run once in Supabase: SQL Editor, New query, paste this file, Run.
--
-- Visitors can add their email through the subscribe() function only. Nobody
-- can read, change or delete the list from the website; you see it in
-- Supabase under Table Editor -> subscribers (and can export it as CSV).

create table public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- where they signed up, e.g. 'homepage'
  source     text not null default '' check (length(source) <= 50),
  -- when they asked for updates (the consent record)
  created_at timestamptz not null default now()
);
create unique index subscribers_email_key on public.subscribers (lower(email));

alter table public.subscribers enable row level security;
revoke all on public.subscribers from anon, authenticated;

-- Adds an email to the list. Signing up twice is fine and says nothing about
-- whether the email was already there, so the list can't be probed.
create or replace function public.subscribe(email text, source text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  insert into public.subscribers (email, source)
  values (trim(subscribe.email), left(coalesce(subscribe.source, ''), 50))
  on conflict (lower(email)) do nothing;
end;
$$;

revoke all on function public.subscribe(text, text) from public;
grant execute on function public.subscribe(text, text) to anon, authenticated;
