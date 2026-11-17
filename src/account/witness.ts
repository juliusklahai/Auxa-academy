// Server-witnessed attempts (migration 0008). When an exercise starts, the server hands out a one-use
// ticket with its own clock; when the result is recorded, the ticket goes back with the score. The server
// decides whether it counts as a verified pass (enough real time, pass mark, enough notes played).
// Offline (or signed out): the result is kept on the phone and sent when the app is back online and
// signed in (migration 0010). The server checks it and counts it once the lesson has one online pass.
import type { AssessmentReport } from '../core/types';
import { progress } from '../ui/settings';
import { ACCOUNTS_ENABLED } from './config';
import { getAccount, supabase } from './store';

const tickets = new Map<string, Promise<string | null>>();
/** attempts started while offline: when (wall clock) */
const offlineStarts = new Map<string, number>();
const QUEUE = 'auxa.offlineAttempts.v1';
interface OfflineAttempt { exercise: string; score: number; passed: boolean; hits: number; ms: number; at: string }
const readQueue = (): OfflineAttempt[] => { try { return JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as OfflineAttempt[]; } catch { return []; } };
const writeQueue = (q: OfflineAttempt[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-500))); } catch { /* storage full */ } };
/** passes waiting on this phone to be sent */
export const pendingOffline = () => readQueue().length;
const live = () => ACCOUNTS_ENABLED && !!getAccount().user && (typeof navigator === 'undefined' || navigator.onLine !== false);

/** An exercise attempt is starting (or restarting). */
export function witnessStart(exerciseId: string) {
  if (!ACCOUNTS_ENABLED) return;
  if (!live()) { tickets.delete(exerciseId); offlineStarts.set(exerciseId, Date.now()); return; }
  offlineStarts.delete(exerciseId);
  tickets.set(exerciseId, supabase()
    .then((sb) => sb.rpc('start_attempt', { p_exercise: exerciseId }))
    .then(({ data, error }) => (error ? null : (data as string | null)))
    .catch(() => null));
}

/** An attempt finished: hand the ticket back with the result. */
export function witnessFinish(r: AssessmentReport) {
  const off = offlineStarts.get(r.exerciseId);
  if (off !== undefined) {
    offlineStarts.delete(r.exerciseId);
    // only passes are worth keeping; the server checks them again
    if (r.passed) writeQueue([...readQueue(), { exercise: r.exerciseId, score: Math.round(r.score), passed: true, hits: r.correct + r.partial, ms: Date.now() - off, at: new Date().toISOString() }]);
    return;
  }
  const t = tickets.get(r.exerciseId);
  if (!t) return;
  tickets.delete(r.exerciseId);
  void t.then(async (token) => {
    if (!token) return;
    const sb = await supabase();
    await sb.rpc('finish_attempt', { p_token: token, p_score: Math.round(r.score), p_passed: r.passed, p_hits: r.correct + r.partial });
  }).catch(() => { /* offline: the device keeps its own progress */ });
}

export interface LevelCheck { exercise_id: string; lesson_id: string; piece: boolean; required: number; passes: number; offline?: number; witnessed?: boolean }
/** What still needs a verified pass in a level (for the certificate sheet). */
export async function levelVerification(level: number): Promise<LevelCheck[]> {
  if (!live()) return [];
  await flushOffline();
  const sb = await supabase();
  const { data, error } = await sb.rpc('level_verification', { p_level: level });
  return error ? [] : ((data ?? []) as LevelCheck[]);
}

/** Send passes kept while offline (when online and signed in). */
let flushing = false;
export async function flushOffline() {
  if (flushing || !live()) return;
  const q = readQueue();
  if (!q.length) return;
  flushing = true;
  try {
    const sb = await supabase();
    for (let i = 0; i < q.length; i += 200) {
      const { error } = await sb.rpc('submit_offline_attempts', { p: q.slice(i, i + 200) });
      if (error) throw error;
    }
    // keep anything recorded while sending
    writeQueue(readQueue().slice(q.length));
  } catch { /* try again later */ } finally { flushing = false; }
}

progress.onRecord = witnessFinish;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { setTimeout(() => void flushOffline(), 1500); });
  setTimeout(() => void flushOffline(), 6000);
}
