# Set up Supabase from the dashboard (no command line)

## 1. Database (once)

1. Open Supabase → **SQL Editor** → **New query**.
2. Paste in all of `database.sql` and press **Run**.
3. The result should say "Success. No rows returned".

The admin email is `meesheiksm@gmail.com`. That account gets every course unlocked, plus the Admin tab.

## 2. Functions (5 of them)

For each file below, open **Edge Functions** → **Deploy a new function** → **Via Editor**:

1. Set the name to **exactly** the file name without `.ts`.
2. Delete the sample code, paste in the whole file, and press **Deploy**.

| File | Name | "Verify JWT" |
|---|---|---|
| stripe-checkout.ts | stripe-checkout | on |
| stripe-portal.ts | stripe-portal | on |
| monime-checkout.ts | monime-checkout | on |
| stripe-webhook.ts | stripe-webhook | **off** |
| monime-verify.ts | monime-verify | **off** |

The two webhooks need "Verify JWT" switched **off**, because Stripe and Monime call them without a user login. Each one checks its own signature or secret instead.

## 3. Secrets

Go to **Edge Functions → Secrets** and add these. Never share them in chat.

```
STRIPE_SECRET_KEY        sk_live_...
STRIPE_WEBHOOK_SECRET    whsec_...  (from step 4)
STRIPE_PRICE_PRO         the $8.99 price ID
STRIPE_PRICE_PLUS        the $15.99 price ID
MONIME_ACCESS_TOKEN      from Monime → Developers
MONIME_SPACE_ID          spc-k6WbE8dEk5g4mAdq9fsFYzoKk8h
MONIME_PRICE_PRO         20000
MONIME_PRICE_PLUS        40000
MONIME_WEBHOOK_SECRET    any long random text you make up
APP_URL                  https://juliusklahai.github.io/maestro-academy/
APP_ORIGIN               https://juliusklahai.github.io
```

## 4. Webhooks

- **Stripe:** go to Developers → Webhooks → Add endpoint.
  - URL: `https://doanokaruapkzzskwiuj.supabase.co/functions/v1/stripe-webhook`
  - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- **Monime:** add a webhook.
  - URL: `https://doanokaruapkzzskwiuj.supabase.co/functions/v1/monime-verify`
  - Event: `checkout_session.completed`
  - Header: `x-maestro-secret`, set to the same value as `MONIME_WEBHOOK_SECRET`.

## 5. Sign-in

1. Go to Authentication → URL Configuration.
   - Site URL: `https://juliusklahai.github.io/maestro-academy/`
   - Redirect URLs: add `https://juliusklahai.github.io/maestro-academy/**`
2. Optional: turn on Google under Authentication → Providers.

These files are generated from `supabase/functions` by `node scripts/bundle-functions.mjs`.
