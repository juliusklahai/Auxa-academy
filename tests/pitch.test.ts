import { yin, OnsetTracker } from '../src/input/pitch';
import { freqToNote, midiToFreq } from '../src/core/music';

const SR = 48000;
function tone(freq: number, n = 2048, harmonics = [1, 0.5, 0.3, 0.2], noise = 0): Float32Array {
  const b = new Float32Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, h) => (v += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR)));
    b[i] = v * 0.2 + noise * rnd();
  }
  return b;
}
function noiseBuf(n = 2048): Float32Array { let s = 3; return Float32Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.3); }

describe('YIN pitch detection', () => {
  it.each([[48, 'C3'], [60, 'C4'], [62, 'D4'], [69, 'A4'], [76, 'E5'], [84, 'C6']])('detects MIDI %i (%s) from a harmonic tone', (midi) => {
    const est = yin(tone(midiToFreq(midi)), SR, 50, 2000);
    const n = freqToNote(est.freq);
    expect(n.midi).toBe(midi);
    expect(Math.abs(n.cents)).toBeLessThan(10);
    expect(est.confidence).toBeGreaterThan(0.85);
  });
  it('detects C4 and NOT D4 (spec test 1 at the DSP layer)', () => {
    expect(freqToNote(yin(tone(midiToFreq(60)), SR).freq).midi).not.toBe(62);
  });
  it('still works with moderate noise', () => {
    const est = yin(tone(midiToFreq(67), 2048, [1, 0.4, 0.2], 0.03), SR);
    expect(freqToNote(est.freq).midi).toBe(67);
  });
  it('reports low confidence for white noise (spec test 7)', () => {
    expect(yin(noiseBuf(), SR).confidence).toBeLessThan(0.85);
  });
  it('measures sung intonation in cents (20 cents sharp)', () => {
    const f = midiToFreq(64) * Math.pow(2, 20 / 1200);
    const n = freqToNote(yin(tone(f, 2048, [1, 0.3]), SR).freq);
    expect(n.midi).toBe(64);
    expect(n.cents).toBeGreaterThanOrEqual(15);
    expect(n.cents).toBeLessThanOrEqual(25);
  });
});

describe('OnsetTracker', () => {
  it('emits a sustained note once (no duplicate detections)', () => {
    const t = new OnsetTracker(0.01, 0.85, 3);
    const hits = Array.from({ length: 20 }, () => t.push(60, 0.95, 0.1)).filter(Boolean);
    expect(hits).toHaveLength(1);
  });
  it('emits repeated notes when separated by silence', () => {
    const t = new OnsetTracker(0.01, 0.85, 3);
    const run = () => Array.from({ length: 5 }, () => t.push(60, 0.95, 0.1)).filter(Boolean).length;
    const a = run(); t.push(-1, 0, 0.001); const b = run();
    expect(a + b).toBe(2);
  });
  it('never emits notes from low-confidence frames', () => {
    const t = new OnsetTracker(0.01, 0.85, 3);
    const hits = Array.from({ length: 30 }, () => t.push(60, 0.5, 0.1)).filter(Boolean);
    expect(hits).toHaveLength(0);
    expect(t.uncertainFrames).toBe(30);
  });
  it('ignores sounds under the noise gate', () => {
    const t = new OnsetTracker(0.02, 0.85, 3);
    expect(Array.from({ length: 10 }, () => t.push(60, 0.99, 0.01)).filter(Boolean)).toHaveLength(0);
  });
});
