// Account state: sign-in, plan (entitlement), progress sync and payments. Supabase is loaded only when
// accounts are configured, so the local/offline app stays light and works exactly as before.
import { useSyncExternalStore } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { progress } from '../ui/settings';
import { ACCOUNTS_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { entitlementFrom, LOCAL_ENTITLEMENT, type Entitlement } from './gate';
import { mergeProgress } from './merge';
import type { ProgressData } from '../progress/store';

export interface Profile { id: string; email: string; display_name: string | null; role: 'user' | 'admin' | 'teacher'; pro_until: string | null; plus_until: string | null; pro_source: string | null; stripe_status: string | null; progress: ProgressData | Record<string, never>; progress_updated_at: string | null }
export interface AccountState { ready: boolean; user: User | null; profile: Profile | null; ent: Entitlement; syncing: boolean; error: string }

const CACHE = 'maestro.account.v1';
let state: AccountState = { ready: !ACCOUNTS_ENABLED, user: null, profile: null, ent: LOCAL_ENTITLEMENT, syncing: false, error: '' };
const subs = new Set<() => void>();
const set = (p: Partial<AccountState>) => { state = { ...state, ...p }; progress.unlockAll = state.ent.admin; subs.forEach((f) => f()); };
export const getAccount = () => state;
export const useAccount = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, getAccount);

// Offline: the last known plan (an absolute paid-until date) is remembered on this device.
try {
  if (ACCOUNTS_ENABLED) {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    state = { ...state, ent: c ? entitlementFrom(c) : entitlementFrom(null) };
    progress.unlockAll = state.ent.admin;
  }
} catch { /* ignore */ }

let sbPromise: Promise<SupabaseClient> | null = null;
export function supabase(): Promise<SupabaseClient> {
  if (!ACCOUNTS_ENABLED) return Promise.reject(new Error('Accounts are not configured.'));
  sbPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }));
  return sbPromise;
}

async function loadProfile(user: User | null) {
  if (!user) { set({ user: null, profile: null, ent: entitlementFrom(null), ready: true }); localStorage.removeItem(CACHE); return; }
  const sb = await supabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) { set({ user, ready: true, error: error?.message ?? '' }); return; }
  const profile = data as Profile;
  const ent = entitlementFrom(profile);
  localStorage.setItem(CACHE, JSON.stringify({ role: profile.role, pro_until: profile.pro_until, plus_until: profile.plus_until }));
  set({ user, profile, ent, ready: true, error: '' });
  await syncProgress(profile);
}

/** Merge this device's progress with the account's, keep both up to date. */
async function syncProgress(profile: Profile) {
  set({ syncing: true });
  const merged = mergeProgress(progress.data, (profile.progress as ProgressData)?.version === 1 ? (profile.progress as ProgressData) : null);
  progress.data = merged;
  progress.save();
  await pushProgress();
  set({ syncing: false });
}
let pushTimer = 0;
async function pushProgress() {
  if (!state.user) return;
  const sb = await supabase();
  await sb.rpc('save_progress', { p: progress.data });
}
/** Called after every saved attempt: sync to the account a few seconds later (batched). */
export function progressChanged() {
  if (!ACCOUNTS_ENABLED || !state.user) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { void pushProgress().catch(() => { /* offline: next change retries */ }); }, 4000);
}

export async function initAccount() {
  if (!ACCOUNTS_ENABLED) return;
  progress.onSave = progressChanged;
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  await loadProfile(data.session?.user ?? null).catch((e) => set({ ready: true, error: String(e?.message ?? e) }));
  sb.auth.onAuthStateChange((_e, session) => { if ((session?.user?.id ?? null) !== (state.user?.id ?? null)) void loadProfile(session?.user ?? null); });
  // back from a payment page
  const q = new URLSearchParams(location.search);
  if (q.get('pro') === 'monime') { const id = localStorage.getItem('maestro.monime.pending'); if (id) await verifyMonime(id).catch(() => undefined); }
  if (q.get('pro')) { history.replaceState(null, '', location.pathname); setTimeout(() => void refreshProfile(), 2500); }
}
export const refreshProfile = async () => loadProfile((await (await supabase()).auth.getUser()).data.user ?? null);

export async function signInWithEmail(email: string) {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signInWithGoogle() {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { await (await supabase()).auth.signOut(); }

async function callFn(name: string, body: Record<string, unknown>) {
  const sb = await supabase();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) throw new Error((data as { error?: string })?.error ?? error.message);
  return data as { url?: string; id?: string; ok?: boolean; status?: string; error?: string };
}
/** Card subscription (Stripe) or mobile money pass (Monime): opens the provider's checkout page. */
export async function startCheckout(plan: string, provider: 'stripe' | 'monime') {
  const out = await callFn(provider === 'stripe' ? 'stripe-checkout' : 'monime-checkout', { plan });
  if (provider === 'monime' && out.id) localStorage.setItem('maestro.monime.pending', out.id);
  if (out.url) location.href = out.url;
}
export async function openBillingPortal() { const out = await callFn('stripe-portal', {}); if (out.url) location.href = out.url; }
export async function verifyMonime(id: string) {
  const out = await callFn('monime-verify', { id });
  if (out.ok) { localStorage.removeItem('maestro.monime.pending'); await refreshProfile(); }
  return out;
}

// ---------- admin ----------
export async function adminSearch(q: string) {
  const sb = await supabase();
  let query = sb.from('profiles').select('id,email,display_name,role,pro_until,plus_until,pro_source,stripe_status,created_at').order('created_at', { ascending: false }).limit(50);
  if (q.trim()) query = query.ilike('email', `%${q.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as (Profile & { created_at: string })[];
}
export async function adminGrant(email: string, days: number, tier: 'pro' | 'plus' = 'pro') { const { data, error } = await (await supabase()).rpc('admin_grant', { p_email: email, p_days: days, p_tier: tier }); if (error) throw error; return data as string; }
export async function adminSetRole(email: string, role: string) { const { error } = await (await supabase()).rpc('admin_set_role', { p_email: email, p_role: role }); if (error) throw error; }
export async function adminPayments() {
  const { data, error } = await (await supabase()).from('payments').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data as { id: number; user_id: string; provider: string; plan: string; amount_minor: number | null; currency: string | null; days_added: number | null; created_at: string }[];
}

// ---------- paywall ----------
let upgradeReason: string | null = null;
const upSubs = new Set<() => void>();
export const openUpgrade = (reason: string) => { upgradeReason = reason; upSubs.forEach((f) => f()); };
export const closeUpgrade = () => { upgradeReason = null; upSubs.forEach((f) => f()); };
export const useUpgrade = () => useSyncExternalStore((cb) => { upSubs.add(cb); return () => upSubs.delete(cb); }, () => upgradeReason);
