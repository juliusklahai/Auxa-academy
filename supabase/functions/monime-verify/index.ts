// Confirms Monime payments and credits 31 days of Pro or Plus. Called two ways:
//  1. By Monime's webhook (checkout_session.completed / payment events) with our shared secret header.
//  2. By the app when the learner returns from checkout (signed in), as a fallback if the webhook is late.
// We never trust the payload: the checkout session is re-read from Monime's API with our secret token,
// and it must be "completed" with our metadata. Each session can be credited only once.
import { admin, caller, cors, json } from '../_shared/util.ts';

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
