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

Easiest: GitHub deploys them for you. In the repo go to **Settings → Secrets and variables → Actions** and add two secrets:

- `SUPABASE_ACCESS_TOKEN`: supabase.com → Account → Access Tokens → Generate
- `SUPABASE_DB_PASSWORD`: the database password you chose when creating the project

Then run **Actions → Deploy Supabase → Run workflow**. It creates the tables and deploys all five functions. (If you do this, skip the SQL Editor step above.)

Or by hand with the Supabase CLI:

```
supabase login
supabase link --project-ref <your-ref>
supabase functions deploy stripe-checkout stripe-portal stripe-webhook monime-checkout monime-verify
```

## 3. Secrets (never paste these in chat or commit them)

Enter them in **Edge Functions → Secrets**, or with `supabase secrets set NAME=value`:

| Name | Where it comes from |
|---|---|
| STRIPE_SECRET_KEY | Stripe → Developers → API keys (`sk_live_...`) |
| STRIPE_WEBHOOK_SECRET | Shown when you create the webhook in step 4 (`whsec_...`) |
| STRIPE_PRICE_MONTHLY | The ID of the monthly price (`price_...`) |
| STRIPE_PRICE_YEARLY | The ID of the yearly price (`price_...`) |
| MONIME_ACCESS_TOKEN | Monime dashboard → Developers |
| MONIME_SPACE_ID | Monime dashboard (`spc-...`) |
| MONIME_PRICE_1M | 1-month pass in minor units of SLE, for example `9900` |
| MONIME_PRICE_12M | 12-month pass in minor units of SLE |
| MONIME_WEBHOOK_SECRET | Any long random string you make up |
| APP_URL | `https://juliusklahai.github.io/maestro-academy/` |
| APP_ORIGIN | `https://juliusklahai.github.io` |

## 4. Stripe

1. Go to **Products**. Create "Maestro Pro" with two recurring prices, monthly and yearly.
2. Go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://<ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
3. Go to **Settings → Billing → Customer portal** and turn it on, so subscribers can cancel or change their card.

## 5. Monime

Monime has no auto-renewal, so these are sold as passes: 31 or 366 days.

1. Create a webhook pointing to `https://<ref>.supabase.co/functions/v1/monime-verify`.
2. Use the event `checkout_session.completed`.
3. Add a custom header `x-maestro-secret` with the value of MONIME_WEBHOOK_SECRET.

Even without the webhook, the app checks the payment itself when the buyer returns, and the server always re-fetches the session from Monime before giving credit.

## 6. Front end

These go in the GitHub repo's Actions variables, or in `.env.local` for testing:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PRICE_MONTHLY_LABEL=$4.99 / month
VITE_PRICE_YEARLY_LABEL=$39 / year
VITE_PRICE_PASS_1M_LABEL=SLE 99 for 1 month
VITE_PRICE_PASS_12M_LABEL=SLE 790 for 12 months
VITE_MONIME_ENABLED=true
```

## Free vs Pro

- **Free:** Levels 0 to 2, the Beginner songs, Easy singing, and microphone and MIDI listening.
- **Pro:** everything else, including MusicXML import and syncing progress across devices.
- **Admin:** everything, plus the Admin tab (grant or remove time, change roles, see payments).

## Known limit

The gating runs in the browser, so a technical user could get around it. A later phase will serve the paid lessons and songs only after sign-in.
