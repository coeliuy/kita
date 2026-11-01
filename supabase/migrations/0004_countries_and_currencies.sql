-- Kita: country, home currency, and invoices in other currencies
--
-- Run once in Supabase: SQL Editor, New query, paste this file, Run.

-- Where you're based and the currency your figures are counted in.
-- country '' means "not chosen yet" (existing accounts keep UK settings).
alter table public.settings
  add column country text not null default '' check (country in ('', 'GB', 'PH', 'US', 'OTHER')),
  add column currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  -- For countries Kita doesn't calculate tax for: the % of profit to set aside
  add column set_aside numeric(5, 2) not null default 25 check (set_aside >= 0 and set_aside <= 100),
  -- Last known exchange rates: {"USD": {"rate": 0.79, "date": "2026-11-01"}}, home currency per unit
  add column fx_rates jsonb not null default '{}' check (jsonb_typeof(fx_rates) = 'object');

-- A client's currency ('' = your home currency)
alter table public.clients
  add column currency text not null default '' check (currency = '' or currency ~ '^[A-Z]{3}$');

-- An invoice's currency, the exchange rate used, and what actually arrived
alter table public.invoices
  add column currency text not null default '' check (currency = '' or currency ~ '^[A-Z]{3}$'),
  -- home currency per 1 unit of the invoice's currency (null = home currency)
  add column fx_rate numeric(18, 8) check (fx_rate is null or fx_rate > 0),
  -- for paid foreign-currency invoices: the total that arrived, in home currency
  add column received_home numeric(12, 2) check (received_home is null or received_home >= 0);
