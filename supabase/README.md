# Database

Kita uses Supabase (PostgreSQL) in the London region.

- `migrations/` holds the database setup, in order. Each file is applied once.
- `tests/` holds the security tests. `npm run test:db` runs them against a
  throwaway local PostgreSQL (needs PostgreSQL 15+ installed). They check that
  one user can never read, change or link to another user's data.

## Applying a migration

1. Open the Supabase dashboard, then **SQL Editor**, then **New query**.
2. Paste the whole migration file and click **Run**.
3. It should say "Success. No rows returned".

Never run anything in `tests/` on the real project: `local_auth_stub.sql` imitates
Supabase's sign-in system for local testing and would conflict with the real one.
