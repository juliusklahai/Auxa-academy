// Delete my account: removes the person's sign-in, profile and saved progress. App stores require that
// people can do this from inside the app. A card subscription is cancelled first so it stops charging.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Helpers kept inside this file so it can be pasted straight into the Supabase dashboard editor.
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-return-to',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
async function caller(req: Request) {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

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
  // profile photos in avatars/<id>/
  const { data: pics } = await db.storage.from('avatars').list(user.id, { limit: 100 });
  if (pics?.length) await db.storage.from('avatars').remove(pics.map((p) => `${user.id}/${p.name}`));
  // the profile (with saved progress and the People card) goes with the sign-in; payment records stay for accounting, unlinked
  await db.from('profiles').delete().eq('id', user.id);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
