import { ProgressStore, memoryKV } from '../src/progress/store';
import { LESSONS } from '../src/curriculum/lessons';
import type { AssessmentReport } from '../src/core/types';

const rep = (id: string, score: number, passed = score >= 80): AssessmentReport => ({
  exerciseId: id, score, grade: '', passed, components: [], correct: 0, partial: 0, wrong: 0, missed: 0, extra: 0,
  uncertainIgnored: 0, problemEvents: [], advice: [], hadThreeConsecutive: false,
});
const L1 = LESSONS[0], L2 = LESSONS[1];

describe('Test 4 (progression): 80% mastery gate', () => {
  it('first lesson is open, the next is locked', () => {
    const p = new ProgressStore(memoryKV());
    expect(p.lessonUnlocked(L1, LESSONS)).toBe(true);
    expect(p.lessonUnlocked(L2, LESSONS)).toBe(false);
  });
  it('scores below 80 never unlock the next lesson', () => {
    const p = new ProgressStore(memoryKV());
    for (const e of L1.exercises) for (let i = 0; i < 5; i++) p.record(rep(e.id, 79.9, false));
    expect(p.lessonUnlocked(L2, LESSONS)).toBe(false);
  });
  it('foundational exercises need repeated passes', () => {
    const p = new ProgressStore(memoryKV());
    const [a, b] = L1.exercises; // a requires 2 passes
    p.record(rep(a.id, 90)); p.record(rep(b.id, 90));
    expect(p.lessonUnlocked(L2, LESSONS)).toBe(false);
    p.record(rep(a.id, 85));
    expect(p.lessonUnlocked(L2, LESSONS)).toBe(true);
  });
});

describe('Test 10: progress persistence', () => {
  it('survives closing and reopening (same storage)', () => {
    const kv = memoryKV();
    const p1 = new ProgressStore(kv);
    p1.record(rep('L0-1-a', 92));
    p1.logPractice(300);
    const p2 = new ProgressStore(kv);
    expect(p2.ex('L0-1-a').best).toBe(92);
    expect(p2.ex('L0-1-a').passes).toBe(1);
    expect(p2.streak()).toBe(1);
  });
  it('recovers from corrupted storage', () => {
    const kv = memoryKV(); kv.setItem('maestro.progress.v1', '{oops');
    expect(new ProgressStore(kv).data.exercises).toEqual({});
  });
});

describe('Spaced repetition and competencies', () => {
  it('schedules review and resets interval after a failure', () => {
    const p = new ProgressStore(memoryKV());
    const now = Date.UTC(2026, 0, 1);
    p.record(rep('L0-1-a', 90), now);
    expect(p.ex('L0-1-a').reviewDue! - now).toBe(3 * 86400000);
    p.record(rep('L0-1-a', 50), now);
    expect(p.ex('L0-1-a').box).toBe(0);
    expect(p.dueReviews(now + 2 * 86400000)).toContain('L0-1-a');
  });
  it('keeps separate competency measures per skill', () => {
    const p = new ProgressStore(memoryKV());
    p.record(rep('L0-4-a', 60, false));
    p.record(rep('L1-3-a', 95));
    const c = p.competencies(LESSONS);
    expect(c.rhythm).toBe(60);
    expect(c.noteReadingBass).toBe(95);
  });
});
