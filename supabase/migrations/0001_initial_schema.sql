-- Kita: initial database schema
--
-- Every table holds one user's private data and has row-level security (RLS)
-- switched on. The policies mean a signed-in user can only see, add, change
-- or delete rows where user_id is their own id. The database enforces this
-- itself, so even a bug in the app can't show one user another user's data.
--
-- Money is stored as numeric(12,2): exact pounds and pence, no rounding drift.
-- Dates are plain dates (no time zone), matching the app.

-- ---------------------------------------------------------------------------
-- Settings: one row per user
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name           text not null default '',
  business       text not null default '',
  address        text not null default '',
  email          text not null default '',
  payment        text not null default '',
  vat_number     text not null default '',
  inv_prefix     text not null default 'INV-',
  next_inv       integer not null default 1 check (next_inv >= 1),
  terms          text not null default '30' check (terms in ('7', '14', '30', 'eofm')),
  vat_registered boolean not null default false,
  vat_rate       numeric(5, 2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100),
  theme          text not null default '' check (theme in ('', 'light', 'dark')),
  updated_at     timestamptz not null default now()
);

-- Settings that belong to one tax year (2026 = 2026/27)
create table public.year_settings (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tax_year       integer not null check (tax_year between 2000 and 2100),
  other_income   numeric(12, 2) not null default 0 check (other_income >= 0),
  goal           numeric(12, 2) not null default 0 check (goal >= 0),
  goal_type      text not null default 'gross' check (goal_type in ('gross', 'net')),
  tax_saved      numeric(12, 2) not null default 0 check (tax_saved >= 0),
  -- The user's own changes to HMRC's rates for this year, e.g. {"basicRate": 20}
  rate_overrides jsonb not null default '{}' check (jsonb_typeof(rate_overrides) = 'object'),
  primary key (user_id, tax_year)
);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(name) between 1 and 200),
  billing    text not null check (billing in ('hourly', 'retainer', 'fixed')),
  rate       numeric(12, 2) not null default 0 check (rate >= 0),
  fee        numeric(12, 2) not null default 0 check (fee >= 0),
  included   numeric(7, 2) not null default 0 check (included >= 0),
  start_date date,
  end_date   date,
  archived   boolean not null default false,
  color      text not null default '#1F6F5C' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  email      text not null default '',
  address    text not null default '',
  demo       boolean not null default false,
  created_at timestamptz not null default now(),
  -- lets other tables check a client belongs to the same user
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number         text not null,
  client_id      uuid,
  -- Client and sender details as they were when the invoice was created
  client_name    text not null default '',
  client_address text not null default '',
  client_email   text not null default '',
  sender         jsonb not null default '{}' check (jsonb_typeof(sender) = 'object'),
  period         text check (period ~ '^\d{4}-\d{2}$'),
  issue_date     date not null,
  due_date       date not null,
  -- [{ "desc": "...", "qty": 1, "unit": 100, "kind": "time" }, ...]
  lines          jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  subtotal       numeric(12, 2) not null default 0,
  vat_rate       numeric(5, 2) not null default 0,
  vat            numeric(12, 2) not null default 0,
  total          numeric(12, 2) not null default 0,
  status         text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_date      date,
  note           text not null default '',
  entry_ids      uuid[] not null default '{}',
  demo           boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  -- invoice numbers must be unique for each user (HMRC requires this)
  unique (user_id, number),
  check (status = 'unpaid' or paid_date is not null),
  -- a client must belong to the same user; deleting the client keeps the invoice
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id)
);

-- ---------------------------------------------------------------------------
-- Time entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid,
  date       date not null,
  minutes    integer not null check (minutes > 0 and minutes <= 1440),
  billable   boolean not null default true,
  task       text not null default '',
  note       text not null default '',
  invoice_id uuid,
  demo       boolean not null default false,
  created_at timestamptz not null default now(),
  -- deleting a client keeps their time; deleting an invoice makes its time uninvoiced again
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id),
  foreign key (invoice_id, user_id) references public.invoices (id, user_id) on delete set null (invoice_id)
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  category    text not null,
  description text not null default '',
  client_id   uuid,
  demo        boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id)
);

-- ---------------------------------------------------------------------------
-- The running timer: at most one per user, shared by all their devices
-- ---------------------------------------------------------------------------
create table public.timers (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid,
  task       text not null default '',
  started_at timestamptz not null,
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id)
);

-- Indexes for the lookups the app makes
create index time_entries_user_date on public.time_entries (user_id, date);
create index invoices_user_issue on public.invoices (user_id, issue_date);
create index expenses_user_date on public.expenses (user_id, date);

-- ---------------------------------------------------------------------------
-- Row-level security: each user sees and changes only their own rows
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings', 'year_settings', 'clients', 'invoices', 'time_entries', 'expenses', 'timers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Users manage their own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    -- Signed-out visitors get no access at all
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invoice numbers: hand out the next number and move the counter on in one
-- step, so two devices creating invoices at once never get the same number.
-- Skips any number already used. Runs as the signed-in user, so RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.take_invoice_number()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
  prefix text;
  candidate text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  insert into public.settings (user_id) values (uid) on conflict (user_id) do nothing;
  loop
    update public.settings
       set next_inv = next_inv + 1, updated_at = now()
     where user_id = uid
    returning next_inv - 1, inv_prefix into n, prefix;
    candidate := prefix || case when n < 1000 then lpad(n::text, 3, '0') else n::text end;
    exit when not exists (select 1 from public.invoices where user_id = uid and number = candidate);
  end loop;
  return candidate;
end;
$$;

revoke all on function public.take_invoice_number() from public, anon;
grant execute on function public.take_invoice_number() to authenticated;
