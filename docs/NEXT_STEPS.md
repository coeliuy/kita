# Next steps

Kita is live at https://kita.coeli.workers.dev with email accounts, the
Supabase database and importing from the prototype. These are the steps
left, saved for later. "You" means Coeli; "Claude" means the coding assistant.

## Before friends test it (checklist)

Must do:
1. **Email sending (you, ~20 minutes).** Supabase's built-in email only reaches addresses in your
   Supabase team, a few per hour, so friends won't get their confirmation emails. Set up a free
   Resend account, verify a domain you own, and enter its SMTP details in
   **Supabase -> Authentication -> Emails -> SMTP settings**.
2. **Privacy notice: live at /privacy (privacy.html).** Run by Kita App, contact
   coeli@dahildigital.com. Name the email provider once it's set up, and have it checked
   before a public launch.
3. **Delete my account: built** (Settings -> Your account). Needs migration 0003.
4. **Send feedback: built** (sidebar, More, and the box saves to the `feedback` table, which you
   read in Supabase -> Table Editor -> feedback). Needs migration 0003.
5. **Check the homepage stats sources (you)** before sharing the link widely.

Strongly recommended:
6. **Backups.** The free Supabase plan has none. Either upgrade to Pro (about $25/month), or ask
   testers to use Settings -> Download everything now and then.
7. **Free projects pause after a week with no activity.** Unlikely while friends use it; if it
   happens, restore it from the Supabase dashboard.
8. **Test on your own phone** (iPhone Safari and Android Chrome), including signing up from scratch.

Nice to have:
9. Google sign-in (step 6), a custom domain (step 8), and error alerts (e.g. Sentry's free plan).

## Step 6: Google sign-in (about 10 minutes)

1. **Google Cloud** (console.cloud.google.com), you:
   - Create a project called "Kita".
   - Set up the **OAuth consent screen**: app name Kita, your email, user type **External**.
   - **Credentials → Create credentials → OAuth client ID → Web application**.
   - Under **Authorised redirect URIs** add:
     `https://xblcblduzhheuualebpj.supabase.co/auth/v1/callback`
   - Google shows a **Client ID** and **Client secret**.
2. **Supabase**, you: **Authentication → Sign In / Providers → Google**. Turn it on,
   paste the Client ID and Client secret, and save. Keep the secret between Google
   and Supabase; Claude doesn't need it.
3. Claude: switch on the "Continue with Google" button by setting
   `VITE_GOOGLE_SIGN_IN=on` in the build (one line), then test it.

## Step 7: Before inviting other people

- **Email sending.** Supabase's built-in sender only sends a few emails an hour.
  Set up a proper service (Resend has a free tier) under
  **Supabase → Authentication → Emails → SMTP settings**. Claude can guide you.
- **Your own email wording.** Customise the confirmation and password-reset emails
  in **Supabase → Authentication → Emails → Templates**.
- **Privacy policy and terms.** Claude drafts them; have them checked by a professional.
  You'll likely need to pay the ICO data protection fee (ico.org.uk).
- **Security settings in Supabase:** turn on leaked-password protection, and check
  the rate limits under **Authentication → Rate Limits**.
- **Tax wording.** Check "estimates, not tax advice" appears on every money screen.
- **Backups.** Supabase's free plan has no automatic backups. Upgrade to Pro
  (about $25/month) before real users rely on Kita, or download backups regularly.
- **Supabase pauses free projects** after a week with no activity. Pro avoids this.

## Step 8: Custom domain

1. Buy a domain (about £10 a year), for example through Cloudflare itself.
2. Cloudflare: **Workers & Pages → kita → Settings → Domains & Routes → Add → Custom domain**.
3. Supabase: update **Authentication → URL Configuration** with the new address
   (Site URL, plus `https://<new domain>/app/**` under Redirect URLs).
4. Google Cloud (if step 6 is done): add the new domain to the OAuth consent screen.

## Phase 2 (later)

- **Chrome extension** with a quick timer. It signs in with the same Supabase account
  and uses the `timers` table, which is already shared between devices.
- **Paid plans with Stripe**, using Supabase Edge Functions to receive Stripe's
  payment notifications. Cloudflare's free plan allows commercial use.
- **Desktop app.** Start with an installable web app; wrap it with Tauri later if needed.

## Known limitations to consider

- Tax estimates cover England, Wales and Northern Ireland only (no Scottish bands,
  student loans, pension relief).
- Each April, add the new tax year to `src/lib/money/taxRates.ts`
  (see `src/lib/money/README.md`).
- Kita doesn't submit Making Tax Digital updates to HMRC; it exports the quarterly totals.
