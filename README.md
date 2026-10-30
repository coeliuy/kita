# Kita

Time tracking for UK freelancers and sole traders that follows the work through to money:
hours by client, retainers, invoices, expenses, and estimated tax and take-home pay.

"Kita" is Filipino for "earnings". It also means "to see".

## Status

Being rebuilt from the single-file prototype (`prototype/kita.html`) into a full web app.

- [x] Step 1: Money and tax calculations as a tested module (`src/lib/money`)
- [ ] Step 2: The app's screens in React
- [ ] Step 3: Database (Supabase) with row-level security
- [ ] Step 4: Accounts and importing prototype data
- [ ] Step 5: Live hosting (Cloudflare Pages)
- [ ] Step 6: Google sign-in
- [ ] Step 7: Privacy policy, terms and launch checks
- [ ] Step 8: Custom domain

## Working on it

You need Node.js 22 or later.

```bash
npm install
npm test
```

Tax figures are estimates, not tax advice.
