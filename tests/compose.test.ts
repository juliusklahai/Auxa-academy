import { DOMParser } from '@xmldom/xmldom';
import { segment, estimateTempo, quantize, detectKey, transcribe, type PitchFrame, tidy, cleanFrames } from '../src/compose/transcribe';
import { harmonize, chordPcs, RANGE } from '../src/compose/harmony';
import { melodyXml, satbXml } from '../src/compose/score';
import { parseMusicXml } from '../src/musicxml/parse';
import { framesFromSamples } from '../src/compose/audioFile';

const parse = (xml: string) => parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, xml);
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Fake microphone readings for a sung tune: [midi, beats] at a tempo, with vibrato, scoops, breaths and noise. */
function sing(tune: [number | null, number][], bpm: number, opts: { t0?: number; detune?: number; legato?: boolean } = {}): PitchFrame[] {
  const beat = 60000 / bpm, frames: PitchFrame[] = [];
  let t = opts.t0 ?? 300;
  for (let s = 0; s < (opts.t0 ?? 300); s += 23) frames.push({ t: s, midi: null, rms: 0.002 });
  for (const [m, b] of tune) {
    const dur = b * beat, end = t + dur;
    const voicedEnd = m === null ? t : end - (opts.legato ? 25 : 90); // small breath before the next note
    for (let x = t; x < end; x += 23) {
      if (m === null || x >= voicedEnd) { frames.push({ t: x, midi: null, rms: 0.003 }); continue; }
      const age = x - t;
      const scoop = age < 60 ? -0.6 * (1 - age / 60) : 0; // slides up into the note
      const vib = Math.sin(age / 1000 * 2 * Math.PI * 5.5) * 0.25;
      const wild = rnd() < 0.03 ? 12 : 0; // the odd octave error from the pitch tracker
      frames.push({ t: x, midi: m + scoop + vib + (opts.detune ?? 0) + (rnd() - 0.5) * 0.15 + wild, rms: 0.08 * Math.min(1, age / 50) * (1 - 0.3 * age / dur) });
    }
    t = end;
  }
  return frames;
}
const ODE: [number, number][] = [[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2]];

describe('Sing to score: transcription', () => {
  it('finds every note of a sung tune, including repeated notes, despite vibrato, scoops and glitches', () => {
    const notes = segment(sing(ODE, 90));
    expect(notes.map((n) => n.midi)).toEqual(ODE.map(([m]) => m));
  });
  it('hears repeated notes sung legato (a new syllable, no breath)', () => {
    seed = 9;
    const tune: [number, number][] = [[67, 1], [67, 1], [67, 1], [64, 2]];
    const fr = sing(tune, 80, { legato: true });
    // legato: the level dips between syllables instead of stopping
    const beat = 750; fr.forEach((f) => { const ph = ((f.t - 300) % beat) / beat; if (f.midi !== null && f.t < 300 + 3 * beat && ph > 0.92) f.rms *= 0.25; });
    expect(segment(fr).map((n) => n.midi)).toEqual([67, 67, 67, 64]);
  });
  it('measures how sharp or flat the singer was', () => {
    const notes = segment(sing([[69, 2]], 80, { detune: 0.2 }));
    expect(notes[0].midi).toBe(69);
    expect(notes[0].cents).toBeGreaterThan(8);
  });
  it('finds the tempo from the singing', () => {
    for (const bpm of [72, 96, 120]) {
      const est = estimateTempo(segment(sing(ODE, bpm)));
      expect(Math.abs(est - bpm) / bpm).toBeLessThan(0.06);
    }
  });
  it('writes the rhythm on the beat grid (quarters, a dotted quarter and eighth, a half note)', () => {
    const fr = sing(ODE, 90);
    const m = quantize(segment(fr), 90, 300, [4, 4], 0.5);
    expect(m.filter((n) => n.midi !== null).map((n) => n.beats)).toEqual(ODE.map(([, b]) => b));
    expect(m.reduce((a, n) => a + n.beats, 0) % 4).toBe(0);
  });
  it('turns pauses into rests', () => {
    const tune: [number | null, number][] = [[60, 1], [62, 1], [null, 2], [64, 2], [null, 2]];
    const m = quantize(segment(sing(tune, 90)), 90, 300, [4, 4], 0.5);
    expect(m.map((n) => [n.midi, n.beats])).toEqual([[60, 1], [62, 1], [null, 2], [64, 2], [null, 2]]);
  });
  it('detects the key', () => {
    expect(detectKey(ODE.map(([midi, beats]) => ({ midi, beats }))).name).toBe('C major');
    const aMinor: [number, number][] = [[69, 1], [72, 1], [76, 2], [74, 1], [72, 1], [71, 1], [68, 1], [69, 4]];
    expect(detectKey(aMinor.map(([midi, beats]) => ({ midi, beats }))).name).toBe('A minor');
    const dMajor: [number, number][] = [[62, 1], [66, 1], [69, 1], [66, 1], [64, 1], [61, 1], [62, 2]];
    expect(detectKey(dMajor.map(([midi, beats]) => ({ midi, beats }))).fifths).toBe(2);
  });
});

