// Server-witnessed attempts (migration 0008). When an exercise starts, the server hands out a one-use
// ticket with its own clock; when the result is recorded, the ticket goes back with the score. The server
// decides whether it counts as a verified pass (enough real time, pass mark, enough notes played).
// Offline or signed out: nothing happens, progress on the device works as before.
import type { AssessmentReport } from '../core/types';
import { progress } from '../ui/settings';
import { ACCOUNTS_ENABLED } from './config';
import { getAccount, supabase } from './store';

const tickets = new Map<string, Promise<string | null>>();
const live = () => ACCOUNTS_ENABLED && !!getAccount().user && (typeof navigator === 'undefined' || navigator.onLine !== false);

/** An exercise attempt is starting (or restarting). */
export function witnessStart(exerciseId: string) {
  if (!live()) return;
  tickets.set(exerciseId, supabase()
    .then((sb) => sb.rpc('start_attempt', { p_exercise: exerciseId }))
    .then(({ data, error }) => (error ? null : (data as string | null)))
    .catch(() => null));
}

/** An attempt finished: hand the ticket back with the result. */
export function witnessFinish(r: AssessmentReport) {
  const t = tickets.get(r.exerciseId);
  if (!t) return;
  tickets.delete(r.exerciseId);
  void t.then(async (token) => {
    if (!token) return;
    const sb = await supabase();
    await sb.rpc('finish_attempt', { p_token: token, p_score: Math.round(r.score), p_passed: r.passed, p_hits: r.correct + r.partial });
  }).catch(() => { /* offline: the device keeps its own progress */ });
}

export interface LevelCheck { exercise_id: string; lesson_id: string; piece: boolean; required: number; passes: number }
/** What still needs a verified pass in a level (for the certificate sheet). */
export async function levelVerification(level: number): Promise<LevelCheck[]> {
  if (!live()) return [];
  const sb = await supabase();
  const { data, error } = await sb.rpc('level_verification', { p_level: level });
  return error ? [] : ((data ?? []) as LevelCheck[]);
}

progress.onRecord = witnessFinish;
