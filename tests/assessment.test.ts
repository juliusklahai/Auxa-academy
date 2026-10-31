import { AssessmentSession, combineRubric, gradeFor } from '../src/assessment/session';
import { seq } from '../src/curriculum/lessons';
import type { Exercise, PerformedNote } from '../src/core/types';

const base = (over: Partial<Exercise>): Exercise => ({
  id: 't', title: 't', objective: '', clef: 'treble', mode: 'wait', tempo: 60, timeSig: [4, 4],
  events: seq('C4'), skills: [], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi'], ...over,
});
const note = (midi: number, time: number, extra: Partial<PerformedNote> = {}): PerformedNote => ({ midi, time, source: 'midi', confidence: 1, ...extra });

describe('Test 1: single-note detection', () => {
  it('C4 is marked correct', () => {
    const s = new AssessmentSession(base({ events: seq('C4') }));
    s.begin();
    expect(s.input(note(60, 0)).kind).toBe('correct');
    expect(s.results()[0].status).toBe('correct');
    expect(s.state).toBe('COMPLETED');
  });
  it('D4 is NOT marked correct', () => {
    const s = new AssessmentSession(base({ events: seq('C4') }));
    s.begin();
    const fb = s.input(note(62, 0));
    expect(fb.kind).toBe('wrong');
    expect(fb.message).toMatch(/target is C4/);
    expect(s.results()[0].status).toBe('pending');
  });
  it('explains octave errors', () => {
    const s = new AssessmentSession(base({ events: seq('C4') }));
    s.begin();
    expect(s.input(note(72, 0)).message).toMatch(/wrong octave/);
  });
});

describe('Test 2: rhythm', () => {
  it('measures actual timing deviations of four quarter notes', () => {
    const s = new AssessmentSession(base({ mode: 'timed', events: seq('C4 C4 C4 C4') }), 60);
    s.begin(); s.listen();
    [0, 1100, 1950, 3300].forEach((t) => s.input(note(60, t)));
    const devs = s.results().map((r) => r.onsetDeviationMs);
    expect(devs).toEqual([0, 100, -50, 300]);
    s.tick(5000);
    const r = s.report!;
    const rhythm = r.components.find((c) => c.key === 'rhythm')!;
    expect(rhythm.measured).toBe(true);
    expect(rhythm.score).toBeLessThan(1);
    expect(r.partial).toBeGreaterThan(0); // the 300 ms late note is amber (right pitch, wrong time)
  });
  it('perfect timing scores 100 on rhythm', () => {
    const s = new AssessmentSession(base({ mode: 'timed', events: seq('C4 D4 E4 F4') }), 60);
    s.begin(); s.listen();
    [60, 62, 64, 65].forEach((m, i) => { s.input(note(m, i * 1000)); s.noteOff(m, i * 1000 + 950); });
    const r = s.report!;
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.passed).toBe(true);
  });
  it('flags missed notes as the timeline passes', () => {
    const s = new AssessmentSession(base({ mode: 'timed', events: seq('C4 C4 C4 C4') }), 60);
    s.begin(); s.listen();
    s.input(note(60, 0));
    const fb = s.tick(1600);
    expect(fb?.message).toMatch(/Missed/);
  });
});

describe('Test 3: three consecutive mistakes', () => {
  it('restarts the attempt after three confirmed consecutive mistakes', () => {
    const s = new AssessmentSession(base({ events: seq('C4 D4') }));
    s.begin();
    expect(s.input(note(62, 0)).kind).toBe('wrong');
    expect(s.input(note(64, 500)).message).toMatch(/Second miss/);
    expect(s.input(note(65, 1000)).kind).toBe('restart');
    expect(s.state).toBe('RESTART');
    s.restart();
    expect(s.attempt).toBe(2);
    expect(s.state).toBe('READY');
    expect(s.results().every((r) => r.status === 'pending')).toBe(true);
  });
  it('a correct event between mistakes resets the counter', () => {
    const s = new AssessmentSession(base({ events: seq('C4 D4 E4') }));
    s.begin();
    s.input(note(62, 0)); s.input(note(64, 500));
    expect(s.consecutive).toBe(2);
    s.input(note(60, 1000));
    expect(s.consecutive).toBe(0);
    s.input(note(60, 1500)); s.input(note(60, 2000));
    expect(s.state).toBe('LISTENING');
  });
  it('one badly played chord counts as ONE mistake, not three', () => {
    const s = new AssessmentSession(base({ events: seq('C4+E4+G4:4') }));
    s.begin();
    [61, 63, 66].forEach((m, i) => s.input(note(m, 1000 + i * 10)));
    expect(s.consecutive).toBe(1);
    expect(s.state).toBe('LISTENING');
  });
  it('accepts a correct chord in any note order', () => {
    const s = new AssessmentSession(base({ events: seq('C4+E4+G4:4') }));
    s.begin();
    s.input(note(67, 0)); s.input(note(60, 5));
    expect(s.input(note(64, 9)).kind).toBe('correct');
  });
});

