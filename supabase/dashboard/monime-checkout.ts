// monime-checkout: paste this whole file into Supabase → Edge Functions → monime-checkout (generated, do not edit here)
// Mobile money / local card payment through Monime: buys a 1-month Pro or Plus pass (no auto-renewal).
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

const BASE_URL = Deno.env.get('APP_URL') ?? 'https://juliusklahai.github.io/Auxa-academy/';
/** Where to send people back to: the page they came from (live or /preview/), but only inside our own site. */
const APP_URL = (req?: Request) => {
  const r = req?.headers.get('x-return-to') ?? '';
  return r.startsWith(BASE_URL) && !r.includes('?') ? r : BASE_URL;
};

// ---- function ----
const PASSES: Record<string, { name: string; env: string }> = {
  pass_pro: { name: 'Auxa Pro, 1 month', env: 'MONIME_PRICE_PRO' },
  pass_plus: { name: 'Auxa Plus, 1 month', env: 'MONIME_PRICE_PLUS' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const { plan } = await req.json().catch(() => ({}));
  const pass = PASSES[plan];
  const value = Number(Deno.env.get(pass?.env ?? '') ?? NaN); // in minor units of SLE (100 = SLE 1)
  if (!pass || !Number.isFinite(value)) return json({ error: 'Unknown plan.' }, 400);
  const res = await fetch('https://api.monime.io/v1/checkout-sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('MONIME_ACCESS_TOKEN')}`,
      'Monime-Space-Id': Deno.env.get('MONIME_SPACE_ID')!,
      'Idempotency-Key': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: pass.name,
      reference: `${user.id}:${plan}`.slice(0, 255),
      lineItems: [{ type: 'custom', name: pass.name, price: { currency: 'SLE', value }, quantity: 1 }],
      successUrl: `${APP_URL(req)}?pro=monime`,
      cancelUrl: `${APP_URL(req)}?pro=cancel`,
      metadata: { user_id: user.id, plan },
    }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.result?.redirectUrl) return json({ error: 'Monime could not start the payment.', detail: out?.messages ?? null }, 502);
  return json({ url: out.result.redirectUrl, id: out.result.id });
});
