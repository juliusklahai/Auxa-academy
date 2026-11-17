// Notifications: a daily practice reminder (Android app) and news from Auxa (everywhere).
// The Android app schedules both itself (Notify.kt), so they arrive even when the app is closed.
// In a browser, news shows in the app's news panel (and as a browser notification if allowed).
import { native, onNativeNotify } from './native/bridge';
import { ACCOUNTS_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './account/config';
import { supabase } from './account/store';

export interface News { id: number; title: string; body: string; created_at: string; published?: boolean }
export const canRemind = () => !!native?.notifyConfigure;

const SEEN = 'auxa.news.seen';
export const lastSeen = () => Number(localStorage.getItem(SEEN) ?? 0);
export function markSeen(id: number) { localStorage.setItem(SEEN, String(Math.max(lastSeen(), id))); native?.notifySeen?.(id); }

/** Apply the learner's notification settings to the Android app. */
export function applyNotify(s: { remindOn: boolean; remindTime: string; newsOn: boolean }) {
  if (!native?.notifyConfigure) return;
  const [h, m] = (s.remindTime || '18:00').split(':').map(Number);
  native.notifyConfigure(JSON.stringify({
    on: s.remindOn, hour: h || 0, minute: m || 0,
    title: 'Time to practise', body: 'A few minutes at the piano today keeps your streak going.',
    news: s.newsOn && ACCOUNTS_ENABLED, url: SUPABASE_URL, key: SUPABASE_ANON_KEY,
  }));
}

/** Ask for permission to show notifications (Android 13+ / browsers). */
export function askPermission(): Promise<boolean> {
  if (native?.notifyRequest) return new Promise((res) => { onNativeNotify(res); native!.notifyRequest!(); });
  if (typeof Notification !== 'undefined') return Notification.requestPermission().then((p) => p === 'granted');
  return Promise.resolve(false);
}
export function permission(): 'granted' | 'ask' | 'none' {
  if (native?.notifyStatus) return native.notifyStatus() === 'granted' ? 'granted' : 'ask';
  if (typeof Notification === 'undefined') return 'none';
  return Notification.permission === 'granted' ? 'granted' : 'ask';
}

/** Tell the reminder the learner practised today (no nudge needed). */
export function practisedToday() {
  const d = new Date();
  native?.notifyPractised?.(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

export async function fetchNews(all = false): Promise<News[]> {
  if (!ACCOUNTS_ENABLED) return [];
  const sb = await supabase();
  let q = sb.from('announcements').select('id,title,body,created_at,published').order('id', { ascending: false }).limit(30);
  if (!all) q = q.eq('published', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as News[];
}
export async function postNews(title: string, body: string) {
  const { error } = await (await supabase()).from('announcements').insert({ title, body });
  if (error) throw error;
}
export async function deleteNews(id: number) {
  const { error } = await (await supabase()).from('announcements').delete().eq('id', id);
  if (error) throw error;
}

/** Browser only: show news that arrived since the last visit as a notification (if allowed). */
export async function browserNewsCheck() {
  if (native || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = (await fetchNews()).filter((x) => x.id > lastSeen());
    for (const x of n.slice(0, 3).reverse()) new Notification(x.title, { body: x.body, icon: 'icon-192.png', tag: `news-${x.id}` });
  } catch { /* offline */ }
}
