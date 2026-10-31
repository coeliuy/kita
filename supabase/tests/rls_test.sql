-- Checks that row-level security keeps each user's data private.
-- Run with: npm run test:db   (needs PostgreSQL 15+ installed locally)
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- Alice
  ('22222222-2222-2222-2222-222222222222');  -- Bob

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

set role authenticated;

-- Alice adds her data
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.clients (id, name, billing, rate) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice client', 'hourly', 50);
insert into public.time_entries (client_id, date, minutes) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01', 60);
insert into public.expenses (date, amount, category) values ('2026-10-01', 10, 'Travel');
insert into public.settings (name) values ('Alice');
insert into public.year_settings (tax_year, goal) values (2026, 40000);
insert into public.timers (started_at) values (now());
select pg_temp.check(public.take_invoice_number() = 'INV-001', 'Alice gets INV-001');
select pg_temp.check(public.take_invoice_number() = 'INV-002', 'Alice gets INV-002 next');
insert into public.invoices (id, number, client_id, issue_date, due_date) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'INV-003', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01', '2026-10-31');
select pg_temp.check(public.take_invoice_number() = 'INV-004', 'numbering skips a number already used');
insert into public.categories (id, name) values ('cccccccc-0000-0000-0000-000000000001', 'Social media');
insert into public.tasks (id, client_id, category_id, title, estimate) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'LinkedIn batch', 120);
update public.time_entries set category_id = 'cccccccc-0000-0000-0000-000000000001', task_id = 'dddddddd-0000-0000-0000-000000000001';

-- Bob signs in: he must see none of it and be unable to change it
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.clients) = 0, 'Bob sees no clients');
select pg_temp.check((select count(*) from public.time_entries) = 0, 'Bob sees no time entries');
select pg_temp.check((select count(*) from public.invoices) = 0, 'Bob sees no invoices');
select pg_temp.check((select count(*) from public.expenses) = 0, 'Bob sees no expenses');
select pg_temp.check((select count(*) from public.settings) = 0, 'Bob sees no settings');
select pg_temp.check((select count(*) from public.year_settings) = 0, 'Bob sees no year settings');
select pg_temp.check((select count(*) from public.timers) = 0, 'Bob sees no timer');
select pg_temp.check((select count(*) from public.categories) = 0, 'Bob sees no categories');
select pg_temp.check((select count(*) from public.tasks) = 0, 'Bob sees no tasks');
update public.tasks set title = 'hacked';
delete from public.categories;
do $$ begin
  insert into public.time_entries (task_id, date, minutes) values ('dddddddd-0000-0000-0000-000000000001', '2026-10-01', 60);
  raise exception 'FAILED: Bob linked time to Alice''s task';
exception when foreign_key_violation then raise notice 'ok: Bob can''t link time to Alice''s task';
end $$;
do $$ begin
  insert into public.tasks (category_id, title) values ('cccccccc-0000-0000-0000-000000000001', 'sneaky');
  raise exception 'FAILED: Bob used Alice''s category';
exception when foreign_key_violation then raise notice 'ok: Bob can''t use Alice''s category';
end $$;

update public.clients set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.time_entries;
delete from public.expenses;

-- Bob can't write rows that claim to be Alice's
do $$ begin
  insert into public.clients (user_id, name, billing) values ('11111111-1111-1111-1111-111111111111', 'sneaky', 'hourly');
  raise exception 'FAILED: Bob inserted a row for Alice';
exception when insufficient_privilege then raise notice 'ok: Bob can''t insert rows for Alice';
end $$;

-- Bob can't attach his time to Alice's client or invoice
do $$ begin
  insert into public.time_entries (client_id, date, minutes) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01', 60);
  raise exception 'FAILED: Bob linked time to Alice''s client';
exception when foreign_key_violation then raise notice 'ok: Bob can''t link time to Alice''s client';
end $$;
do $$ begin
  insert into public.time_entries (invoice_id, date, minutes) values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-01', 60);
  raise exception 'FAILED: Bob linked time to Alice''s invoice';
exception when foreign_key_violation then raise notice 'ok: Bob can''t link time to Alice''s invoice';
end $$;

-- Bob's own invoice numbers start from 1
select pg_temp.check(public.take_invoice_number() = 'INV-001', 'Bob''s numbering is separate');

-- Back as Alice: everything is untouched
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select name from public.clients) = 'Alice client', 'Alice''s client unchanged');
select pg_temp.check((select count(*) from public.time_entries) = 1, 'Alice''s time still there');
select pg_temp.check((select count(*) from public.expenses) = 1, 'Alice''s expense still there');
select pg_temp.check((select title from public.tasks) = 'LinkedIn batch', 'Alice''s task unchanged');
select pg_temp.check((select count(*) from public.categories) = 1, 'Alice''s category still there');

-- Deleting a client keeps its time; deleting an invoice frees its time
update public.time_entries set invoice_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.invoices where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.check((select invoice_id from public.time_entries) is null, 'deleting an invoice makes its time uninvoiced');
delete from public.tasks;
select pg_temp.check((select task_id from public.time_entries) is null, 'deleting a task keeps its time');
delete from public.categories;
select pg_temp.check((select category_id from public.time_entries) is null, 'deleting a category keeps its time');
delete from public.clients;
select pg_temp.check((select count(*) from public.time_entries where client_id is null) = 1, 'deleting a client keeps its time');

-- Signed-out visitors can't read anything
reset role;
set role anon;
do $$ begin
  perform count(*) from public.clients;
  raise exception 'FAILED: signed-out visitor read clients';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors are refused';
end $$;
do $$ begin
  perform public.take_invoice_number();
  raise exception 'FAILED: signed-out visitor took an invoice number';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors can''t take invoice numbers';
end $$;
reset role;

-- Feedback: people can send it but not read it
set role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
insert into public.feedback (message, email) values ('Love it', 'bob@example.com');
do $$ begin
  perform count(*) from public.feedback;
  raise exception 'FAILED: a user could read feedback';
exception when insufficient_privilege then raise notice 'ok: users can send feedback but not read it';
end $$;
do $$ begin
  insert into public.feedback (user_id, message) values ('11111111-1111-1111-1111-111111111111', 'pretending to be Alice');
  raise exception 'FAILED: Bob sent feedback as Alice';
exception when insufficient_privilege then raise notice 'ok: feedback can''t be sent in someone else''s name';
end $$;

-- Delete my account: only the caller's account and data go
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.clients (name, billing) values ('Alice again', 'hourly');
select public.delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'deleting an account removes the login');
select pg_temp.check(not exists (select 1 from public.clients where user_id = '11111111-1111-1111-1111-111111111111'), 'and all of that person''s data');
select pg_temp.check(not exists (select 1 from public.settings where user_id = '11111111-1111-1111-1111-111111111111'), 'including their settings');
select pg_temp.check(exists (select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222'), 'other accounts are untouched');
select pg_temp.check((select count(*) from public.feedback) = 1, 'feedback is kept');
set role anon;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAILED: signed-out visitor called delete_my_account';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors can''t delete accounts';
end $$;
reset role;

-- Every table in the public schema has RLS switched on
select pg_temp.check(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'every table has row-level security on');
