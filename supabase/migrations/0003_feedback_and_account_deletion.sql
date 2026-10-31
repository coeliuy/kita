-- Kita: feedback messages, and letting people delete their own account
--
-- Run once in Supabase: SQL Editor, New query, paste this file, Run.

-- ---------------------------------------------------------------------------
-- Feedback from testers. People can send messages but not read anyone's
-- (including their own); you read them in Supabase under Table Editor -> feedback.
-- ---------------------------------------------------------------------------
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  email      text not null default '',
  message    text not null check (length(message) between 1 and 5000),
  page       text not null default '' check (length(page) <= 200),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
create policy "Users can send feedback" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account: removes the signed-in user's login. Everything they
-- stored goes with it, because every table's user_id is set to cascade on
-- delete. Feedback they sent is kept without their name.
--
-- It runs with the database owner's rights (security definer) because people
-- can't otherwise touch the sign-in tables, and it only ever deletes the
-- person calling it (auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  update public.feedback set email = '' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
