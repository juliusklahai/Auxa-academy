import { PolyTracker, estimateNotes, fftMag, medianFloor } from '../src/input/poly';
import { midiToFreq } from '../src/core/music';

const SR = 48000;
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Piano-like tone: inharmonic partials, per-partial decay, weak fundamentals in the bass. */
function addNote(out: Float32Array, midi: number, startS: number, durS = 1.5, vel = 0.5) {
  const f0 = midiToFreq(midi);
  const s0 = Math.floor(startS * SR);
  const n = Math.min(out.length - s0, Math.floor(durS * SR));
  for (let h = 1; h <= 12; h++) {
    const f = f0 * h * Math.sqrt(1 + 0.0004 * h * h);
    if (f > 9000) break;
    let a = vel / Math.pow(h, 1.1);
    if (h === 1 && midi < 52) a *= 0.45;
    const tau = 1.4 / Math.sqrt(h);
    const ph = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / tau);
      out[s0 + i] += a * env * Math.sin(2 * Math.PI * f * t + ph);
    }
  }
}
function addNoise(out: Float32Array, amp: number) { for (let i = 0; i < out.length; i++) out[i] += (rnd() * 2 - 1) * amp; }

function run(signal: Float32Array, expected: number[] | null = null) {
  const tr = new PolyTracker(SR, () => expected);
  tr.noiseGate = 0.005;
  const hop = 960, W = 4096;
  const events: { t: number; notes: number[]; conf: number[] }[] = [];
  for (let end = W; end <= signal.length; end += hop) {
    const ev = tr.process(signal.subarray(end - W, end), (end / SR) * 1000);
    if (ev) events.push({ t: ev.onsetMs, notes: ev.notes.filter((n) => n.confidence >= 0.85).map((n) => n.midi), conf: ev.notes.map((n) => +n.confidence.toFixed(2)) });
  }
  return events;
}
const sig = (s = 2) => new Float32Array(Math.floor(SR * s));

describe('FFT', () => {
  it('finds a sine at the right bin', () => {
    const b = new Float32Array(4096);
    for (let i = 0; i < b.length; i++) b[i] = Math.sin((2 * Math.PI * 1000 * i) / SR);
    const m = fftMag(b, 8192);
    let best = 0; for (let i = 0; i < m.length; i++) if (m[i] > m[best]) best = i;
    expect(Math.abs(best * SR / 8192 - 1000)).toBeLessThan(6);
  });
});

describe('Polyphonic mic detection (chords)', () => {
  const cases: [string, number[]][] = [
    ['single C4', [60]],
    ['two notes C4+E4', [60, 64]],
    ['two notes C4+G4', [60, 67]],
    ['C major triad C4 E4 G4', [60, 64, 67]],
    ['G major triad G3 B3 D4', [55, 59, 62]],
    ['F major F4 A4 C5', [65, 69, 72]],
    ['four-note C3 C4 E4 G4', [48, 60, 64, 67]],
    ['hands together C3 + C4 (octave)', [48, 60]],
    ['C7 shape C4 E4 G4 A#4', [60, 64, 67, 70]],
  ];
  it.each(cases)('score-informed: %s', (_, notes) => {
    const s = sig(1.2); notes.forEach((m) => addNote(s, m, 0.3)); addNoise(s, 0.002);
    const ev = run(s, notes);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    expect(ev[0].notes).toEqual(notes);
  });
  it.each(cases.filter(([n]) => !n.includes('octave') && !n.includes('four-note')))('blind (free play): %s', (_, notes) => {
    const s = sig(1.2); notes.forEach((m) => addNote(s, m, 0.3)); addNoise(s, 0.002);
    const ev = run(s, null);
    expect(ev[0].notes).toEqual(notes);
  });
  it('catches a wrong note inside a chord (C E A instead of C E G)', () => {
    const s = sig(1.2); [60, 64, 69].forEach((m) => addNote(s, m, 0.3)); addNoise(s, 0.002);
    const ev = run(s, [60, 64, 67]);
    expect(ev[0].notes).toEqual([60, 64, 69]);
  });
  it('a held note does not re-trigger when another note is struck', () => {
    const s = sig(2); addNote(s, 60, 0.2, 1.8); addNote(s, 64, 0.9, 1);
    const ev = run(s, null);
    expect(ev.map((e) => e.notes)).toEqual([[60], [64]]);
    expect(Math.abs(ev[1].t - 900)).toBeLessThan(40);
  });
  it('detects a repeated note and a sequence with correct onset times', () => {
    const s = sig(2.6); [0.2, 0.7, 1.2].forEach((t) => addNote(s, 62, t, 0.5)); addNote(s, 65, 1.7, 0.8);
    const ev = run(s, null);
    expect(ev.map((e) => e.notes)).toEqual([[62], [62], [62], [65]]);
    ev.forEach((e, i) => expect(Math.abs(e.t - [200, 700, 1200, 1700][i])).toBeLessThan(40));
  });
  it('produces no confident notes from background noise', () => {
    const s = sig(1.5); addNoise(s, 0.02);
    expect(run(s, [60]).flatMap((e) => e.notes)).toEqual([]);
  });
});

