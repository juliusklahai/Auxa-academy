// Account and payments configuration, from build-time environment variables (.env, never secrets).
// With no Supabase URL the app runs exactly as before: local only, everything unlocked.
const env = import.meta.env as Record<string, string | undefined>;
export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';
export const ACCOUNTS_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export interface PlanOption { id: 'monthly' | 'yearly' | 'pass_1m' | 'pass_12m'; provider: 'stripe' | 'monime'; title: string; price: string; note: string; best?: boolean }
/** Prices shown to people. The real amounts live in Stripe and in the server secrets. */
export const PLANS: PlanOption[] = [
  { id: 'monthly', provider: 'stripe', title: 'Monthly', price: env.VITE_PRICE_MONTHLY_LABEL ?? 'Monthly', note: 'Card. Renews every month, cancel any time.' },
  { id: 'yearly', provider: 'stripe', title: 'Yearly', price: env.VITE_PRICE_YEARLY_LABEL ?? 'Yearly', note: 'Card. Renews every year, cancel any time.', best: true },
  { id: 'pass_1m', provider: 'monime', title: '1 month pass', price: env.VITE_PRICE_PASS_1M_LABEL ?? '1 month', note: 'Orange Money, Afrimoney, bank or card (Monime). No auto-renewal.' },
  { id: 'pass_12m', provider: 'monime', title: '12 month pass', price: env.VITE_PRICE_PASS_12M_LABEL ?? '12 months', note: 'Mobile money, bank or card (Monime). No auto-renewal.' },
];
export const MONIME_ENABLED = env.VITE_MONIME_ENABLED !== 'false';
