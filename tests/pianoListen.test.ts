import { describe, it, expect } from 'vitest';
import { PianoListener } from '../src/input/pianoListen';
import { judgeOnset } from '../src/input/micPolicy';
import { midiToFreq } from '../src/core/music';

const SR = 48000;
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** piano-like tone: stretched partials, fast attack, decaying partials, a little thump */
function note(out: Float32Array, midi: number, t: number, dur = 0.5, vel = 0.4) {
  const f0 = midiToFreq(midi), s0 = Math.floor(t * SR), n = Math.min(out.length - s0, Math.floor(dur * SR));
  for (let h = 1; h <= 10; h++) {
    const f = f0 * h * Math.sqrt(1 + 0.0004 * h * h);
    if (f > 7000) break;
    const a = (vel / Math.pow(h, 1.1)) * (h === 1 && midi < 50 ? 0.4 : 1), tau = 1.2 / Math.sqrt(h), ph = rnd() * 6.28;
    for (let i = 0; i < n; i++) { const tt = i / SR; out[s0 + i] += a * Math.min(1, tt / 0.003) * Math.exp(-tt / tau) * Math.min(1, (n - i) / 400) * Math.sin(2 * Math.PI * f * tt + ph); }
  }
}
function run(x: Float32Array, expected: (ms: number) => number[] | null = () => null) {
  const L = new PianoListener(SR);
  L.getExpected = expected;
  const out: { midi: number; confidence: number; at: number }[] = [];
  for (let i = 0; i < x.length; i += 128) for (const ev of L.push(x.subarray(i, i + 128))) for (const n of judgeOnset(ev.notes, expected(ev.onsetMs), 0.85)) if (!n.unsure) out.push({ midi: n.midi, confidence: n.confidence, at: ev.onsetMs });
  return out;
}
const noise = (x: Float32Array, a: number) => { for (let i = 0; i < x.length; i++) x[i] += (rnd() * 2 - 1) * a; return x; };

describe('piano listener (worker detector)', () => {
  it('hears a fast run of sixteenths (120 ms apart), each note once', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72];
    const x = new Float32Array(SR * 2);
    notes.forEach((m, i) => note(x, m, 0.3 + i * 0.12, 0.13));
    const got = run(noise(x, 0.0005)).map((d) => d.midi);
    expect(got.filter((m) => notes.includes(m)).length).toBeGreaterThanOrEqual(7);
  });
  it('hears the top of the keyboard (C7 and up), which the old range could not', () => {
    const x = new Float32Array(SR * 2);
    [98, 100, 103].forEach((m, i) => note(x, m, 0.3 + i * 0.5, 0.4, 0.3));
    const got = run(noise(x, 0.0003), () => null).map((d) => d.midi);
    expect(got).toEqual(expect.arrayContaining([98, 100, 103]));
  });
  it('in a lesson, the same key played again quickly counts each time', () => {
    const x = new Float32Array(SR * 2);
    for (let k = 0; k < 4; k++) note(x, 60, 0.3 + k * 0.25, 0.22);
    const got = run(noise(x, 0.0004), () => [60]).filter((d) => d.midi === 60);
    expect(got.length).toBeGreaterThanOrEqual(3);
  });
});

describe('microphone policy', () => {
  it('drops overtone-like extras next to a correct note', () => {
    const j = judgeOnset([{ midi: 60, confidence: 0.95 }, { midi: 72, confidence: 0.9 }, { midi: 41, confidence: 0.9 }], [60], 0.85);
    expect(j.filter((n) => !n.unsure).map((n) => n.midi)).toEqual([60]);
  });
  it('a clear wrong key is still a wrong key', () => {
    const j = judgeOnset([{ midi: 62, confidence: 0.97 }], [60], 0.85);
    expect(j).toEqual([{ midi: 62, confidence: 0.97, unsure: false }]);
  });
  it('an octave of the expected note is unsure, not wrong', () => {
    const j = judgeOnset([{ midi: 72, confidence: 0.95 }], [60], 0.85);
    expect(j[0].unsure).toBe(true);
  });
  it('a chord heard in part credits notes hidden under their own octave', () => {
    const j = judgeOnset([{ midi: 48, confidence: 0.96 }, { midi: 64, confidence: 0.93 }, { midi: 67, confidence: 0.9 }], [48, 64, 67, 72], 0.85);
    expect(j.filter((n) => !n.unsure).map((n) => n.midi).sort()).toEqual([48, 64, 67, 72]);
  });
});
