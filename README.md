# Kita

Time tracking for UK freelancers and sole traders that follows the work through to money:
hours by client, retainers, invoices, expenses, and estimated tax and take-home pay.

"Kita" is Filipino for "earnings". It also means "to see".

## Status

Being rebuilt from the single-file prototype (`prototype/kita.html`) into a full web app.

- [x] Step 1: Money and tax calculations as a tested module (`src/lib/money`)
- [x] Step 2: The app's screens in React (data saved in the browser for now)
- [x] Step 3: Database (Supabase) with row-level security
- [x] Step 4: Accounts (email and password) and importing prototype data
- [x] Step 5: Live hosting on Cloudflare: https://kita.coeli.workers.dev
- [ ] Step 6: Google sign-in
- [ ] Step 7: Privacy policy, terms and launch checks
- [ ] Step 8: Custom domain

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for detailed instructions for each remaining step.

## Working on it

You need Node.js 22 or later.

```bash
npm install
npm test        # run the calculation and import tests
npm run test:db # run the database security tests (needs PostgreSQL 15+)
npm run dev     # run the app locally at http://localhost:5173
npm run build   # check types and build the live site into dist/
```

## How it's organised

| Folder | What's in it |
|---|---|
| `index.html` | The public homepage. Edit the wording here. |
| `app.html` | The page that loads the app at `/app`. |
| `src/lib/money/` | All money and tax calculations, with tests. See its README. |
| `src/app/views/` | One file per screen (Track, Overview, Clients, Invoices, Expenses, Money, Settings). |
| `src/app/store/` | Where data is saved. `localStore.ts` uses the browser; the online database comes in step 3. |
| `src/styles/kita.css` | Colours, light and dark mode, and layout. |
| `prototype/kita.html` | The original single-file prototype, for reference. |

Tax figures are estimates, not tax advice.
