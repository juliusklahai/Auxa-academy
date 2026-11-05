// Stripe's hosted page where subscribers change plan, update the card or cancel.
import Stripe from 'npm:stripe@17';
import { admin, APP_URL, caller, cors, json } from '../_shared/util.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-02-24.acacia' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const { data: prof } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).single();
  if (!prof?.stripe_customer_id) return json({ error: 'No card subscription on this account.' }, 400);
  const s = await stripe.billingPortal.sessions.create({ customer: prof.stripe_customer_id, return_url: APP_URL(req) });
  return json({ url: s.url });
});
