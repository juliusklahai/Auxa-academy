import { GLOSSARY } from '../src/curriculum/glossary';
import { lessonById, PIANO_LESSONS } from '../src/curriculum/lessons';
import { makeQuestion } from '../src/curriculum/drills';
import { NARRATION } from '../src/curriculum/narration';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('method-book foundations', () => {
  it('every glossary lesson link points at a real lesson', () => {
    for (const t of GLOSSARY) if (t.lesson) expect(lessonById(t.lesson), t.term).toBeTruthy();
  });
  it('new lessons sit in teaching order', () => {
    const ids = PIANO_LESSONS.map((l) => l.id);
    expect(ids[0]).toBe('L0-0');
    expect(ids.indexOf('L1-6')).toBe(ids.indexOf('L1-2') + 1);
    expect(ids.slice(ids.indexOf('L4-5') + 1, ids.indexOf('L4-5') + 5)).toEqual(['L4-6', 'L4-7', 'L4-8', 'L4-9']);
  });
  it('new steps all have narration', () => {
    for (const id of ['L0-0', 'L1-6', 'L1-7', 'L5-6', 'L4-6', 'L4-7', 'L4-8', 'L4-9']) lessonById(id)!.teach.forEach((_, i) => expect(NARRATION[`${id}#${i}`], `${id}#${i}`).toBeTruthy());
  });
  it('reading drills always offer the right answer among distinct choices', () => {
    const rnd = seeded(7);
    for (const kind of ['count', 'tempo', 'meter', 'roadmap', 'notename', 'keysig'] as const) {
      const pool = kind === 'count' ? ['ta', 'ti-ti', 'tri-po-let', 'ti-ka-ti-ka'] : kind === 'tempo' ? ['Adagio', 'Andante', 'Allegro'] : kind === 'meter' ? ['2/4', '3/4', '6/8'] : kind === 'notename' ? ['treble', 'bass', 'ledger', 'treble-near', 'bass-near'] : kind === 'keysig' ? ['0', '1', '2', '-1', '-2'] : ['0', '1', '2', '3', '4'];
      for (let i = 0; i < 40; i++) {
        const q = makeQuestion({ kind, pool }, rnd);
        expect(q.options).toContain(q.answers[0]);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });
  it('triplet beats add up to whole beats', () => {
    const ev = lessonById('L4-7')!.exercises.find((e) => e.id === 'L4-7-b')!.events;
    const last = ev[ev.length - 1];
    expect(Math.abs(last.beat + last.beats - 8)).toBeLessThan(1e-9);
  });
});

import { HYMNS } from '../src/curriculum/hymns';
import { parts } from '../src/curriculum/church';
describe('church path', () => {
  it('each hymn voice lasts the same number of whole bars', () => {
    for (const h of Object.values(HYMNS)) {
      const bar = h.timeSig[0] * (4 / h.timeSig[1]);
      const len = (s: string) => s.split(' ').reduce((a, t) => a + parseFloat(t.split(':')[1]), 0);
      const L = len(h.S);
      for (const v of [h.A, h.T, h.B]) expect(len(v)).toBe(L);
      expect(L % bar).toBe(0);
    }
  });
  it('left-hand notes never cross above right-hand notes', () => {
    for (const h of Object.values(HYMNS)) {
      const ev = parts([h.S, 'RH'], [h.A, 'RH'], [h.T, 'LH'], [h.B, 'LH']);
      for (const e of ev) if (e.hands) { const lh = e.pitches.filter((_, i) => e.hands![i] === 'LH'); const rh = e.pitches.filter((_, i) => e.hands![i] === 'RH'); if (lh.length && rh.length) expect(Math.max(...lh)).toBeLessThanOrEqual(Math.min(...rh)); }
    }
  });
});

import { keyAlter } from '../src/ui/Staff';
describe('key signatures', () => {
  it('knows which letters each key alters', () => {
    expect(keyAlter(1, 'f')).toBe(1); expect(keyAlter(1, 'c')).toBe(0);
    expect(keyAlter(2, 'c')).toBe(1); expect(keyAlter(-1, 'b')).toBe(-1); expect(keyAlter(-2, 'e')).toBe(-1); expect(keyAlter(-2, 'a')).toBe(0);
  });
  it('the key-signature lessons and hymns carry their key', () => {
    expect(lessonById('L5-6')!.exercises.find((e) => e.id === 'L5-6-b')!.fifths).toBe(1);
    expect(lessonById('C13-1')!.exercises[0].fifths).toBe(1);
    expect(lessonById('L5-3')!.exercises.filter((e) => !e.drill).every((e) => e.fifths === 2)).toBe(true);
  });
});

describe('styles and craft', () => {
  const ids = ['S14-1', 'S14-2', 'S14-3', 'S14-4', 'S14-5', 'S14-6', 'S14-7', 'S14-8', 'S14-9', 'L9-5', 'L9-6', 'L9-7', 'L9-8'];
  it('every exercise and its backing fill whole bars', () => {
    for (const id of ids) for (const e of lessonById(id)!.exercises) {
      const bar = e.timeSig[0] * (4 / e.timeSig[1]);
      const end = Math.max(...e.events.map((v) => v.beat + v.beats));
      expect(Math.abs(end / bar - Math.round(end / bar)), e.id).toBeLessThan(1e-9);
      if (e.backing?.length) expect(Math.max(...e.backing.map((b) => b.beat + b.beats)), `${e.id} backing`).toBeLessThanOrEqual(end + 1e-9);
    }
  });
  it('every step has narration', () => {
    for (const id of ids) lessonById(id)!.teach.forEach((_, i) => expect(NARRATION[`${id}#${i}`], `${id}#${i}`).toBeTruthy());
  });
});

describe('staff spelling', () => {
  it('a plain B is not mistaken for a flat', () => {
    expect(keyAlter(0, 'b')).toBe(0);
  });
});