describe('Sing to score: four-part harmony', () => {
  const m = transcribe(sing(ODE, 90), { bpm: 90, origin: 300 })!;
  const h = harmonize(m);
  it('keeps the melody as the soprano and ends on the home chord with a cadence', () => {
    expect(h.voices[0].notes.filter((n) => n.midi !== null).map((n) => n.midi)).toEqual(ODE.map(([x]) => x + h.melodyShift));
    const last = h.slots[h.slots.length - 1].chord!, before = h.slots[h.slots.length - 2].chord!;
    expect(last.degree).toBe('I');
    expect(before.degree.startsWith('V')).toBe(true);
  });
  it('keeps every voice in range, in order, complete, and without parallel fifths or octaves', () => {
    const at = (v: number, beat: number) => h.voices[v].notes.find((n) => n.beat <= beat + 1e-9 && n.beat + n.beats > beat + 1e-9)?.midi ?? null;
    let prev: number[] | null = null;
    for (const s of h.slots) {
      const [S, A, T, B] = [0, 1, 2, 3].map((v) => at(v, s.beat));
      expect(A! >= RANGE.A[0] && A! <= RANGE.A[1] && T! >= RANGE.T[0] && T! <= RANGE.T[1] && B! >= RANGE.B[0] && B! <= RANGE.B[1]).toBe(true);
      expect(B! <= T! && T! <= A!).toBe(true);
      const pcs = chordPcs(s.chord!);
      for (const x of [A, T, B]) expect(pcs).toContain(x! % 12);
      const now = [S!, A!, T!, B!];
      if (prev) for (let i = 1; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const i1 = Math.abs(prev[i] - prev[j]) % 12, i2 = Math.abs(now[i] - now[j]) % 12;
        if (prev[i] !== now[i] && prev[j] !== now[j]) expect(i1 === i2 && (i1 === 7 || i1 === 0)).toBe(false);
      }
      prev = now;
    }
  });
  it('moves a low (male) melody up into the soprano range', () => {
    const low = transcribe(sing(ODE.map(([x, b]) => [x - 12, b]), 90), { bpm: 90, origin: 300 })!;
    expect(harmonize(low).melodyShift).toBe(12);
  });
});

describe('Sing to score: MusicXML', () => {
  it('spells notes for the key (flats in F major, sharps in G, the raised 7th in D minor)', async () => {
    const { spell } = await import('../src/compose/xml');
    const { keyInfo } = await import('../src/compose/transcribe');
    expect(spell(70, keyInfo(5, 'major'))).toMatchObject({ step: 'B', alter: -1 });
    expect(spell(66, keyInfo(7, 'major'))).toMatchObject({ step: 'F', alter: 1 });
    expect(spell(61, keyInfo(2, 'minor'))).toMatchObject({ step: 'C', alter: 1 });
  });
  const m = transcribe(sing(ODE, 90), { bpm: 90, origin: 300 })!;
  it('the melody score reads back with the same notes and timing', () => {
    const s = parse(melodyXml(m, 'My tune'));
    expect(s.title).toBe('My tune');
    expect(s.notes.map((n) => n.midi)).toEqual(ODE.map(([x]) => x));
    expect(s.notes.map((n) => n.durQ)).toEqual(ODE.map(([, b]) => b));
  });
  it('the SATB score has four voices on two staves, ties across barlines, and chord names', () => {
    const xml = satbXml(m, 'My tune');
    const s = parse(xml);
    expect(new Set(s.tracks.map((t) => t.staff))).toEqual(new Set([1, 2]));
    expect(s.notes.length).toBeGreaterThan(ODE.length + 8);
    expect(xml).toContain('<harmony>');
    // a long note over the barline is written tied and read back as one note
    const sync = transcribe(sing([[60, 3], [64, 2], [67, 3]], 90), { bpm: 90, origin: 300 })!;
    const s2 = parse(melodyXml(sync, 't'));
    expect(s2.notes.map((n) => [n.midi, n.durQ])).toEqual([[60, 3], [64, 2], [67, 3]]);
  });
});

