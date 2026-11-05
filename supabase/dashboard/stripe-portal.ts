// stripe-portal: paste this whole file into Supabase → Edge Functions → stripe-portal (generated, do not edit here)
// Stripe's hosted page where subscribers change plan, update the card or cancel.
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

const BASE_URL = Deno.env.get('APP_URL') ?? 'https://juliusklahai.github.io/maestro-academy/';
/** Where to send people back to: the page they came from (live or /preview/), but only inside our own site. */
const APP_URL = (req?: Request) => {
  const r = req?.headers.get('x-return-to') ?? '';
  return r.startsWith(BASE_URL) && !r.includes('?') ? r : BASE_URL;
};

// ---- function ----
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
