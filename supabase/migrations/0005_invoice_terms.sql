-- Kita: terms and conditions on invoices
--
-- Run once in Supabase: SQL Editor, New query, paste this file, Run.

-- Your usual terms, filled in on each new invoice (you can change them per invoice)
alter table public.settings
  add column inv_terms text not null default '' check (length(inv_terms) <= 5000);

-- The terms printed on an invoice ('' = none)
alter table public.invoices
  add column terms text not null default '' check (length(terms) <= 5000);
