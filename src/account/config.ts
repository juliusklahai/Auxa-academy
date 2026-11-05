// Account and payments configuration, from build-time environment variables (.env, never secrets).
// With no Supabase URL the app runs exactly as before: local only, everything unlocked.
import type { Tier } from './gate';
const env = import.meta.env as Record<string, string | undefined>;
export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';
export const ACCOUNTS_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export type PlanId = 'pro' | 'plus' | 'pass_pro' | 'pass_plus';
export interface PlanOption { id: PlanId; tier: Exclude<Tier, 'free'>; provider: 'stripe' | 'monime'; title: string; price: string; note: string; best?: boolean }
/** Prices shown to people. The real amounts live in Stripe and in the server secrets. */
export const PLANS: PlanOption[] = [
  { id: 'pro', tier: 'pro', provider: 'stripe', title: 'Pro', price: env.VITE_PRICE_PRO_LABEL ?? 'Pro', note: 'Card, renews monthly. Cancel any time.' },
  { id: 'plus', tier: 'plus', provider: 'stripe', title: 'Plus', price: env.VITE_PRICE_PLUS_LABEL ?? 'Plus', note: 'Card, renews monthly. Cancel any time.', best: true },
  { id: 'pass_pro', tier: 'pro', provider: 'monime', title: 'Pro, 1 month', price: env.VITE_PRICE_PASS_PRO_LABEL ?? 'Pro pass', note: 'Orange Money, Afrimoney, bank or card. No auto-renewal.' },
  { id: 'pass_plus', tier: 'plus', provider: 'monime', title: 'Plus, 1 month', price: env.VITE_PRICE_PASS_PLUS_LABEL ?? 'Plus pass', note: 'Orange Money, Afrimoney, bank or card. No auto-renewal.', best: true },
];
export const MONIME_ENABLED = env.VITE_MONIME_ENABLED !== 'false';
