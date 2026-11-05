import { describe, expect, it } from 'vitest';
import { allowLesson, allowSong, allowVoiceLevel, allowFeature, entitlementFrom, LOCAL_ENTITLEMENT } from '../src/account/gate';
import { mergeProgress } from '../src/account/merge';
import { LESSONS } from '../src/curriculum/lessons';
import { SONGS } from '../src/songs';

const free = entitlementFrom({ role: 'user', pro_until: null });
const pro = entitlementFrom({ role: 'user', pro_until: new Date(Date.now() + 86400000).toISOString() });
const expired = entitlementFrom({ role: 'user', pro_until: new Date(Date.now() - 1000).toISOString() });
const admin = entitlementFrom({ role: 'admin', pro_until: null });

describe('Free and Pro', () => {
  it('free: Levels 0-2, voice lessons, beginner songs, Easy singing', () => {
    const lvl = (n: number) => LESSONS.find((l) => l.level === n && (l.track ?? 'piano') === 'piano')!;
    expect(allowLesson(free, lvl(0))).toBe(true);
    expect(allowLesson(free, lvl(2))).toBe(true);
    expect(allowLesson(free, lvl(3))).toBe(false);
    expect(allowLesson(free, LESSONS.find((l) => l.track === 'voice')!)).toBe(true);
    expect(allowSong(free, SONGS.find((s) => s.level === 'Beginner')!)).toBe(true);
    expect(allowSong(free, SONGS.find((s) => s.level === 'Advanced')!)).toBe(false);
    expect(allowVoiceLevel(free, 'easy')).toBe(true);
    expect(allowVoiceLevel(free, 'pro')).toBe(false);
    expect(allowFeature(free, 'import')).toBe(false);
  });
  it('pro and admin unlock everything; an expired pass falls back to free', () => {
    for (const e of [pro, admin]) { expect(LESSONS.every((l) => allowLesson(e, l))).toBe(true); expect(SONGS.every((s) => allowSong(e, s))).toBe(true); expect(allowFeature(e, 'import')).toBe(true); }
    expect(admin.admin).toBe(true);
    expect(allowLesson(expired, LESSONS.find((l) => l.level === 5)!)).toBe(false);
  });
  it('without accounts configured the app stays fully unlocked (local mode)', () => {
    expect(LESSONS.every((l) => allowLesson(LOCAL_ENTITLEMENT, l))).toBe(true);
    expect(allowFeature(LOCAL_ENTITLEMENT, 'import')).toBe(true);
  });
});

describe('Progress sync merge', () => {
  it('keeps the best of both devices', () => {
    const a = { version: 1 as const, exercises: { x: { best: 70, passes: 1, attempts: [{ at: 1, score: 70, passed: false, components: {} }], box: 1 } }, practiceLog: { '2026-11-01': 300 } };
    const b = { version: 1 as const, exercises: { x: { best: 90, passes: 0, attempts: [{ at: 2, score: 90, passed: true, components: {} }], box: 0 }, y: { best: 85, passes: 2, attempts: [], box: 2 } }, practiceLog: { '2026-11-01': 120, '2026-11-02': 600 } };
    const m = mergeProgress(a, b);
    expect(m.exercises.x).toMatchObject({ best: 90, passes: 1, box: 1 });
    expect(m.exercises.x.attempts.map((t) => t.at)).toEqual([1, 2]);
    expect(m.exercises.y.passes).toBe(2);
    expect(m.practiceLog).toEqual({ '2026-11-01': 300, '2026-11-02': 600 });
    expect(mergeProgress(a, null)).toEqual({ ...a, exercises: { x: { ...a.exercises.x } } });
  });
});
