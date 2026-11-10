// Sing to score, step 1: microphone pitch readings -> notes with timing -> a written melody.
// Pure functions (unit-tested): segment sung pitch into notes, find the tempo and key, and quantize
// onsets and lengths onto a beat grid.

/** One pitch reading (every ~23 ms). midi is fractional (cents), null when nothing clear is sung. */
export interface PitchFrame { t: number; midi: number | null; rms: number }
/** One sung note: equal-tempered pitch, start/end in ms, and how sharp (+) or flat (-) it was. */
export interface SungNote { midi: number; start: number; end: number; cents: number }
/** A written note or rest: start and length in beats from the first downbeat. */
export interface MelodyNote { midi: number | null; beat: number; beats: number; /** sung syllable, for arranged parts ("Ooh") */ lyric?: string }
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
  const attackAt = new Set<number>();
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
      else if (cg && f.rms < cg.dip) { cg.dip = f.rms; cg.dipT = f.t; } // a short breath counts as a dip in level
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
      attackAt.add(c.dipT);
      continue;
    }
    if (f.rms > c.dip * 1.8) { c.dip = f.rms; c.dipT = f.t; }
    c.ps.push(p); c.last = f.t;
  }
  const fin = cur as Cur | null;
  if (fin) close(fin.last);
  for (const n of notes) if (attackAt.has(n.start)) (n as SungNote & { attack?: boolean }).attack = true;
  return notes;
}

/**
 * Clean the raw readings before finding notes:
 * - drop readings much quieter than the singing itself (breaths, room echo, the tail of a note);
 * - fix octave slips. Pitch trackers sometimes report a sung note an octave too high (a soft vowel with a
 *   weak fundamental) or too low. A reading more than ~9.5 semitones from what the singer is doing around
 *   that moment is moved by an octave towards it.
 */
export function cleanFrames(frames: PitchFrame[]): PitchFrame[] {
  const voiced = frames.filter((f) => f.midi !== null);
  if (!voiced.length) return frames;
  const lv = voiced.map((f) => f.rms).sort((a, b) => a - b);
  const loud = lv[Math.min(lv.length - 1, Math.floor(lv.length * 0.9))];
  const gate = loud * 0.07;
  const out = frames.map((f) => (f.midi !== null && f.rms < gate ? { ...f, midi: null } : { ...f }));
  // loudness-weighted median pitch in a window around each reading (2.5 s each side)
  const pts = out.filter((f) => f.midi !== null);
  const wmed = (lo: number, hi: number) => {
    const w = pts.filter((f) => f.t >= lo && f.t <= hi).map((f) => [f.midi as number, Math.sqrt(f.rms)] as const).sort((a, b) => a[0] - b[0]);
    const tot = w.reduce((a, x) => a + x[1], 0);
    let acc = 0;
    for (const [m, wt] of w) { acc += wt; if (acc >= tot / 2) return m; }
    return w.length ? w[w.length - 1][0] : null;
  };
  const center = wmed(-Infinity, Infinity) as number;
  for (let pass = 0; pass < 2; pass++) {
    for (const f of out) {
      if (f.midi === null) continue;
      const c = (wmed(f.t - 2500, f.t + 2500) ?? center) * 0.4 + center * 0.6;
      while (f.midi - c > 9.5) f.midi -= 12;
      while (c - f.midi > 8) f.midi += 12; // low slips are rarer and the voice seldom goes far below its middle
    }
  }
  return out;
}

/**
 * Tidy the notes found: very short blips (a consonant, a scoop, a crack) are folded into the note next to
 * them, and a note is held until the next one starts when the gap is only a breath (legato).
 */
export function tidy(notes: SungNote[], opts: { minMs?: number; breathMs?: number } = {}): SungNote[] {
  const minMs = opts.minMs ?? 130, breathMs = opts.breathMs ?? 260;
  const ns = notes.map((n) => ({ ...n }));
  // fold blips into a touching neighbor (the longer one), or drop them when isolated
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (n.end - n.start >= minMs) continue;
      const prev = ns[i - 1], next = ns[i + 1];
      const touchP = prev && n.start - prev.end < 90, touchN = next && next.start - n.end < 90;
      if (touchP && touchN && prev.midi === next.midi) { prev.end = next.end; ns.splice(i, 2); changed = true; break; } // a crack inside one held note
      if (touchP && (!touchN || prev.end - prev.start >= next.end - next.start)) prev.end = Math.max(prev.end, n.end);
      else if (touchN) next.start = n.start;
      ns.splice(i, 1); changed = true; break;
    }
  }
  // legato: hold through short breaths
  for (let i = 0; i + 1 < ns.length; i++) if (ns[i + 1].start - ns[i].end < breathMs) ns[i].end = ns[i + 1].start;
  return ns;
}

