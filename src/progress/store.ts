// Progress tracking, mastery gate (80%), required repeated passes, competency profile,
// and spaced-repetition review scheduling. Storage is injectable (localStorage in the app, memory in tests).

import type { AssessmentReport, Lesson, SkillId } from '../core/types';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export interface AttemptRecord { at: number; score: number; passed: boolean; components: Record<string, number | null> }
export interface ExerciseProgress { best: number; passes: number; attempts: AttemptRecord[]; reviewDue?: number; box: number }
export interface ProgressData {
  version: 1;
  exercises: Record<string, ExerciseProgress>;
  practiceLog: Record<string, number>; // yyyy-mm-dd -> seconds
  placementSkipped?: boolean;
  /** set by the placement test: lessons up to this level are open without the earlier ones */
  placedLevel?: number;
  /** certificates earned: level -> date (yyyy-mm-dd) */
  certs?: Record<string, string>;
}

const KEY = 'maestro.progress.v1';
const DAY = 86400000;
const LEITNER_DAYS = [1, 3, 7, 14, 30, 60];

export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export class ProgressStore {
  data: ProgressData;
  /** admin accounts: every lesson is open for testing */
  unlockAll = false;
  /** called after each save (account sync) */
  onSave: (() => void) | null = null;
  /** told about every finished attempt (the server witnesses it, see account/witness) */
  onRecord: ((r: AssessmentReport) => void) | null = null;
  constructor(private kv: KV) {
    this.data = this.load();
  }

  private load(): ProgressData {
    try {
      const raw = this.kv.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d.version === 1) return d; }
    } catch { /* corrupted: start fresh */ }
    return { version: 1, exercises: {}, practiceLog: {} };
  }

  save() { this.kv.setItem(KEY, JSON.stringify(this.data)); this.onSave?.(); }

  ex(id: string): ExerciseProgress {
    return this.data.exercises[id] ?? { best: 0, passes: 0, attempts: [], box: 0 };
  }

  record(report: AssessmentReport, now = Date.now()) {
    const p = this.ex(report.exerciseId);
    p.attempts = [...p.attempts.slice(-49), {
      at: now, score: report.score, passed: report.passed,
      components: Object.fromEntries(report.components.map((c) => [c.key, c.measured ? Math.round(c.score * 100) : null])),
    }];
    p.best = Math.max(p.best, report.score);
    if (report.passed) {
      p.passes += 1;
      p.box = Math.min(LEITNER_DAYS.length - 1, p.box + 1);
    } else {
      p.box = 0;
    }
    p.reviewDue = now + LEITNER_DAYS[p.box] * DAY;
    this.data.exercises[report.exerciseId] = p;
    this.save();
    this.onRecord?.(report);
  }

  logPractice(seconds: number, now = Date.now()) {
    const k = dayKey(now);
    this.data.practiceLog[k] = (this.data.practiceLog[k] ?? 0) + seconds;
    this.save();
  }

  exerciseMastered(id: string, requiredPasses: number): boolean {
    return this.ex(id).passes >= requiredPasses;
  }

  /** Core exercises all mastered, plus at least one play-along piece (when the lesson has them). */
  lessonComplete(lesson: Lesson): boolean {
    const core = lesson.exercises.filter((e) => !e.backing);
    const pieces = lesson.exercises.filter((e) => e.backing);
    return core.every((e) => this.exerciseMastered(e.id, e.requiredPasses)) && (!pieces.length || pieces.some((e) => this.exerciseMastered(e.id, e.requiredPasses)));
  }

  /** A required lesson unlocks only when every prerequisite lesson is mastered (>= 80% and required passes). */
  lessonUnlocked(lesson: Lesson, all: Lesson[]): boolean {
    if (this.unlockAll) return true;
    if (this.data.placedLevel !== undefined && (lesson.track ?? 'piano') === 'piano' && lesson.level <= this.data.placedLevel) return true;
    return lesson.prerequisites.every((pid) => {
      const pre = all.find((l) => l.id === pid);
      return pre ? this.lessonComplete(pre) : false;
    });
  }

  /** Competency per skill = mean of the latest 5 scores across exercises tagged with that skill. */
  competencies(all: Lesson[]): Partial<Record<SkillId, number>> {
    const bucket: Partial<Record<SkillId, number[]>> = {};
    for (const l of all) for (const e of l.exercises) {
      const recent = this.ex(e.id).attempts.slice(-5).map((a) => a.score);
      for (const s of e.skills) (bucket[s] ??= []).push(...recent);
    }
    const out: Partial<Record<SkillId, number>> = {};
    for (const [k, v] of Object.entries(bucket)) if (v && v.length) out[k as SkillId] = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    return out;
  }

  streak(now = Date.now()): number {
    let n = 0;
    for (let t = now; this.data.practiceLog[dayKey(t)]; t -= DAY) n++;
    if (n === 0 && this.data.practiceLog[dayKey(now - DAY)]) {
      for (let t = now - DAY; this.data.practiceLog[dayKey(t)]; t -= DAY) n++;
    }
    return n;
  }

  dueReviews(now = Date.now()): string[] {
    return Object.entries(this.data.exercises).filter(([, p]) => p.passes > 0 && (p.reviewDue ?? Infinity) <= now).map(([id]) => id);
  }

  reset() { this.data = { version: 1, exercises: {}, practiceLog: {} }; this.save(); }
}

const memoryKV = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
export function browserKV(): KV {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; } catch { return memoryKV(); }
}
export { memoryKV };
