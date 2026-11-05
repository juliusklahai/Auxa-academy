// Start a Stripe Checkout for Pro or Plus (monthly, auto-renewing). If the person already has an active
// card subscription, switch its price instead (upgrade or downgrade, prorated) so nobody pays twice.
import Stripe from 'npm:stripe@17';
import { admin, APP_URL, caller, cors, json } from '../_shared/util.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-02-24.acacia' });
const PRICES: Record<string, string | undefined> = { pro: Deno.env.get('STRIPE_PRICE_PRO'), plus: Deno.env.get('STRIPE_PRICE_PLUS') };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const { plan } = await req.json().catch(() => ({}));
  const price = PRICES[plan];
  if (!price) return json({ error: 'Unknown plan.' }, 400);
  const db = admin();
  const { data: prof } = await db.from('profiles').select('stripe_customer_id,stripe_subscription_id,email').eq('id', user.id).single();

  if (prof?.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(prof.stripe_subscription_id).catch(() => null);
    if (sub && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      const item = sub.items.data[0];
      if (item.price.id !== price) {
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price }], proration_behavior: 'always_invoice', cancel_at_period_end: false,
          metadata: { ...sub.metadata, plan },
        });
      }
      return json({ url: `${APP_URL(req)}?pro=success` }); // the webhook updates the plan
    }
  }

  let customer = prof?.stripe_customer_id as string | null;
  if (!customer) {
    customer = (await stripe.customers.create({ email: prof?.email ?? user.email, metadata: { user_id: user.id } })).id;
    await db.from('profiles').update({ stripe_customer_id: customer }).eq('id', user.id);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id, plan } }, allow_promotion_codes: true,
    success_url: `${APP_URL(req)}?pro=success`, cancel_url: `${APP_URL(req)}?pro=cancel`,
  });
  return json({ url: session.url });
});
