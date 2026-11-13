// stripe-webhook: paste this whole file into Supabase → Edge Functions → stripe-webhook (generated, do not edit here)
// Stripe tells us about subscription changes. The paid period (+ 2 days grace) goes to pro_until or
// plus_until depending on which price the subscription is on (so portal upgrades/downgrades just work).
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---- shared helpers ----
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-return-to',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Service-role client: bypasses row level security. Server only. */
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** The signed-in user calling the function (from the Authorization header). */
async function caller(req: Request) {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

const BASE_URL = Deno.env.get('APP_URL') ?? 'https://juliusklahai.github.io/Auxa-Academy/';
/** Where to send people back to: the page they came from (live or /preview/), but only inside our own site. */
const APP_URL = (req?: Request) => {
  const r = req?.headers.get('x-return-to') ?? '';
  return r.startsWith(BASE_URL) && !r.includes('?') ? r : BASE_URL;
};

// ---- function ----
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-02-24.acacia' });
const crypto = Stripe.createSubtleCryptoProvider();
const PLUS_PRICE = Deno.env.get('STRIPE_PRICE_PLUS');

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature') ?? '';
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto);
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }
  const db = admin();
  const sync = async (subId: string) => {
    const sub = await stripe.subscriptions.retrieve(subId);
    const userId = sub.metadata.user_id;
    if (!userId) return;
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    const end = new Date((sub.current_period_end + 2 * 86400) * 1000).toISOString();
    const tier = sub.items.data.some((i) => i.price.id === PLUS_PRICE) ? 'plus' : 'pro';
    const { data: prof } = await db.from('profiles').select('stripe_tier').eq('id', userId).single();
    const dates: Record<string, string> = tier === 'plus' ? { plus_until: end } : { pro_until: end };
    // card downgrade Plus -> Pro: Plus ends now (Stripe prorates the money). Mobile money passes are untouched.
    if (tier === 'pro' && prof?.stripe_tier === 'plus') dates.plus_until = new Date().toISOString();
    await db.from('profiles').update({
      stripe_subscription_id: sub.id, stripe_status: sub.status, stripe_tier: tier,
      ...(active ? { ...dates, pro_source: 'stripe' } : {}),
    }).eq('id', userId);
  };
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) await sync(String(s.subscription));
      break;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription) {
        await sync(String(inv.subscription));
        const sub = await stripe.subscriptions.retrieve(String(inv.subscription));
        await db.from('payments').upsert({ user_id: sub.metadata.user_id, provider: 'stripe', external_id: inv.id, plan: sub.items.data.some((i) => i.price.id === PLUS_PRICE) ? 'plus' : 'pro', amount_minor: inv.amount_paid, currency: inv.currency }, { onConflict: 'provider,external_id', ignoreDuplicates: true });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await sync((event.data.object as Stripe.Subscription).id);
      break;
  }
  return new Response('ok');
});
