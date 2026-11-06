// Realistic microphone conditions: soft playing far from a phone, the same key played again while it
// still rings, room noise. Piano model: 3 slightly detuned strings, two-stage decay, hammer thump,
// and a phone microphone's bass roll-off.
import { describe, expect, it } from 'vitest';
import { PolyTracker } from '../src/input/poly';
import { midiToFreq } from '../src/core/music';

const SR = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function addNote(out: Float32Array, midi: number, startS: number, durS: number, vel: number) {
  const f0 = midiToFreq(midi); const s0 = Math.floor(startS * SR); const n = Math.min(out.length - s0, Math.floor(durS * SR));
  for (let h = 1; h <= 14; h++) {
    const f = f0 * h * Math.sqrt(1 + 0.0004 * h * h); if (f > 8000) break;
    let a = vel / h; if (h === 1 && midi < 55) a *= 0.35;
    for (const det of [-0.6, 0, 0.7]) {
      const ph = rnd() * 6.28, ff = f * Math.pow(2, det / 1200);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.003) * (0.7 * Math.exp(-t / (0.35 / Math.sqrt(h))) + 0.3 * Math.exp(-t / (3 / Math.sqrt(h))));
        out[s0 + i] += (a / 3) * env * (i > n - 4800 ? (n - i) / 4800 : 1) * Math.sin(2 * Math.PI * ff * t + ph);
      }
    }
  }
  for (let i = 0; i < 1200 && s0 + i < out.length; i++) out[s0 + i] += vel * 0.6 * (rnd() * 2 - 1) * Math.exp(-i / 200);
}
function phoneMic(out: Float32Array, noise: number) {
  let y = 0, x1 = 0; const a = Math.exp(-2 * Math.PI * 150 / SR);
  for (let i = 0; i < out.length; i++) { const x = out[i] + (rnd() * 2 - 1) * noise; y = a * (y + x - x1); x1 = x; out[i] = y; }
}
/** confident notes per detected onset, using the app's default settings */
function listen(signal: Float32Array, expected: number[] | null = null) {
  const tr = new PolyTracker(SR, () => expected);
  const out: number[][] = [];
  for (let end = 4096; end <= signal.length; end += 1104) {
    const e = tr.process(signal.subarray(end - 4096, end), (end / SR) * 1000);
    if (e) out.push(e.notes.filter((n) => n.confidence >= 0.85).map((n) => n.midi));
  }
  return out.filter((n) => n.length);
}

describe('Listening in real conditions', () => {
  // vel 0.3 = loud and close; 0.015 = soft playing, phone across the room (about -45 dBFS)
  for (const vel of [0.3, 0.06, 0.015]) {
    for (const gap of [0.6, 0.35]) {
      it(`the same key four times (level ${vel}, every ${gap}s) is heard four times`, () => {
        seed = 7;
        const s = new Float32Array(SR * 3);
        [0, 1, 2, 3].forEach((i) => addNote(s, 60, 0.3 + i * gap, 2.5 - (0.3 + i * gap), vel * (i % 2 ? 0.7 : 1)));
        phoneMic(s, vel * 0.02 + 0.0008);
        expect(listen(s, [60])).toEqual([[60], [60], [60], [60]]);
      });
    }
  }
  const melody = [48, 52, 55, 60, 64, 67, 72, 76, 84, 60, 60, 60];
  for (const [vel, noise] of [[0.02, 0.0008], [0.004, 0.0005], [0.02, 0.004]]) {
    it(`a melody from C3 to C6 with repeated notes (level ${vel}, room noise ${noise})`, () => {
      seed = 3;
      const s = new Float32Array(SR * 6.5);
      melody.forEach((m, i) => addNote(s, m, 0.4 + i * 0.5, 0.9, vel));
      phoneMic(s, noise);
      expect(listen(s).map((n) => n.join('+'))).toEqual(melody.map(String));
    });
  }
  for (const noise of [0.0005, 0.003, 0.01]) {
    it(`room noise alone (${noise}) is never heard as notes`, () => {
      seed = 5;
      const s = new Float32Array(SR * 4);
      phoneMic(s, noise);
      expect(listen(s)).toEqual([]);
    });
  }
});