describe('estimateNotes on a static spectrum', () => {
  it('does not report the octave overtone of a single low note as a confident note', () => {
    const s = sig(0.5); addNote(s, 48, 0); addNoise(s, 0.001);
    const m = fftMag(s.subarray(2000, 6096), 8192);
    const notes = estimateNotes(m, SR, 8192, medianFloor(m, SR, 8192), { expected: [48] });
    expect(notes.filter((n) => n.confidence >= 0.85).map((n) => n.midi)).toEqual([48]);
  });
});

describe('score-informed detection does not invent expected notes', () => {
  it.each([
    ['C4+E4 played, C4 E4 G4 expected', [60, 64], [60, 64, 67]],
    ['C3 played, C3 C4 expected', [48], [48, 60]],
    ['C4 played, C4 G4 expected', [60], [60, 67]],
    ['C3 C4 E4 played, C3 C4 E4 G4 expected', [48, 60, 64], [48, 60, 64, 67]],
  ])('%s', (_, played, expected) => {
    const s = sig(1.2); played.forEach((m) => addNote(s, m, 0.3)); addNoise(s, 0.002);
    expect(run(s, expected)[0].notes).toEqual(played);
  });
});

describe('Echo gate: microphone ignores the app\'s own accompaniment', () => {
  it('drops accompaniment notes struck with the learner and keeps the learner\'s notes', () => {
    const s = sig(1.2);
    addNote(s, 64, 0.3);                         // learner plays E4 (expected)
    [48, 55, 60].forEach((m) => addNote(s, m, 0.3, 1.5, 0.6)); // app accompaniment C3 G3 C4 at the same moment
    addNoise(s, 0.002);
    const tr = new PolyTracker(SR, () => [64], () => [48, 55, 60]);
    tr.noiseGate = 0.005;
    let ev: number[] | null = null;
    for (let end = 4096; end <= s.length && !ev; end += 960) {
      const e = tr.process(s.subarray(end - 4096, end), (end / SR) * 1000);
      if (e) ev = e.notes.filter((n) => n.confidence >= 0.85).map((n) => n.midi);
    }
    expect(ev).toEqual([64]);
  });
  it('a wrong learner note is still caught next to accompaniment', () => {
    const s = sig(1.2);
    addNote(s, 65, 0.3);                         // learner plays F4, E4 expected
    [48, 55].forEach((m) => addNote(s, m, 0.3, 1.5, 0.6));
    addNoise(s, 0.002);
    const tr = new PolyTracker(SR, () => [64], () => [48, 55]);
    tr.noiseGate = 0.005;
    let ev: number[] | null = null;
    for (let end = 4096; end <= s.length && !ev; end += 960) {
      const e = tr.process(s.subarray(end - 4096, end), (end / SR) * 1000);
      if (e) ev = e.notes.filter((n) => n.confidence >= 0.85).map((n) => n.midi);
    }
    expect(ev).toEqual([65]);
  });
});
