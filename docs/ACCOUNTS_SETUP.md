# Accounts and payments setup

Branch: `accounts`. Nothing here is live until this branch is merged into `main`.

Without the `VITE_SUPABASE_*` variables the app runs exactly as before: no sign-in, everything unlocked.

## What it costs

- **Supabase free tier:** 500 MB database and 50k monthly users. Each user is one row (progress stored as JSON), so this covers thousands of learners.
- **Stripe and Monime:** they take a fee per payment. There is no monthly fee.

## 1. Supabase

1. Create a project at supabase.com.
2. Go to **SQL Editor**, paste in `supabase/migrations/0001_accounts.sql`, and run it.
3. To change the admin email, edit the `insert into admin_emails` line first. That email gets the admin role on first sign-in, with every course unlocked.
4. Go to **Authentication → URL Configuration**:
   - Site URL: `https://juliusklahai.github.io/maestro-academy/`
   - Also add it to the Redirect URLs.
5. Go to **Authentication → Providers**:
   - Email is on by default (magic link).
   - Turn on Google if you want it. Google needs an OAuth client from Google Cloud Console.
6. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key. These two are safe to share and go in the front end.

## 2. Database and edge functions

Everything is ready to paste in `supabase/dashboard/`. Follow `supabase/dashboard/README.md`: one SQL file, then five functions, all through the Supabase dashboard with no command line.

## 3. Secrets (never paste these in chat or commit them)

Enter them in **Edge Functions → Secrets**, or with `supabase secrets set NAME=value`:

| Name | Where it comes from |
|---|---|
| STRIPE_SECRET_KEY | Stripe → Developers → API keys (`sk_live_...`) |
| STRIPE_WEBHOOK_SECRET | Shown when you create the webhook in step 4 (`whsec_...`) |
| STRIPE_PRICE_PRO | The ID of the $8.99/month price |
| STRIPE_PRICE_PLUS | The ID of the $15.99/month price |
| MONIME_ACCESS_TOKEN | Monime dashboard → Developers |
| MONIME_SPACE_ID | Monime dashboard (`spc-...`) |
| MONIME_PRICE_PRO | Pro pass in minor units of SLE: `20000` (SLE 200) |
| MONIME_PRICE_PLUS | Plus pass in minor units of SLE: `40000` (SLE 400) |
| MONIME_WEBHOOK_SECRET | Any long random string you make up |
| APP_URL | `https://juliusklahai.github.io/maestro-academy/` |
| APP_ORIGIN | `https://juliusklahai.github.io` |

## 4. Stripe

1. Go to **Products**. You have two monthly prices: $8.99 (Pro) and $15.99 (Plus).
   Check which ID is which before setting STRIPE_PRICE_PRO and STRIPE_PRICE_PLUS.
2. Go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://<ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
3. Go to **Settings → Billing → Customer portal** and turn it on, so subscribers can cancel or change their card.

## 5. Monime

Monime has no auto-renewal, so these are sold as 31-day passes: Pro for SLE 200, Plus for SLE 400.

1. Create a webhook pointing to `https://<ref>.supabase.co/functions/v1/monime-verify`.
2. Use the event `checkout_session.completed`.
3. Add a custom header `x-maestro-secret` with the value of MONIME_WEBHOOK_SECRET.

Even without the webhook, the app checks the payment itself when the buyer returns, and the server always re-fetches the session from Monime before giving credit.

## 6. Front end

These go in the GitHub repo's Actions variables, or in `.env.local` for testing:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PRICE_PRO_LABEL=\$8.99 / month
VITE_PRICE_PLUS_LABEL=\$15.99 / month
VITE_PRICE_PASS_PRO_LABEL=SLE 200
VITE_PRICE_PASS_PLUS_LABEL=SLE 400
VITE_MONIME_ENABLED=true
```

## Free vs Pro

- **Free:** Levels 0 to 2, the Beginner songs, Easy singing, and microphone and MIDI listening.
- **Pro ($8.99 or SLE 200 a month):** Levels 3 to 6, the whole song library, Standard singing, and progress synced across devices.
- **Plus ($15.99 or SLE 400 a month):** everything, including Levels 7 to 9, Strict and Pro coach singing, and your own MusicXML and choir scores.
- A card Pro subscriber who picks Plus gets their subscription switched (prorated), not a second one.
- **Admin:** everything, plus the Admin tab (grant Pro or Plus time, remove it, change roles, see payments).

## Known limit

The gating runs in the browser, so a technical user could get around it. A later phase will serve the paid lessons and songs only after sign-in.
