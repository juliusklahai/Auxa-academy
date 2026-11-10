// Sing to score, step 1: microphone pitch readings -> notes with timing -> a written melody.
// Pure functions (unit-tested): segment sung pitch into notes, find the tempo and key, and quantize
// onsets and lengths onto a beat grid.

/** One pitch reading (every ~23 ms). midi is fractional (cents), null when nothing clear is sung. */
export interface PitchFrame { t: number; midi: number | null; rms: number }
/** One sung note: equal-tempered pitch, start/end in ms, and how sharp (+) or flat (-) it was. */
export interface SungNote { midi: number; start: number; end: number; cents: number }
/** A written note or rest: start and length in beats from the first downbeat. */
export interface MelodyNote { midi: number | null; beat: number; beats: number }
export interface KeyInfo { tonic: number; mode: 'major' | 'minor'; fifths: number; name: string }
export interface Melody { notes: MelodyNote[]; bpm: number; timeSig: [number, number]; key: KeyInfo; bars: number }

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Splits a stream of pitch readings into notes. A new note starts when the pitch settles on a different
 * semitone (not on a short slide or vibrato), after a short silence, or when the same pitch is sung again
 * (the voice gets quieter and then louder: a new syllable).
 */
export function segment(frames: PitchFrame[], opts: { minMs?: number; gapMs?: number; jump?: number } = {}): SungNote[] {
  const minMs = opts.minMs ?? 90, gapMs = opts.gapMs ?? 70, jump = opts.jump ?? 0.6;
  // smooth the pitch with a 5-reading median (removes single wild readings and octave blips)
  const sm = frames.map((f, i) => {
    if (f.midi === null) return null;
    const w: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(frames.length - 1, i + 2); k++) { const m = frames[k].midi; if (m !== null) w.push(m); }
    return w.length >= 2 ? median(w) : f.midi;
  });
  const notes: SungNote[] = [];
  type Cur = { start: number; last: number; ps: number[]; peak: number; dip: number; dipT: number };
  let cur: Cur | null = null;
  let pend: { t: number; ps: number[] } | null = null; // a possible change of note, waiting to be confirmed
  let gapStart = -1;
  const close = (end: number) => {
    const c0 = cur as Cur | null;
    if (c0 && end - c0.start >= minMs) {
      const m = median(c0.ps);
      notes.push({ midi: Math.round(m), start: c0.start, end, cents: Math.round((m - Math.round(m)) * 100) });
    }
    cur = null;
  };
  const open = (t: number, ps: number[], rms: number) => { cur = { start: t, last: t, ps: [...ps], peak: rms, dip: rms, dipT: t }; };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], p = sm[i];
    // readings missing for a while (microphone paused): that ends the note
    const cm = cur as Cur | null;
    if (cm && i > 0 && f.t - frames[i - 1].t > gapMs) { close(cm.last); pend = null; }
    if (p === null) {
      if (gapStart < 0) gapStart = f.t;
      const cg = cur as Cur | null;
      if (cg && f.t - gapStart >= gapMs) { close(cg.last); pend = null; }
      continue;
    }
    gapStart = -1;
    if (!cur) { open(f.t, [p], f.rms); continue; }
    const c: Cur = cur;
    const ref = median(c.ps.slice(-10));
    if (Math.abs(p - ref) > jump) {
      // different pitch: confirm only if it holds for ~3 readings and agrees with itself
      if (pend && Math.abs(p - median(pend.ps)) <= jump) pend.ps.push(p);
      else pend = { t: f.t, ps: [p] };
      if (pend.ps.length >= 3) { close(pend.t); open(pend.t, pend.ps, f.rms); pend = null; }
      continue;
    }
    pend = null;
    // same pitch sung again: the level dips clearly and comes back
    if (f.rms > c.peak) c.peak = f.rms;
    if (f.rms < c.dip) { c.dip = f.rms; c.dipT = f.t; }
    if (c.dip < c.peak * 0.45 && f.rms > c.dip * 1.8 && c.dipT - c.start > 120 && f.t - c.dipT < 140) {
      close(c.dipT);
      open(c.dipT, [p], f.rms);
      continue;
    }
    if (f.rms > c.dip * 1.8) { c.dip = f.rms; c.dipT = f.t; }
    c.ps.push(p); c.last = f.t;
  }
  const fin = cur as Cur | null;
  if (fin) close(fin.last);
  return notes;
}

/** The tempo that best explains the note starts (50 to 160 beats per minute). */
export function estimateTempo(notes: SungNote[]): number {
  if (notes.length < 3) return 80;
  const iois: number[] = [];
  for (let i = 1; i < notes.length; i++) iois.push(notes[i].start - notes[i - 1].start);
  let bpm0 = 60000 / median(iois);
  while (bpm0 > 140) bpm0 /= 2;
  while (bpm0 < 60) bpm0 *= 2;
  const t0 = notes[0].start;
  let best = Math.round(bpm0), bestErr = Infinity;
  for (let bpm = Math.max(50, Math.round(bpm0 * 0.85)); bpm <= Math.min(160, Math.round(bpm0 * 1.15)); bpm++) {
    const grid = 60000 / bpm / 2; // eighth notes
    let err = 0;
    for (const n of notes) { const x = (n.start - t0) / grid; err += Math.abs(x - Math.round(x)); }
    err = err / notes.length + Math.abs(bpm - bpm0) / bpm0 * 0.15;
    if (err < bestErr) { bestErr = err; best = bpm; }
  }
  return best;
}