/**
 * The tempo that best explains the note starts. Every tempo from 56 to 150 is tried: starts should land
 * on an eighth-note grid, and the typical note should be about one beat long (so held notes read as
 * quarters and halves, not a page of eighths).
 */
export function estimateTempo(notes: SungNote[]): number {
  if (notes.length < 3) return 80;
  // the typical gap between note starts, counting long notes more (short ones are often ornaments)
  const pairs: [number, number][] = [];
  for (let i = 1; i < notes.length; i++) pairs.push([notes[i].start - notes[i - 1].start, Math.min(2, (notes[i - 1].end - notes[i - 1].start) / 250)]);
  pairs.sort((a, b) => a[0] - b[0]);
  const half = pairs.reduce((a, p) => a + p[1], 0) / 2;
  let acc = 0, typical = pairs[pairs.length - 1][0];
  for (const [g, w] of pairs) { acc += w; if (acc >= half) { typical = g; break; } }
  const wt = notes.map((n) => Math.min(2, Math.max(0.3, (n.end - n.start) / 250)));
  const wsum = wt.reduce((a, b) => a + b, 0);
  const t0 = notes[0].start;
  let best = 80, bestErr = Infinity;
  for (let bpm = 56; bpm <= 150; bpm++) {
    const beat = 60000 / bpm, grid = beat / 2;
    // best phase: the first note may be a pickup
    let fitErr = Infinity;
    for (let ph = 0; ph < 1; ph += 0.125) {
      let e = 0;
      notes.forEach((n, i) => { const x = (n.start - t0) / grid + ph; e += wt[i] * Math.abs(x - Math.round(x)); });
      fitErr = Math.min(fitErr, e / wsum);
    }
    // prior: the typical note near one beat, tempos near 70-110 a little more likely
    const lenErr = Math.abs(Math.log2(typical / beat));
    const prior = bpm < 66 ? (66 - bpm) / 60 : bpm > 120 ? (bpm - 120) / 90 : 0;
    const err = fitErr + 0.22 * lenErr + 0.25 * prior;
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
  const pos = (ms: number) => (ms - origin) / beatMs;
  const q = (b: number) => Math.round(b / grid) * grid;
  // 1. onsets on the grid; two notes landing on one slot keep the longer (the other was a slide)
  const raw: { midi: number; beat: number; endB: number; len: number }[] = [];
  for (const n of sung) {
    let beat = q(pos(n.start));
    const endB = pos(n.end);
    if (beat < 0) { if (endB < grid) continue; beat = 0; }
    const len = n.end - n.start;
    const last = raw[raw.length - 1];
    if (last && beat <= last.beat) {
      if (last.midi === n.midi || len <= last.len) { last.endB = Math.max(last.endB, endB); continue; }
      // the new note is the real one: replace the short one, or move it one slot later if there is room
      if (last.len < len * 0.5) { last.midi = n.midi; last.endB = endB; last.len = len; continue; }
      // a quick run: allow the next finer note value here instead of pushing everything later
      const fine = grid / 2, bf = Math.round(pos(n.start) / fine) * fine;
      beat = bf > last.beat + 1e-6 ? bf : last.beat + fine;
    }
    raw.push({ midi: n.midi, beat, endB, len });
  }
  // 2. lengths: up to the next note, rounded to the grid; rests only for real gaps
  const out: MelodyNote[] = [];
  let at = 0;
  raw.forEach((n, i) => {
    const next = raw[i + 1]?.beat ?? Infinity;
    const step = Math.abs(n.beat / grid - Math.round(n.beat / grid)) > 1e-6 || (raw[i + 1] && Math.abs(raw[i + 1].beat / grid - Math.round(raw[i + 1].beat / grid)) > 1e-6) ? grid / 2 : grid;
    let end = Math.max(n.beat + step, Math.round(n.endB / step) * step);
    if (end > next) end = next;
    if (next !== Infinity && next - end < Math.max(grid, 0.5) + 1e-6) end = next; // tiny gap: hold on
    if (end - n.beat < step) end = n.beat + step;
    if (n.beat > at) out.push({ midi: null, beat: at, beats: n.beat - at });
    out.push({ midi: n.midi, beat: n.beat, beats: end - n.beat });
    at = end;
  });
  const barBeats = timeSig[0] * (4 / timeSig[1]);
  const total = Math.max(barBeats, Math.ceil(at / barBeats - 1e-9) * barBeats);
  if (total > at) out.push({ midi: null, beat: at, beats: total - at });
  return out;
}

/**
 * Singers drift a little sharp or flat. A note sung between two semitones (more than a quarter tone off)
 * is written as the neighbor that belongs to the key, when only one of the two does.
 */
export function snapToKey(sung: SungNote[], key: KeyInfo) {
  const scale = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
  const inKey = (m: number) => scale.includes((((m - key.tonic) % 12) + 12) % 12);
  for (const n of sung) {
    if (Math.abs(n.cents) < 22 || inKey(n.midi)) continue;
    const alt = n.midi + (n.cents > 0 ? 1 : -1);
    if (inKey(alt)) { n.cents = n.cents - (alt - n.midi) * 100; n.midi = alt; }
  }
}

/** Where the first downbeat goes when singing without a click: long notes tend to fall on strong beats. */
export function bestDownbeat(sung: SungNote[], bpm: number, timeSig: [number, number]): number {
  const beatMs = 60000 / bpm, barBeats = timeSig[0] * (4 / timeSig[1]);
  const t0 = sung[0].start;
  let best = t0, bv = -Infinity;
  for (let k = 0; k < barBeats * 2; k++) {
    const o = t0 - k * beatMs / 2; // the first note starts k eighths after the downbeat
    if ((t0 - o) / beatMs > barBeats - 0.5) break;
    let v = 0;
    for (const n of sung) {
      const b = (n.start - o) / beatMs, frac = Math.abs(b - Math.round(b));
      const inBar = ((Math.round(b) % barBeats) + barBeats) % barBeats;
      const strong = inBar === 0 ? 1 : barBeats === 4 && inBar === 2 ? 0.6 : 0.25;
      v += (frac < 0.2 ? strong : 0) * Math.min(3, (n.end - n.start) / beatMs);
    }
    v -= k * 0.15; // prefer no pickup
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}

/**
 * How strongly the long notes gather on the first beat of each bar for a given bar length (beats). A
 * waltz puts its weight every 3 beats, a march every 4 (or 2). Higher is a better fit.
 */
export function meterFit(sung: SungNote[], bpm: number, barBeats: number): number {
  const beatMs = 60000 / bpm;
  const t0 = sung[0].start;
  const w = sung.map((n) => Math.min(4, (n.end - n.start) / beatMs) + 0.25);
  const tot = w.reduce((a, b) => a + b, 0);
  let best = -Infinity;
  for (let k = 0; k < barBeats * 2; k++) {
    const o = t0 - k * beatMs / 2;
    let on = 0, cross = 0;
    sung.forEach((n, i) => {
      const b = (n.start - o) / beatMs;
      if (Math.abs(b - Math.round(b)) < 0.2 && ((Math.round(b) % barBeats) + barBeats) % barBeats === 0) on += w[i];
      const e = (n.end - o) / beatMs;
      if (Math.floor(e / barBeats - 0.1) > Math.floor(b / barBeats + 1e-9) && (n.end - n.start) / beatMs >= 1.5) cross += w[i] * 0.5;
    });
    best = Math.max(best, ((on - cross) / tot) * barBeats - k * 0.02);
  }
  return best;
}

/** 4/4, 3/4 or 2/4 from where the long notes fall (4/4 unless the tune clearly swings in threes). */
export function detectMeter(sung: SungNote[], bpm: number): [number, number] {
  if (sung.length < 6) return [4, 4];
  const f4 = meterFit(sung, bpm, 4), f3 = meterFit(sung, bpm, 3);
  if (f3 > f4 * 1.12 + 0.05) return [3, 4];
  return [4, 4];
}

/** Eighths unless many notes clearly fall between them (quick runs), then sixteenths. */
export function detectGrid(sung: SungNote[], bpm: number, origin: number): number {
  const beatMs = 60000 / bpm;
  let off = 0;
  for (const n of sung) { const x = (n.start - origin) / beatMs * 2; if (Math.abs(x - Math.round(x)) > 0.32 && n.end - n.start < beatMs * 0.5) off++; }
  return off / sung.length > 0.18 ? 0.25 : 0.5;
}

/** Everything in one go: readings -> melody. Without a fixed tempo, the tempo comes from the singing. */
export function transcribe(frames: PitchFrame[], opts: { bpm?: number; origin?: number; timeSig?: [number, number]; grid?: number } = {}): Melody | null {
  const sung = tidy(segment(cleanFrames(frames)));
  if (!sung.length) return null;
  snapToKey(sung, detectKey(sung));
  const bpm = opts.bpm ?? estimateTempo(sung);
  // time signature and shortest note: found from the singing unless given
  const timeSig = opts.timeSig ?? detectMeter(sung, bpm);
  let origin = opts.origin ?? sung[0].start;
  // free tempo: line the bar lines up with the strongest notes (a short first note may be a pickup)
  if (opts.origin === undefined) origin = bestDownbeat(sung, bpm, timeSig);
  const grid = opts.grid ?? detectGrid(sung, bpm, origin);
  const notes = quantize(sung, bpm, origin, timeSig, grid);
  const barBeats = timeSig[0] * (4 / timeSig[1]);
  const total = notes.reduce((a, n) => Math.max(a, n.beat + n.beats), 0);
  return { notes, bpm, timeSig, key: detectKey(notes), bars: Math.round(total / barBeats) };
}
