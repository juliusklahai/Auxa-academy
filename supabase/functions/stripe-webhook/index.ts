// Stripe tells us about subscription changes; pro_until follows the paid period (+ 2 days grace).
import Stripe from 'npm:stripe@17';
import { admin } from '../_shared/util.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature') ?? '';
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto);
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }
  const db = admin();
  const sync = async (subId: string) => {
    const sub = await stripe.subscriptions.retrieve(subId);
    const userId = sub.metadata.user_id;
    if (!userId) return;
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    const end = new Date((sub.current_period_end + 2 * 86400) * 1000).toISOString();
    await db.from('profiles').update({
      stripe_subscription_id: sub.id, stripe_status: sub.status,
      ...(active ? { pro_until: end, pro_source: 'stripe' } : {}),
    }).eq('id', userId);
  };
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) await sync(String(s.subscription));
      break;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription) {
        await sync(String(inv.subscription));
        const sub = await stripe.subscriptions.retrieve(String(inv.subscription));
        await db.from('payments').upsert({ user_id: sub.metadata.user_id, provider: 'stripe', external_id: inv.id, plan: sub.metadata.plan ?? 'subscription', amount_minor: inv.amount_paid, currency: inv.currency }, { onConflict: 'provider,external_id', ignoreDuplicates: true });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await sync((event.data.object as Stripe.Subscription).id);
      break;
  }
  return new Response('ok');
});