// Krumhansl-Kessler key profiles
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const pcName = (pc: number, fifths: number) => (fifths < 0 ? FLAT : SHARP)[((pc % 12) + 12) % 12];

export function keyInfo(tonic: number, mode: 'major' | 'minor'): KeyInfo {
  const fifths = MAJOR_FIFTHS[(tonic + (mode === 'minor' ? 3 : 0)) % 12];
  return { tonic, mode, fifths, name: `${pcName(tonic, fifths)} ${mode}` };
}

/** The most likely key, from how long each pitch class is sung. */
export function detectKey(notes: { midi: number | null; beats?: number; start?: number; end?: number }[]): KeyInfo {
  const h = new Array(12).fill(0);
  for (const n of notes) if (n.midi !== null) h[n.midi % 12] += n.beats ?? Math.max(0.1, ((n.end ?? 0) - (n.start ?? 0)) / 500);
  const corr = (prof: number[], r: number) => {
    const x = h.map((_, i) => h[(i + r) % 12]);
    const mx = x.reduce((a, b) => a + b, 0) / 12, mp = prof.reduce((a, b) => a + b, 0) / 12;
    let num = 0, dx = 0, dp = 0;
    for (let i = 0; i < 12; i++) { num += (x[i] - mx) * (prof[i] - mp); dx += (x[i] - mx) ** 2; dp += (prof[i] - mp) ** 2; }
    return dx && dp ? num / Math.sqrt(dx * dp) : 0;
  };
  // tunes usually end (and often start) on the home note
  const pitched = notes.filter((n) => n.midi !== null);
  const lastPc = pitched.length ? pitched[pitched.length - 1].midi! % 12 : -1, firstPc = pitched.length ? pitched[0].midi! % 12 : -1;
  const home = (r: number) => (r === lastPc ? 0.15 : 0) + (r === firstPc ? 0.04 : 0);
  let best = keyInfo(0, 'major'), bv = -Infinity;
  for (let r = 0; r < 12; r++) {
    const a = corr(MAJ, r) + 0.02 + home(r); // slight preference for major when it is a tie
    if (a > bv) { bv = a; best = keyInfo(r, 'major'); }
    const b = corr(MIN, r) + home(r);
    if (b > bv) { bv = b; best = keyInfo(r, 'minor'); }
  }
  return best;
}

/**
 * Writes sung notes on a beat grid. origin = time of the first downbeat (ms); grid = smallest step in
 * beats (0.5 = eighth notes, 0.25 = sixteenths). Short gaps are joined (legato singing), longer gaps
 * become rests, and the last bar is filled with a rest.
 */
export function quantize(sung: SungNote[], bpm: number, origin: number, timeSig: [number, number] = [4, 4], grid = 0.5): MelodyNote[] {
  const beatMs = 60000 / bpm;
  const q = (ms: number) => Math.round((ms - origin) / beatMs / grid) * grid;
  const raw: { midi: number; beat: number; end: number }[] = [];
  for (const n of sung) {
    let beat = q(n.start);
    if (beat < 0) { if ((n.end - origin) / beatMs < grid) continue; beat = 0; }
    const last = raw[raw.length - 1];
    if (last && beat <= last.beat) {
      if (last.midi === n.midi) { last.end = Math.max(last.end, q(n.end)); continue; }
      beat = last.beat + grid;
    }
    raw.push({ midi: n.midi, beat, end: Math.max(beat + grid, q(n.end)) });
  }
  const out: MelodyNote[] = [];
  let pos = 0;
  raw.forEach((n, i) => {
    const next = raw[i + 1]?.beat ?? Infinity;
    let end = Math.min(n.end, next);
    // join tiny gaps (breaths between legato notes)
    if (next !== Infinity && next - end <= grid && end - n.beat >= 1) end = next;
    if (n.beat > pos) out.push({ midi: null, beat: pos, beats: n.beat - pos });
    out.push({ midi: n.midi, beat: n.beat, beats: Math.max(grid, end - n.beat) });
    pos = n.beat + Math.max(grid, end - n.beat);
  });
  const barBeats = timeSig[0] * (4 / timeSig[1]);
  const total = Math.max(barBeats, Math.ceil(pos / barBeats - 1e-9) * barBeats);
  if (total > pos) out.push({ midi: null, beat: pos, beats: total - pos });
  return out;
}

/** Everything in one go: readings -> melody. Without a fixed tempo, the tempo comes from the singing. */
export function transcribe(frames: PitchFrame[], opts: { bpm?: number; origin?: number; timeSig?: [number, number]; grid?: number } = {}): Melody | null {
  const sung = segment(frames);
  if (!sung.length) return null;
  const timeSig = opts.timeSig ?? [4, 4];
  const bpm = opts.bpm ?? estimateTempo(sung);
  const origin = opts.origin ?? sung[0].start;
  const notes = quantize(sung, bpm, origin, timeSig, opts.grid ?? 0.5);
  const barBeats = timeSig[0] * (4 / timeSig[1]);
  const total = notes.reduce((a, n) => Math.max(a, n.beat + n.beats), 0);
  return { notes, bpm, timeSig, key: detectKey(notes), bars: Math.round(total / barBeats) };
}
