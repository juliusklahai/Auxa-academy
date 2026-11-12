// Delete my account: removes the person's sign-in, profile and saved progress. App stores require that
// people can do this from inside the app. A card subscription is cancelled first so it stops charging.
import Stripe from 'npm:stripe@17';
import { admin, caller, cors, json } from '../_shared/util.ts';

const key = Deno.env.get('STRIPE_SECRET_KEY');
const stripe = key ? new Stripe(key, { apiVersion: '2025-02-24.acacia' }) : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const db = admin();
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  if (stripe && prof?.stripe_customer_id) {
    const subs = await stripe.subscriptions.list({ customer: prof.stripe_customer_id, status: 'all', limit: 20 });
    for (const s of subs.data) if (['active', 'trialing', 'past_due', 'unpaid'].includes(s.status)) await stripe.subscriptions.cancel(s.id);
  }
  // the profile (with saved progress) goes with the sign-in; payment records stay for accounting, unlinked
  await db.from('profiles').delete().eq('id', user.id);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