describe('Sing to score: from real audio', () => {
  // a low male voice where the fundamental is weak (a soft "oo"): pitch trackers love to jump an octave up
  const synth = (tune: [number, number][], bpm: number, sr = 16000) => {
    const beat = 60 / bpm, total = tune.reduce((a, [, b]) => a + b * beat, 0) + 0.6;
    const x = new Float32Array(Math.ceil(total * sr));
    let t0 = 0.3, ph = 0;
    for (const [m, b] of tune) {
      const dur = b * beat, n0 = Math.round(t0 * sr), n1 = Math.round((t0 + dur - 0.08) * sr);
      for (let i = n0; i < n1; i++) {
        const age = (i - n0) / sr, f = 440 * 2 ** ((m - 69) / 12) * 2 ** (0.3 * Math.sin(2 * Math.PI * 5.5 * age) / 12);
        ph += 2 * Math.PI * f / sr;
        const env = Math.min(1, age / 0.04) * Math.min(1, (n1 - i) / sr / 0.03);
        x[i] = env * 0.3 * (0.22 * Math.sin(ph) + 1 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph));
      }
      t0 += dur;
    }
    return x;
  };
  it('writes the right notes and lengths from a low voice with a weak fundamental', () => {
    const tune: [number, number][] = [[53, 1], [55, 1], [57, 2], [55, 1], [53, 1], [52, 1], [53, 1], [50, 2], [48, 2], [53, 4]];
    const m = transcribe(framesFromSamples(synth(tune, 80), 16000), { timeSig: [4, 4], grid: 0.5 })!;
    const written = m.notes.filter((n) => n.midi !== null);
    expect(written.map((n) => n.midi)).toEqual(tune.map(([x]) => x));
    expect(written.map((n) => n.beats).slice(0, -1)).toEqual(tune.map(([, b]) => b).slice(0, -1));
    expect(Math.abs(m.bpm - 80)).toBeLessThan(5);
  });
});

describe('Sing to score: finds the meter by itself', () => {
  it('hears a waltz in 3/4 and a march-like tune in 4/4', async () => {
    const { segment: seg, detectMeter } = await import('../src/compose/transcribe');
    seed = 21;
    const waltz: [number, number][] = [[67, 2], [64, 1], [65, 2], [62, 1], [64, 2], [60, 1], [62, 3], [67, 2], [64, 1], [65, 2], [62, 1], [64, 2], [62, 1], [60, 3]];
    expect(detectMeter(seg(sing(waltz, 120)), 120)).toEqual([3, 4]);
    expect(detectMeter(seg(sing(ODE, 90)), 90)).toEqual([4, 4]);
  });
  it('transcribes without being told the meter', () => {
    const m = transcribe(sing(ODE, 90))!;
    expect(m.timeSig).toEqual([4, 4]);
  });
});

