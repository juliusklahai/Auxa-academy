// monime-verify: paste this whole file into Supabase → Edge Functions → monime-verify (generated, do not edit here)
// Confirms Monime payments and credits 31 days of Pro or Plus. Called two ways:
//  1. By Monime's webhook (checkout_session.completed / payment events) with our shared secret header.
//  2. By the app when the learner returns from checkout (signed in), as a fallback if the webhook is late.
// We never trust the payload: the checkout session is re-read from Monime's API with our secret token,
// and it must be "completed" with our metadata. Each session can be credited only once.
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
const DAYS: Record<string, number> = { pass_pro: 31, pass_plus: 31 };
const TIER: Record<string, string> = { pass_pro: 'pro', pass_plus: 'plus' };
const H = () => ({ Authorization: `Bearer ${Deno.env.get('MONIME_ACCESS_TOKEN')}`, 'Monime-Space-Id': Deno.env.get('MONIME_SPACE_ID')! });

async function credit(sessionId: string, expectUser?: string) {
  const r = await fetch(`https://api.monime.io/v1/checkout-sessions/${encodeURIComponent(sessionId)}`, { headers: H() });
  const s = (await r.json().catch(() => null))?.result;
  if (!s || s.status !== 'completed') return { ok: false, status: s?.status ?? 'unknown' };
  const userId = s.metadata?.user_id, plan = s.metadata?.plan;
  if (!userId || !DAYS[plan] || (expectUser && expectUser !== userId)) return { ok: false, status: 'mismatch' };
  const db = admin();
  const amount = (s.lineItems?.data ?? s.lineItems ?? []).reduce((a: number, li: { price?: { value?: number }; quantity?: number }) => a + (li.price?.value ?? 0) * (li.quantity ?? 1), 0);
  const { error } = await db.from('payments').insert({ user_id: userId, provider: 'monime', external_id: s.id, plan, amount_minor: amount || null, currency: 'SLE', days_added: DAYS[plan] });
  if (error) return { ok: true, status: 'already credited' }; // unique(provider, external_id)
  await db.rpc('extend_pro', { p_user: userId, p_days: DAYS[plan], p_source: 'monime', p_tier: TIER[plan] });
  return { ok: true, status: 'credited' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  // webhook: Monime sends our custom header (set when creating the webhook)
  if (req.headers.get('x-maestro-secret') && req.headers.get('x-maestro-secret') === Deno.env.get('MONIME_WEBHOOK_SECRET')) {
    const id = body?.object?.type === 'checkout_session' || String(body?.event?.name ?? '').startsWith('checkout_session') ? body?.object?.id : body?.data?.checkoutSessionId ?? body?.object?.id;
    if (id) await credit(String(id));
    return new Response('ok');
  }
  // app fallback: the signed-in learner asks us to check their latest session
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  if (!body?.id) return json({ error: 'Missing session id.' }, 400);
  return json(await credit(String(body.id), user.id));
});
