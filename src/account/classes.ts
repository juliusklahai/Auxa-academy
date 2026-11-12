// Classes for teachers and learners: create a class, share its code, assign lessons, follow progress.
import { useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED } from './config';
import { getAccount, supabase } from './store';
import { LESSONS } from '../curriculum/lessons';

export * from './classSummary';
import { newCode, summarize, type Assignment, type ClassRow, type Student } from './classSummary';

// ---------- data ----------
export async function myClasses(): Promise<{ teaching: ClassRow[]; joined: ClassRow[] }> {
  if (!ACCOUNTS_ENABLED) return SAMPLE_CLASSES;
  const me = getAccount().user?.id;
  if (!me) return { teaching: [], joined: [] };
  const sb = await supabase();
  const { data, error } = await sb.from('classes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const all = (data ?? []) as ClassRow[];
  return { teaching: all.filter((c) => c.owner === me), joined: all.filter((c) => c.owner !== me) };
}
export async function createClass(name: string): Promise<ClassRow> {
  const me = getAccount().user?.id;
  if (!me) throw new Error('Please sign in first.');
  const sb = await supabase();
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from('classes').insert({ owner: me, name: name.trim().slice(0, 60), code: newCode() }).select().single();
    if (!error) return data as ClassRow;
    if (!/duplicate|unique/i.test(error.message)) throw new Error(/row-level|policy/i.test(error.message) ? 'Making classes is part of the Plus plan (or a teacher account).' : error.message);
  }
  throw new Error('Could not make a class code. Please try again.');
}
export async function deleteClass(id: string) { const sb = await supabase(); const { error } = await sb.from('classes').delete().eq('id', id); if (error) throw error; }
export async function joinClass(code: string): Promise<{ id: string; name: string }> {
  const sb = await supabase();
  const { data, error } = await sb.rpc('join_class', { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string }[])[0];
}
export async function leaveClass(id: string) {
  const me = getAccount().user?.id; if (!me) return;
  const sb = await supabase(); const { error } = await sb.from('class_members').delete().eq('class_id', id).eq('user_id', me); if (error) throw error;
}
export async function removeStudent(classId: string, userId: string) {
  const sb = await supabase(); const { error } = await sb.from('class_members').delete().eq('class_id', classId).eq('user_id', userId); if (error) throw error;
}
export async function assignments(classId: string): Promise<Assignment[]> {
  if (!ACCOUNTS_ENABLED) return SAMPLE_ASSIGN.filter((a) => a.class_id === classId);
  const sb = await supabase();
  const { data, error } = await sb.from('assignments').select('*').eq('class_id', classId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Assignment[];
}
export async function assign(classId: string, lessonId: string, note: string, due: string | null) {
  const sb = await supabase();
  const { error } = await sb.from('assignments').insert({ class_id: classId, lesson_id: lessonId, note: note.trim().slice(0, 200) || null, due: due || null });
  if (error) throw error;
}
export async function unassign(id: string) { const sb = await supabase(); const { error } = await sb.from('assignments').delete().eq('id', id); if (error) throw error; }
export async function roster(classId: string, list: Assignment[]): Promise<Student[]> {
  if (!ACCOUNTS_ENABLED) return SAMPLE_ROSTER(list);
  const sb = await supabase();
  const { data, error } = await sb.rpc('class_roster', { p_class: classId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string; name: string; joined_at: string; progress: unknown; progress_updated_at: string | null }[])
    .map((r) => ({ user_id: r.user_id, name: r.name, joined_at: r.joined_at, updated: r.progress_updated_at, ...summarize(r.progress, list) }));
}

/** Small loader hook: reload() after changes. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [v, setV] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => { let live = true; setErr(''); fn().then((x) => live && setV(x)).catch((e) => live && setErr(String(e?.message ?? e))); return () => { live = false; }; }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { value: v, error: err, reload: () => setN((x) => x + 1) };
}

// ---------- preview builds without accounts ----------
const SAMPLE_CLASSES = {
  teaching: [{ id: 'c1', owner: 'me', name: 'Saturday youth keyboard', code: 'K7M2QX', created_at: '2026-10-01T10:00:00Z' }],
  joined: [{ id: 'c2', owner: 't', name: 'St. George choir pianists', code: 'H4P8RT', created_at: '2026-09-12T10:00:00Z' }],
};
const SAMPLE_ASSIGN: Assignment[] = [
  { id: 'a1', class_id: 'c1', lesson_id: 'L1-6', note: 'Say the rhythm words out loud!', due: '2026-11-20', created_at: '2026-11-10T10:00:00Z' },
  { id: 'a2', class_id: 'c1', lesson_id: 'L1-7', note: null, due: null, created_at: '2026-11-08T10:00:00Z' },
  { id: 'a3', class_id: 'c2', lesson_id: 'C13-1', note: 'For Sunday: Old Hundredth, tune and bass.', due: '2026-11-15', created_at: '2026-11-09T10:00:00Z' },
];
const SAMPLE_ROSTER = (list: Assignment[]): Student[] => [
  ['Aminata K.', 14, 2, 95, '2026-11-12', 6],
  ['Daniel O.', 9, 1, 40, '2026-11-10', 2],
  ['Grace B.', 22, 3, 130, '2026-11-12', 11],
  ['Mohamed S.', 4, 0, 0, '2026-11-02', 0],
].map(([name, done, level, wk, last, streak], i) => ({
  user_id: `u${i}`, name: name as string, joined_at: '2026-10-02T10:00:00Z', updated: null, done: done as number, level: level as number,
  weekMinutes: wk as number, last: last as string, streak: streak as number,
  finished: Object.fromEntries(list.map((a, k) => [a.id, (i + k) % 3 !== 1])),
}));
export const lessonsForPicker = () => LESSONS;
