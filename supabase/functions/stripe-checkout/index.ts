// Start a Stripe Checkout for Pro Monthly or Pro Yearly (real auto-renewing subscriptions).
import Stripe from 'npm:stripe@17';
import { admin, APP_URL, caller, cors, json } from '../_shared/util.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const PRICES: Record<string, string | undefined> = { monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'), yearly: Deno.env.get('STRIPE_PRICE_YEARLY') };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const { plan } = await req.json().catch(() => ({}));
  const price = PRICES[plan];
  if (!price) return json({ error: 'Unknown plan.' }, 400);
  const db = admin();
  const { data: prof } = await db.from('profiles').select('stripe_customer_id,email').eq('id', user.id).single();
  let customer = prof?.stripe_customer_id as string | null;
  if (!customer) {
    customer = (await stripe.customers.create({ email: prof?.email ?? user.email, metadata: { user_id: user.id } })).id;
    await db.from('profiles').update({ stripe_customer_id: customer }).eq('id', user.id);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id, plan } }, allow_promotion_codes: true,
    success_url: `${APP_URL()}?pro=success`, cancel_url: `${APP_URL()}?pro=cancel`,
  });
  return json({ url: session.url });
});
