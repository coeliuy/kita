-- Kita: work categories, tasks, and the fields for planning and calendar import
--
-- Run once in Supabase: SQL Editor, New query, paste this file, Run.
-- Like 0001, every new table has row-level security so users only reach their own rows.

-- ---------------------------------------------------------------------------
-- Work categories (e.g. Social media, Email marketing)
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(name) between 1 and 100),
  demo       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Tasks: planned work for a client, with an optional estimate, due date and repeat
-- ---------------------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid,
  category_id uuid,
  title       text not null check (length(title) between 1 and 300),
  -- estimate in minutes (0 = none)
  estimate    integer not null default 0 check (estimate between 0 and 100000),
  due         date,
  recur       text not null default '' check (recur in ('', 'weekly', 'monthly')),
  notes       text not null default '',
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  done_at     date,
  demo        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index tasks_user_status on public.tasks (user_id, status);

-- ---------------------------------------------------------------------------
-- New fields on existing tables
-- ---------------------------------------------------------------------------
alter table public.time_entries
  add column category_id uuid,
  add column task_id uuid,
  -- identifies a meeting imported from a calendar file, so it isn't imported twice
  add column ics_key text,
  add foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  add foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id);

alter table public.timers
  add column category_id uuid,
  add column task_id uuid,
  add foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  add foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id);

-- Expected hours a week from this client, for capacity planning (0 = work it out)
alter table public.clients
  add column weekly numeric(6, 2) not null default 0 check (weekly >= 0);

alter table public.settings
  -- hours a week you can work (0 = not set)
  add column capacity numeric(5, 1) not null default 0 check (capacity >= 0 and capacity <= 168),
  -- show task names and notes under invoice lines
  add column inv_notes boolean not null default true,
  -- hide the "Get set up" checklist
  add column hide_setup boolean not null default false;

-- ---------------------------------------------------------------------------
-- Row-level security for the new tables
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
create policy "Users manage their own rows" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.categories from anon;
grant select, insert, update, delete on public.categories to authenticated;

alter table public.tasks enable row level security;
create policy "Users manage their own rows" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;
