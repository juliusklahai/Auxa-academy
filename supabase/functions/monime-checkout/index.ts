// Mobile money / local card payment through Monime: buys a 1-month or 12-month Pro pass.
import { APP_URL, caller, cors, json } from '../_shared/util.ts';

const PASSES: Record<string, { name: string; days: number; env: string }> = {
  pass_1m: { name: 'Maestro Pro, 1 month', days: 31, env: 'MONIME_PRICE_1M' },
  pass_12m: { name: 'Maestro Pro, 12 months', days: 366, env: 'MONIME_PRICE_12M' },
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
      successUrl: `${APP_URL()}?pro=monime`,
      cancelUrl: `${APP_URL()}?pro=cancel`,
      metadata: { user_id: user.id, plan },
    }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.result?.redirectUrl) return json({ error: 'Monime could not start the payment.', detail: out?.messages ?? null }, 502);
  return json({ url: out.result.redirectUrl, id: out.result.id });
});
