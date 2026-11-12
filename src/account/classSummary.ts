// Class types, codes, and the teacher's summary of a learner (no account or browser imports).
import { ProgressStore, type ProgressData } from '../progress/store';
import { PIANO_LESSONS, lessonById } from '../curriculum/lessons';

export interface ClassRow { id: string; owner: string; name: string; code: string; created_at: string }
export interface Assignment { id: string; class_id: string; lesson_id: string; note: string | null; due: string | null; created_at: string }
export interface Student {
  user_id: string; name: string; joined_at: string; updated: string | null;
  done: number; level: number; weekMinutes: number; last: string | null; streak: number;
  /** assignment id -> lesson mastered */
  finished: Record<string, boolean>;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = (rnd = Math.random) => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)]).join('');

/** Turn a member's saved progress into the few numbers a teacher needs. */
export function summarize(raw: unknown, assignments: Assignment[], now = Date.now()): Omit<Student, 'user_id' | 'name' | 'joined_at' | 'updated'> {
  const m = new Map<string, string>();
  const p = new ProgressStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
  const d = raw as ProgressData;
  if (d && d.version === 1) p.data = { ...d, exercises: d.exercises ?? {}, practiceLog: d.practiceLog ?? {} };
  const done = PIANO_LESSONS.filter((l) => p.lessonComplete(l)).length;
  const next = PIANO_LESSONS.find((l) => !p.lessonComplete(l));
  const days = Object.keys(p.data.practiceLog).filter((k) => p.data.practiceLog[k] > 0).sort();
  const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const weekMinutes = Math.round(Object.entries(p.data.practiceLog).filter(([k]) => k >= weekAgo).reduce((a, [, s]) => a + s, 0) / 60);
  const finished: Record<string, boolean> = {};
  for (const a of assignments) { const l = lessonById(a.lesson_id); finished[a.id] = !!l && p.lessonComplete(l); }
  return { done, level: next?.level ?? 14, weekMinutes, last: days[days.length - 1] ?? null, streak: p.streak(now), finished };
}

