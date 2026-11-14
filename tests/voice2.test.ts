import { describe, it, expect } from 'vitest';
import { analyzeVoice, findSyllables, decodePitches } from '../src/compose/voiceNotes';
import { readRhythm } from '../src/compose/rhythm';

const SR = 16000;
/** a sung-like vowel: harmonics with formant-ish weights, gentle vibrato, attack and release */
function vowel(out: number[], midi: number, ms: number, opts: { vib?: number; level?: number; scoop?: number } = {}) {
  const n = Math.round((SR * ms) / 1000), f0 = 440 * 2 ** ((midi - 69) / 12);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const scoop = opts.scoop && t < 0.06 ? opts.scoop * (1 - t / 0.06) : 0;
    const f = f0 * 2 ** ((Math.sin(2 * Math.PI * 5.5 * t) * (opts.vib ?? 0.25) + scoop) / 12);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, i / (SR * 0.02), (n - i) / (SR * 0.03)) * (opts.level ?? 0.3);
    let s = 0;
    for (let h = 1; h <= 12; h++) s += Math.sin(ph * h) * (h === 1 ? 1 : h === 2 ? 0.7 : h === 3 ? 0.5 : 0.25 / h);
    out.push(s * env * 0.4);
  }
}
const hiss = (out: number[], ms: number, level = 0.05) => { for (let i = 0; i < (SR * ms) / 1000; i++) out.push((Math.random() * 2 - 1) * level); };
const quiet = (out: number[], ms: number) => { for (let i = 0; i < (SR * ms) / 1000; i++) out.push((Math.random() * 2 - 1) * 0.0005); };

describe('sing to score v2: syllables', () => {
  it('finds one note per syllable, with consonants between, and ignores scoops and vibrato', () => {
    const a: number[] = [];
    quiet(a, 300);
    const tune = [62, 62, 64, 62, 67, 66]; // "Hap-py birth-day to you"
    tune.forEach((m, i) => { if (i) hiss(a, 60); vowel(a, m, i === 5 ? 900 : 380, { scoop: i === 4 ? -1.5 : 0 }); });
    quiet(a, 300);
    const syl = findSyllables(analyzeVoice(Float32Array.from(a), SR));
    expect(syl.map((s) => s.midi)).toEqual(tune);
  });
  it('splits a repeated note joined by a soft consonant (a dip in loudness, no break)', () => {
    const a: number[] = [];
    quiet(a, 200);
    vowel(a, 60, 450); vowel(a, 60, 120, { level: 0.06 }); vowel(a, 60, 450); // "la - la" on one pitch
    quiet(a, 200);
    const syl = findSyllables(analyzeVoice(Float32Array.from(a), SR));
    expect(syl.length).toBe(2);
  });
});

describe('sing to score v2: pitch', () => {
  it('writes a loosely sung scale as the notes of its key', () => {
    // D major sung about a third of a semitone flat, with wide intonation on E and A
    const sung = [62, 64.45, 66, 67, 69.4, 71, 73, 74].map((m) => ({ m: m - 0.35, w: 1 }));
    const d = decodePitches(sung);
    expect(d.notes).toEqual([62, 64, 66, 67, 69, 71, 73, 74]);
    expect(d.tonic).toBe(2);
  });
  it('keeps a clearly sung chromatic note', () => {
    const d = decodePitches([60, 62, 64, 65, 66, 67, 69, 71, 72].map((m) => ({ m, w: 1 })));
    expect(d.notes).toContain(66);
  });
});

describe('sing to score v2: rhythm', () => {
  it('reads Amazing Grace sung freely as 3/4 with its note values', () => {
    // A-|ma-zing|grace how|sweet the|sound: values 1 | 2 .5 .5 | 2 1 | 2 1 | 3, at ~84 bpm with 6% wobble
    const vals = [1, 2, 0.5, 0.5, 2, 1, 2, 1, 3, 1, 2, 0.5, 0.5, 2, 1, 3];
    const beat = 714;
    let t = 1000;
    const wob = [0.03, -0.05, 0.04, -0.02, 0.06, -0.04, 0.02, -0.06, 0.05, -0.03, 0.04, 0.02, -0.05, 0.03, -0.02, 0];
    const ns = vals.map((v, i) => { const n = { midi: 60, t, e: t + v * beat * 0.85 }; t += v * beat * (1 + wob[i]); return n; });
    const r = readRhythm(ns)!;
    expect(r.timeSig).toEqual([3, 4]);
    expect(r.bpm).toBeGreaterThan(70); expect(r.bpm).toBeLessThan(100);
    const written = r.notes.filter((n) => n.midi !== null).map((n) => n.beats);
    // every note kept, values right (the last one may be held a little differently)
    expect(written.length).toBe(vals.length);
    expect(written.slice(0, -1)).toEqual(vals.slice(0, -1));
  });
  it('with the click, uses the known tempo and bar line', () => {
    const beat = 600, origin = 1000;
    const vals = [1, 1, 1, 1, 2, 2, 1, 1, 2];
    let b = 0;
    const ns = vals.map((v) => { const n = { midi: 60, t: origin + b * beat + 15, e: origin + (b + v * 0.9) * beat }; b += v; return n; });
    const r = readRhythm(ns, { bpm: 100, origin, timeSig: [4, 4] })!;
    expect(r.notes.filter((n) => n.midi !== null).map((n) => n.beats).slice(0, -1)).toEqual(vals.slice(0, -1));
    expect(r.notes[0].beat).toBe(0);
  });
});