describe('Test 4: passing threshold', () => {
  it('grades follow the mastery bands', () => {
    expect(gradeFor(97)).toBe('Excellent');
    expect(gradeFor(92)).toBe('Very good');
    expect(gradeFor(80)).toBe('Passed');
    expect(gradeFor(79.9)).toBe('Needs more practice');
    expect(gradeFor(40)).toBe('Repeat guided learning');
  });
  it('a below-80 result does not pass', () => {
    const s = new AssessmentSession(base({ events: seq('C4 D4 E4 F4 G4') }));
    s.begin();
    // two wrong tries on each of the first three notes -> 0.3 pitch credit each
    let t = 0;
    for (const target of [60, 62, 64]) { s.input(note(target + 1, t += 100)); s.input(note(target + 2, t += 100)); s.input(note(target, t += 100)); }
    s.input(note(65, t += 100)); s.input(note(67, t += 100));
    expect(s.report!.score).toBeLessThan(80);
    expect(s.report!.passed).toBe(false);
  });
  it('a clean result passes', () => {
    const s = new AssessmentSession(base({ events: seq('C4 D4 E4') }));
    s.begin();
    [60, 62, 64].forEach((m, i) => s.input(note(m, i * 500)));
    expect(s.report!.score).toBe(100);
    expect(s.report!.passed).toBe(true);
  });
});

describe('Test 7: microphone confidence', () => {
  it('low-confidence observations are never counted as mistakes', () => {
    const s = new AssessmentSession(base({ events: seq('C4') }));
    s.begin();
    for (let i = 0; i < 10; i++) expect(s.input(note(62, i * 100, { source: 'mic', confidence: 0.4 })).kind).toBe('uncertain');
    expect(s.consecutive).toBe(0);
    expect(s.state).toBe('LISTENING');
    expect(s.uncertain).toBe(10);
  });
});

describe('Assessment integrity', () => {
  it('ignores input outside LISTENING (no advance from playback or before start)', () => {
    const s = new AssessmentSession(base({ mode: 'timed', events: seq('C4') }));
    expect(s.input(note(60, 0)).kind).toBe('ignored');
    s.begin();
    expect(s.state).toBe('COUNT_IN');
    expect(s.input(note(60, 0)).kind).toBe('ignored');
  });
  it('extra notes with no written note nearby are reported, not scored as hits', () => {
    const s = new AssessmentSession(base({ mode: 'timed', events: seq('C4 R:2 C4') }), 60);
    s.begin(); s.listen();
    s.input(note(60, 0));
    expect(s.input(note(65, 1500)).kind).toBe('extra');
  });
});

describe('Rubric redistribution', () => {
  it('redistributes unmeasured weights instead of assuming they are correct', () => {
    const { score, components } = combineRubric([
      { key: 'pitch', label: '', weight: 40, measured: true, score: 0.5 },
      { key: 'rhythm', label: '', weight: 25, measured: false, score: 1 },
      { key: 'duration', label: '', weight: 15, measured: false, score: 1 },
      { key: 'continuity', label: '', weight: 10, measured: true, score: 1 },
      { key: 'dynamics', label: '', weight: 10, measured: false, score: 1 },
    ]);
    expect(components[0].effectiveWeight).toBeCloseTo(80);
    expect(components[3].effectiveWeight).toBeCloseTo(20);
    expect(score).toBeCloseTo(60);
  });
});

import { computeHandStates } from '../src/ui/Hands';
describe('Hand positions for the vector hands', () => {
  it('places RH C position from fingering and lights the right finger', () => {
    const st = computeHandStates(seq('C4 D4 E4', 'RH', [1, 2, 3]));
    expect(st.map((s) => s.RH!.base)).toEqual([st[0].RH!.base, st[0].RH!.base, st[0].RH!.base]);
    expect(st.map((s) => s.RH!.active[0].finger)).toEqual([1, 2, 3]);
  });
  it('infers fingers and moves the hand when a note is out of reach', () => {
    const st = computeHandStates(seq('C4 G4 C5'));
    expect(st[0].RH!.active[0].finger).toBe(1);
    expect(st[1].RH!.active[0].finger).toBe(5);
    expect(st[2].RH!.active[0].finger).toBe(5);
    expect(st[2].RH!.base).toBeGreaterThan(st[1].RH!.base);
  });
  it('maps chord fingers 1-3-5', () => {
    const st = computeHandStates(seq('C4+E4+G4:4', 'RH', [[1, 3, 5]]));
    expect(st[0].RH!.active.map((a) => a.finger)).toEqual([1, 3, 5]);
  });
  it('left hand mirrors finger numbers', () => {
    const st = computeHandStates(seq('C3 G3', 'LH', [5, 1]));
    expect(st[0].LH!.base).toBe(st[1].LH!.base);
  });
});

describe('Chord mistake explanations', () => {
  it('names the nearest chord note instead of the bottom note', () => {
    const s = new AssessmentSession(base({ events: seq('C4+F4+A4:4') }));
    s.begin();
    expect(s.input(note(71, 0)).message).toMatch(/B4 is not in this chord .*nearest chord note is A4, 2 keys to the left/);
  });
});

describe('Singing: octave freedom and intonation', () => {
  it('accepts a melody sung an octave lower when octaveFree', () => {
    const s = new AssessmentSession(base({ events: seq('C4 E4'), octaveFree: true }));
    s.begin();
    expect(s.input(note(48, 0, { source: 'mic', confidence: 0.95 })).kind).toBe('correct');
    expect(s.input(note(52, 600, { source: 'mic', confidence: 0.95 })).kind).toBe('correct');
  });
  it('marks a right but out-of-tune note amber with cents', () => {
    const s = new AssessmentSession(base({ events: seq('C4 D4') }));
    s.begin();
    const fb = s.input(note(60, 0, { source: 'mic', confidence: 0.95, cents: 42 }));
    expect(fb.kind).toBe('partial');
    expect(fb.message).toMatch(/42 cents sharp/);
    expect(s.results()[0].status).toBe('partial');
  });
});