describe('Sing to score: arrangement styles', () => {
  const m = transcribe(sing(ODE, 90), { bpm: 90, origin: 300 })!;
  for (const st of ['hymn', 'moving', 'pad', 'call', 'tenor'] as const) {
    it(`${st}: four complete parts that fill every bar, in range`, () => {
      const h = harmonize(m, st);
      const total = m.bars * 4;
      for (const v of h.voices) {
        let pos = 0;
        for (const n of v.notes) { expect(Math.abs(n.beat - pos)).toBeLessThan(1e-6); pos += n.beats; }
        expect(Math.abs(pos - total)).toBeLessThan(1e-6);
      }
      const r = [[55, 81], RANGE.A, RANGE.T, RANGE.B];
      h.voices.forEach((v, i) => v.notes.forEach((n) => { if (n.midi !== null) { expect(n.midi).toBeGreaterThanOrEqual(r[i][0] - 2); expect(n.midi).toBeLessThanOrEqual(r[i][1] + 2); } }));
      expect(h.techniques.length).toBeGreaterThan(1);
    });
  }
  it('hymn changes chord with the melody, not once per bar', () => {
    const h = harmonize(m, 'hymn');
    expect(h.slots.length).toBeGreaterThanOrEqual(m.notes.filter((n) => n.midi !== null).length - 4);
    expect(h.voices[3].notes.filter((n) => n.midi !== null).length).toBeGreaterThan(20);
  });
  it('melody in the tenor keeps the tune in the tenor range', () => {
    const h = harmonize(m, 'tenor');
    const t = h.voices[2].notes.filter((n) => n.midi !== null).map((n) => n.midi!);
    expect(t.map((x) => x - h.melodyShift)).toEqual(ODE.map(([x]) => x));
    expect(Math.max(...t)).toBeLessThanOrEqual(67);
  });
});

describe('Sing to score: quick notes in between', () => {
  it('keeps short passing notes sung legato instead of swallowing them', () => {
    // C (long) D E F (quick, 140 ms each, no breaths) G (long)
    const frames: PitchFrame[] = [];
    const tune: [number, number][] = [[60, 600], [62, 140], [64, 140], [65, 140], [67, 700]];
    let t = 200;
    for (let s = 0; s < 200; s += 23) frames.push({ t: s, midi: null, rms: 0.002 });
    for (const [m, d] of tune) { for (let x = t; x < t + d; x += 23) frames.push({ t: x, midi: m + Math.sin(x / 40) * 0.12, rms: 0.08 }); t += d; }
    for (let x = t; x < t + 300; x += 23) frames.push({ t: x, midi: null, rms: 0.002 });
    const notes = tidy(segment(cleanFrames(frames)));
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67]);
  });
});

describe('Sing to score: one note per sung syllable', () => {
  const take = (gap: 'voiced' | 'consonant') => {
    const frames: PitchFrame[] = [];
    for (let s = 0; s < 200; s += 10) frames.push({ t: s, midi: null, rms: 0.001 });
    let t = 200;
    for (let k = 0; k < 3; k++) {
      for (let x = 0; x < 420; x += 10) {
        const env = Math.min(1, x / 40) * Math.min(1, (420 - x) / 60);
        const consonant = gap === 'consonant' && x >= 390;
        frames.push({ t: t + x, midi: consonant ? null : 64 + Math.sin(x / 30) * 0.1, rms: 0.01 + 0.07 * (gap === 'voiced' ? 0.35 + 0.65 * env : env) });
      }
      t += 420;
    }
    for (let x = 0; x < 300; x += 10) frames.push({ t: t + x, midi: null, rms: 0.001 });
    return frames;
  };
  it('"la la la" on one pitch (voiced consonant) gives three notes', () => {
    const m = transcribe(take('voiced'), { bpm: 143, origin: 200, timeSig: [4, 4], grid: 0.5 })!;
    expect(m.notes.filter((n) => n.midi === 64).length).toBe(3);
  });
  it('"ta ta ta" (short silent consonants) gives three notes', () => {
    const m = transcribe(take('consonant'), { bpm: 143, origin: 200, timeSig: [4, 4], grid: 0.5 })!;
    expect(m.notes.filter((n) => n.midi === 64).length).toBe(3);
  });
});

describe('Sing to score: a sung tune is written as the soprano line', () => {
  it('moves a low (male) take up to the treble staff, or keeps it as sung', async () => {
    const { melodyXml } = await import('../src/compose/score');
    const { keyInfo } = await import('../src/compose/transcribe');
    const low = { notes: [{ midi: 48, beat: 0, beats: 2 }, { midi: 52, beat: 2, beats: 2 }], bpm: 80, timeSig: [4, 4] as [number, number], key: keyInfo(0, 'major'), bars: 1 };
    const mids = (x: string) => parse(x).notes.map((n) => n.midi);
    expect(mids(melodyXml(low, 't'))).toEqual([60, 64]);
    expect(melodyXml(low, 't')).toContain('<sign>G</sign>');
    expect(mids(melodyXml(low, 't', undefined, true))).toEqual([48, 52]);
  });
});
