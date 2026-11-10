import { describe, expect, it } from 'vitest';
import { swingBeat, feelBeat } from '../src/audio/timing';
import { LESSONS } from '../src/curriculum/lessons';
import { LEVEL_GROUP, LEVEL_NAMES } from '../src/curriculum/levels';
import { lessonTier } from '../src/account/gate';
import { makeQuestion, NUMERALS } from '../src/curriculum/drills';

describe('swing timing', () => {
  it('moves off-beat eighths to two thirds of the beat', () => {
    expect(swingBeat(0)).toBe(0);
    expect(swingBeat(0.5)).toBeCloseTo(2 / 3);
    expect(swingBeat(3.5)).toBeCloseTo(3 + 2 / 3);
    expect(swingBeat(1.25)).toBe(1.25);
    expect(feelBeat(0.5, false)).toBe(0.5);
  });
});

describe('ear, jazz and arranging levels', () => {
  const fresh = LESSONS.filter((l) => l.level >= 10);
  it('adds lessons for levels 10 to 12 with names and groups', () => {
    for (const lv of [10, 11, 12]) {
      expect(fresh.some((l) => l.level === lv)).toBe(true);
      expect(LEVEL_NAMES[lv]).toBeTruthy();
      expect(LEVEL_GROUP[lv]).toBeTruthy();
    }
  });
  it('prerequisites exist', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const l of fresh) for (const p of l.prerequisites) expect(ids.has(p), `${l.id} -> ${p}`).toBe(true);
  });
  it('every exercise fills whole bars and stays on the keyboard', () => {
    for (const l of fresh) for (const e of l.exercises.filter((x) => !x.drill)) {
      const end = Math.max(...e.events.map((v) => v.beat + v.beats));
      expect(end % e.timeSig[0], e.id).toBe(0);
      for (const v of e.events) for (const p of v.pitches) { expect(p).toBeGreaterThanOrEqual(28); expect(p).toBeLessThanOrEqual(96); }
    }
  });
  it('by-ear exercises hide their labels', () => {
    const ear = fresh.flatMap((l) => l.exercises).filter((e) => e.byEar);
    expect(ear.length).toBeGreaterThan(5);
    for (const e of ear) expect(e.hideLabels).toBe(true);
  });
  it('every lesson teaches several steps and mixes practice', () => {
    for (const l of fresh) { expect(l.teach.length, l.id).toBeGreaterThanOrEqual(3); expect(l.exercises.length, l.id).toBeGreaterThanOrEqual(1); }
    expect(fresh.length).toBeGreaterThanOrEqual(24);
  });
  it('hidden notes belong to their chord', () => {
    const hid = fresh.flatMap((l) => l.exercises).flatMap((e) => e.events).filter((v) => v.hidden);
    expect(hid.length).toBeGreaterThan(10);
    for (const v of hid) for (const p of v.hidden!) expect(v.pitches).toContain(p);
  });
  it('every drill makes playable questions with the answer among the choices', () => {
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const e of fresh.flatMap((l) => l.exercises).filter((x) => x.drill)) {
      for (let i = 0; i < 30; i++) {
        const q = makeQuestion(e.drill!, rnd);
        expect(q.sound.length, e.id).toBeGreaterThan(0);
        for (const s of q.sound) { expect(Number.isFinite(s.midi)).toBe(true); expect(s.midi).toBeGreaterThanOrEqual(28); expect(s.midi).toBeLessThanOrEqual(100); }
        for (const a of q.answers) expect(q.options, e.id).toContain(a);
        if (e.drill!.kind === 'progression' || e.drill!.kind === 'bass') for (const a of q.answers) expect(NUMERALS[a], a).toBeDefined();
        if (q.byKey) q.answers.forEach((_, k) => expect([...Array(12)].some((__, j) => q.byKey!(q.tonic + j, k))).toBe(true));
      }
    }
  });
  it('new levels are part of Plus', () => {
    for (const l of fresh) expect(lessonTier(l)).toBe('plus');
  });
});
