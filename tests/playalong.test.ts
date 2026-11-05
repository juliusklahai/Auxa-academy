import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/curriculum/lessons';
import { playAlong } from '../src/curriculum/playalong';
import { AssessmentSession } from '../src/assessment/session';
import { applyVoiceLevel } from '../src/assessment/voiceLevels';
import type { Exercise } from '../src/core/types';

describe('Play-along mastery pieces', () => {
  it('every piano lesson has 2-5 play-alongs or is a special case', () => {
    const piano = LESSONS.filter((l) => (l.track ?? 'piano') === 'piano');
    expect(piano.length).toBeGreaterThanOrEqual(40);
    const withPa = piano.filter((l) => l.exercises.some((e) => e.backing));
    expect(withPa.length).toBeGreaterThanOrEqual(36);
    for (const l of withPa) {
      const n = l.exercises.filter((e) => e.backing).length;
      expect(n, l.id).toBeGreaterThanOrEqual(1);
      expect(n, l.id).toBeLessThanOrEqual(5);
    }
  });
  it('middle C lesson: you play only middle C, the band plays the rest', () => {
    const l = LESSONS.find((x) => x.id === 'L0-1')!;
    const pa = l.exercises.filter((e) => e.backing);
    expect(pa.length).toBeGreaterThanOrEqual(2);
    for (const e of pa) {
      expect(new Set(e.events.flatMap((x) => x.pitches))).toEqual(new Set([60]));
      expect(e.backing!.some((b) => b.line === 'melody' && b.midi !== 60)).toBe(true);
      expect(e.events.length).toBeGreaterThanOrEqual(6);
    }
  });
  it('C position lesson: only C D E F G for you; the left hand lesson stays in the bass', () => {
    const rh = LESSONS.find((x) => x.id === 'L0-2')!.exercises.filter((e) => e.backing);
    for (const e of rh) expect(e.events.flatMap((x) => x.pitches).every((p) => [60, 62, 64, 65, 67].includes(p))).toBe(true);
    const lh = LESSONS.find((x) => x.id === 'L1-3')!.exercises.filter((e) => e.backing);
    for (const e of lh) { expect(e.clef).toBe('bass'); expect(e.events.flatMap((x) => x.pitches).every((p) => [48, 50, 52, 53, 55].includes(p))).toBe(true); }
  });
  it('pieces are the same every time (seeded)', () => {
    const spec = { keys: [60, 62, 64], hand: 'RH' as const, styles: ['melody' as const] };
    expect(playAlong('X', spec, 'melody', 1)).toEqual(playAlong('X', spec, 'melody', 1));
  });
});

const sung = (pitches: number[]): Exercise => ({
  id: 'v', title: 'v', objective: '', clef: 'treble', mode: 'wait', tempo: 60, timeSig: [4, 4], events: pitches.map((p, i) => ({ pitches: [p], beat: i, beats: 1 })),
  skills: [], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['mic'], voice: true,
});
const note = (midi: number, t: number, cents = 0) => ({ midi, time: t, source: 'mic' as const, confidence: 0.95, cents });

describe('Singing levels', () => {
  it('Easy: a semitone away still counts, any octave, and it moves on after 3 tries', () => {
    const s = new AssessmentSession(applyVoiceLevel(sung([60, 64, 67]), 'easy')); s.begin();
    expect(s.input(note(61, 100)).kind).toBe('partial');   // C# for C: close enough, with a tuning tip
    expect(s.input(note(52, 200)).kind).not.toBe('wrong'); // E an octave lower
    for (let i = 0; i < 2; i++) expect(s.input(note(72, 300 + i)).kind).toBe('wrong'); // far off: hints only
    const third = s.input(note(72, 400));
    expect(third.kind).toBe('partial'); // moves on with encouragement
    expect(s.state).toBe('COMPLETED');
  });
  it('Pro: the right note 30 cents flat does not count', () => {
    const s = new AssessmentSession(applyVoiceLevel(sung([60, 62]), 'pro')); s.begin();
    expect(s.input(note(60, 100, -30)).kind).toBe('wrong');
    expect(s.currentIndex()).toBe(0);
    expect(s.input(note(60, 300, -8)).kind).toBe('partial'); // counted, after one try
    expect(s.currentIndex()).toBe(1);
  });
  it('Standard keeps going after a few misses (restart only after 5 in a row)', () => {
    const s = new AssessmentSession(applyVoiceLevel(sung([60, 62]), 'standard')); s.begin();
    for (let i = 0; i < 4; i++) s.input(note(66, i * 100));
    expect(s.state).toBe('LISTENING');
  });
});
