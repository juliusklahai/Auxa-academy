// Sing to score, version 2: syllable first, then pitch, then the hold.
//
// A sung melody is a chain of syllables. Each syllable is (consonant) + vowel: the vowel carries the
// pitch and lands on the beat, the consonant is how the syllable starts. So instead of cutting notes
// wherever the pitch moves (which turns scoops, slides and vibrato into extra notes, and misses repeated
// notes on soft consonants), we:
//   1. measure the room's noise and ignore anything at that level;
//   2. find every syllable boundary from several clues at once: breaks in voicing (t, k, s, p),
//      dips in loudness (m, n, l, w), changes in tone colour (a new vowel), consonant hiss, and pitch
//      steps between steady notes;
//   3. read each syllable's pitch from its steady vowel only;
//   4. time each note from its vowel onset; the written length is the hold until the next syllable.
// Pure functions over a whole recording (the app records the take, then writes it).

import { yin, fixOctave } from '../input/pitch';
import { downsample } from './audioFile';
import type { SungNote } from './transcribe';

export interface VoiceFrames {
  /** seconds per frame */
  hop: number;
  /** pitch (fractional MIDI) where clearly voiced, else null */
  f0: (number | null)[];
  /** pitch with a lower confidence bar (for rescuing weak vowels), else null */
  soft: (number | null)[];
  /** loudness in dB (whole band), voice band 80 Hz to 1.2 kHz, and consonant hiss 2.5 to 8 kHz */
  db: Float32Array; low: Float32Array; high: Float32Array;
  /** tone colour: 20 log-mel bands per frame */
  mel: Float32Array[];
}

// ---------- small DSP helpers ----------

/** In-place radix-2 FFT (re, im of length n, a power of two). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const hz2mel = (f: number) => 2595 * Math.log10(1 + f / 700);
const mel2hz = (m: number) => 700 * (10 ** (m / 2595) - 1);

/** Pitch, loudness, hiss and tone colour every 10 ms. */
export function analyzeVoice(input: Float32Array, inputRate: number, a4 = 440): VoiceFrames {
  const { x, sr } = downsample(input, inputRate);
  const hop = Math.round(sr * 0.01), pwin = Math.round(sr * 0.0427) & ~1, N = 512;
  const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const binHz = sr / N;
  // 20 mel bands, 80 Hz to 7.5 kHz
  const nb = 20, lo = hz2mel(80), hi = hz2mel(Math.min(7500, sr / 2 - 100));
  const edges = Array.from({ length: nb + 2 }, (_, i) => mel2hz(lo + ((hi - lo) * i) / (nb + 1)) / binHz);
  let peak = 0;
  for (let i = 0; i < x.length; i += 8) peak = Math.max(peak, Math.abs(x[i]));
  const floor = Math.max(0.0003, peak * 0.008);
  const f0: (number | null)[] = [], soft: (number | null)[] = [], mel: Float32Array[] = [];
  const dbs: number[] = [], lows: number[] = [], highs: number[] = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let c = Math.max(pwin, N) / 2; c + Math.max(pwin, N) / 2 <= x.length; c += hop) {
    // pitch
    const w = x.subarray(c - pwin / 2, c + pwin / 2);
    // silence: no pitch to read (skips most of the work between phrases)
    let en = 0;
    for (let i = 0; i < w.length; i += 4) en += w[i] * w[i];
    const e = Math.sqrt(en / (w.length / 4)) > floor ? yin(w, sr, 70, 1100) : { freq: 0, confidence: 0, rms: 0 };
    if (e.freq > 0) e.freq = fixOctave(w, sr, e.freq);
    const m = e.freq > 0 ? 69 + 12 * Math.log2(e.freq / a4) : null;
    f0.push(m !== null && e.confidence >= 0.75 && e.rms > floor ? m : null);
    soft.push(m !== null && e.confidence >= 0.5 && e.rms > floor ? m : null);
    // spectrum
    for (let i = 0; i < N; i++) { re[i] = (x[c - N / 2 + i] ?? 0) * hann[i]; im[i] = 0; }
    fft(re, im);
    let tot = 1e-12, low = 1e-12, high = 1e-12;
    const pw = new Float64Array(N / 2);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      pw[k] = p; tot += p;
      const f = k * binHz;
      if (f >= 80 && f < 1200) low += p;
      else if (f >= 2500) high += p;
    }
    dbs.push(10 * Math.log10(tot)); lows.push(10 * Math.log10(low)); highs.push(10 * Math.log10(high));
    const mb = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      let s = 1e-12;
      for (let k = Math.floor(edges[b]); k <= Math.ceil(edges[b + 2]) && k < N / 2; k++) {
        const wgt = k < edges[b + 1] ? (k - edges[b]) / (edges[b + 1] - edges[b]) : (edges[b + 2] - k) / (edges[b + 2] - edges[b + 1]);
        if (wgt > 0) s += pw[k] * wgt;
      }
      mb[b] = 10 * Math.log10(s);
    }
    mel.push(mb);
  }
  return { hop: hop / sr, f0, soft, db: Float32Array.from(dbs), low: Float32Array.from(lows), high: Float32Array.from(highs), mel };
}

const medianOf = (a: number[]) => { const s = [...a].sort((p, q) => p - q); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const pct = (a: ArrayLike<number>, q: number) => { const s = Array.from(a).sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const smooth = (a: ArrayLike<number>, r: number) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) { s += a[k]; n++; } o[i] = s / n; } return o; };

export interface Syllable {
  /** where the syllable begins (consonant), where its vowel begins (the timing point), where the voice stops; ms */
  start: number; vowel: number; end: number;
  /** written pitch, how far off it was sung (cents), how steady */
  midi: number; cents: number; spread: number;
  /** what started it: a break in the voice, a dip, a change of vowel, or a pitch step (a slur on one vowel) */
  cause: 'gap' | 'dip' | 'vowel' | 'pitch' | 'first';
}

export interface SyllableOpts {
  /** frames of room noise recorded before singing (dB per frame), when available */
  roomDb?: number[];
  /** times (ms) of metronome clicks: never a syllable on their own */
  clicks?: number[];
  /** receives the key and tuning the notes were written in */
  key?: { tonic?: number; mode?: 'major' | 'minor'; offset?: number };
  /** troubleshooting: receives every candidate boundary considered */
  debug?: { t: number; cause: string; score: number; depth?: number; kept: boolean }[];
}

/**
 * Splits a take into syllables. Returns them in order, each with its own pitch.
 */
export function findSyllables(v: VoiceFrames, opts: SyllableOpts = {}): Syllable[] {
  const n = v.db.length, ms = v.hop * 1000;
  if (n < 10) return [];
  const db = smooth(v.db, 2), low = smooth(v.low, 2);
  // 1. noise floor and singing level: anything near the room's level is not singing
  const noise = opts.roomDb?.length ? medianOf(opts.roomDb) : pct(db, 0.08);
  const loud = pct(db, 0.97);
  const gate = Math.max(noise + 9, loud - 38);
  // 2. voiced frames: a clear pitch, well above the noise
  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) voiced[i] = v.f0[i] !== null && db[i] > gate ? 1 : 0;
  // weak vowels: a softer pitch reading counts inside a loud stretch
  for (let i = 0; i < n; i++) if (!voiced[i] && v.soft[i] !== null && db[i] > gate + 6) voiced[i] = 1;
  // fill dropouts under 30 ms, drop specks under 50 ms
  const runs = (): [number, number][] => { const r: [number, number][] = []; let s = -1; for (let i = 0; i <= n; i++) { if (i < n && voiced[i]) { if (s < 0) s = i; } else if (s >= 0) { r.push([s, i]); s = -1; } } return r; };
  let rs = runs();
  for (let k = 0; k + 1 < rs.length; k++) if ((rs[k + 1][0] - rs[k][1]) * ms < 30) for (let i = rs[k][1]; i < rs[k + 1][0]; i++) voiced[i] = 1;
  rs = runs();
  for (const [a, b] of rs) if ((b - a) * ms < 50) for (let i = a; i < b; i++) voiced[i] = 0;
  rs = runs();
  // pitch per frame, smoothed (median over 50 ms), only on voiced frames
  const pitch: (number | null)[] = Array.from({ length: n }, (_, i) => {
    if (!voiced[i]) return null;
    const w: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { const p = v.f0[k] ?? v.soft[k]; if (p !== null && voiced[k]) w.push(p); }
    return w.length ? medianOf(w) : null;
  });
  // octave slips: a frame far from the melody around it moves by an octave
  const allP = pitch.filter((p): p is number => p !== null);
  const center = allP.length ? medianOf(allP) : 60;
  for (let i = 0; i < n; i++) {
    let p = pitch[i];
    if (p === null) continue;
    const near: number[] = [];
    for (let k = Math.max(0, i - 150); k <= Math.min(n - 1, i + 150); k += 3) { const q = pitch[k]; if (q !== null) near.push(q); }
    const c = (near.length ? medianOf(near) : center) * 0.5 + center * 0.5;
    while (p - c > 9.5) p -= 12;
    while (c - p > 8.5) p += 12;
    pitch[i] = p;
  }
  // tone colour change: distance between the average spectrum just before and just after each frame
  const timbre = new Float32Array(n);
  const W = 5; // 50 ms each side
  for (let i = W; i < n - W; i++) {
    if (!voiced[i]) continue;
    let d = 0;
    for (let b = 0; b < v.mel[0].length; b++) {
      let a = 0, c = 0;
      for (let k = 1; k <= W; k++) { a += v.mel[i - k][b]; c += v.mel[i + k - 1][b]; }
      d += Math.abs(a - c) / W;
    }
    timbre[i] = d / v.mel[0].length;
  }
  const tMed = pct(Array.from(timbre).filter((x) => x > 0), 0.5) || 1;
  const TZ = 3.4; // a clear change of vowel on its own (legato syllables with no dip in loudness)

  // 3. boundaries inside each voiced run
  type B = { i: number; cause: Syllable['cause']; score: number; depth?: number };
  const bounds: B[] = [];
  const minSyl = Math.round(95 / ms); // shortest syllable
  for (const [a, b] of rs) {
    bounds.push({ i: a, cause: bounds.length ? 'gap' : 'first', score: 9 });
    // loudness valleys with real peaks on both sides (a voiced consonant or a re-sung vowel)
    const cands: B[] = [];
    for (let i = a + minSyl; i < b - minSyl; i++) {
      if (!(low[i] <= low[i - 1] && low[i] < low[i + 1])) continue;
      let pl = -Infinity, pr = -Infinity;
      for (let k = Math.max(a, i - 25); k < i; k++) pl = Math.max(pl, low[k]);
      for (let k = i + 1; k <= Math.min(b - 1, i + 25); k++) pr = Math.max(pr, low[k]);
      const depth = Math.min(pl, pr) - low[i];
      // tone change near the valley
      let tc = 0;
      for (let k = Math.max(a, i - 4); k <= Math.min(b - 1, i + 4); k++) tc = Math.max(tc, timbre[k]);
      const tz = tc / tMed;
      // consonant hiss rising against the vowel band
      let hiss = 0;
      for (let k = Math.max(a, i - 3); k <= Math.min(b - 1, i + 3); k++) hiss = Math.max(hiss, (v.high[k] - v.low[k]) - (v.high[Math.max(a, i - 12)] - v.low[Math.max(a, i - 12)]));
      const score = depth / 2.5 + Math.max(0, tz - 1.2) * 0.9 + Math.max(0, hiss) / 6;
      if ((depth >= 3 && score >= 1.6) || (depth >= 2 && tz >= 2.2) || (depth >= 0.8 && tz >= TZ)) cands.push({ i, cause: depth >= 3 ? 'dip' : 'vowel', score, depth });
    }
    // pitch steps between steady notes (hymns are mostly one note per syllable, so a step usually is one)
    const seg: number[] = [];
    for (let i = a; i < b; i++) { const p = pitch[i]; if (p !== null) seg.push(i); }
    const pv = (i: number) => pitch[i] ?? NaN;
    const P = 8; // each side of a step must hold steady for 80 ms
    for (let i = a + P; i < b - P; i++) {
      const before: number[] = [], after: number[] = [];
      for (let k = i - P; k < i - 1; k++) if (!isNaN(pv(k))) before.push(pv(k));
      for (let k = i + 2; k < i + P + 1; k++) if (!isNaN(pv(k))) after.push(pv(k));
      if (before.length < P - 3 || after.length < P - 3) continue;
      const mb = medianOf(before), ma = medianOf(after);
      const steadyB = before.filter((p) => Math.abs(p - mb) < 0.35).length >= before.length * 0.75;
      const steadyA = after.filter((p) => Math.abs(p - ma) < 0.35).length >= after.length * 0.75;
      const jump = Math.abs(ma - mb);
      if (jump >= 0.75 && steadyB && steadyA) {
        // the step is where the pitch crosses halfway
        let at = i;
        for (let k = i - 3; k <= i + 3; k++) { const p = pv(k); if (!isNaN(p) && Math.abs(p - mb) > Math.abs(p - ma)) { at = k; break; } }
        cands.push({ i: at, cause: 'pitch', score: 1.5 + jump });
        i += P - 2;
      }
    }
    void seg;
    // keep the strongest boundaries at least minSyl apart (and away from the run's start)
    cands.sort((p, q) => q.score - p.score);
    const kept: B[] = [];
    for (const c of cands) {
      if (c.i - a < minSyl || b - c.i < minSyl) continue;
      if (kept.some((k) => Math.abs(k.i - c.i) < minSyl)) continue;
      kept.push(c);
    }
    if (opts.debug) for (const c of cands) opts.debug.push({ t: c.i * ms, cause: c.cause, score: c.score, depth: c.depth, kept: kept.includes(c) });
    kept.sort((p, q) => p.i - q.i);
    bounds.push(...kept);
  }
  // clicks are never a syllable on their own: drop a boundary that is only a click
  const clickF = (opts.clicks ?? []).map((t) => t / ms);
  const isClick = (i: number) => clickF.some((c) => Math.abs(c - i) <= 3);

  // 4. pieces between boundaries, each with its pitch (fractional for now) and how steady it is
  type Piece = { a: number; b: number; st: number; m: number; spread: number; cause: Syllable['cause']; depth: number };
  const runEnd = (i: number) => { for (const [a, b] of rs) if (i >= a && i < b) return b; return i + 1; };
  const measure = (a: number, b: number) => {
    const ps: number[] = [];
    for (let i = a; i < b; i++) { const p = pitch[i]; if (p !== null) ps.push(p); }
    if (ps.length < 3) return null;
    // the steady part: skip the scoop at the start and the fall at the end, keep readings near the middle
    const body = ps.length >= 8 ? ps.slice(Math.floor(ps.length * 0.2), Math.ceil(ps.length * 0.88)) : ps;
    const m0 = medianOf(body);
    const close = body.filter((p) => Math.abs(p - m0) < 0.6);
    const m = medianOf(close.length >= 3 ? close : body);
    const folded = body.map((p) => p - 12 * Math.round((p - m) / 12)).sort((p, q) => p - q);
    return { m, spread: folded[Math.floor(folded.length * 0.75)] - folded[Math.floor(folded.length * 0.25)] };
  };
  const pieces: Piece[] = [];
  for (let k = 0; k < bounds.length; k++) {
    const s = bounds[k];
    const e = Math.min(bounds[k + 1]?.i ?? n, runEnd(s.i));
    if ((e - s.i) * ms < 60) continue;
    if (s.cause === 'gap' && isClick(s.i) && (e - s.i) * ms < 120) continue;
    const r = measure(s.i, e);
    if (!r) continue;
    // a consonant start that was not voiced: look back for hiss just before the voice
    let st = s.i;
    if (s.cause === 'gap' || s.cause === 'first') {
      for (let i = s.i - 1; i >= Math.max(0, s.i - 15); i--) { if (v.high[i] > gate - 4 && v.high[i] - v.low[i] > -6 && !voiced[i]) st = i; else break; }
    }
    pieces.push({ a: s.i, b: e, st, m: r.m, spread: r.spread, cause: s.cause, depth: s.depth ?? 0 });
  }
  // 5. fold back what is not a note of its own:
  //    - a scoop or slide into a note (a short or wavering piece before a pitch step);
  //    - a wobble on one held note (a small step with a short piece);
  //    - the consonant of a syllable (r, l, ng) seen as a dip, on the same pitch;
  //    - a dropout in the pitch reading in the middle of a held note (the voice did not stop).
  const len = (q: Piece) => (q.b - q.a) * ms;
  const voiceStopped = (a: number, b: number) => {
    let lo = Infinity, around = Math.max(low[Math.max(0, a - 3)], low[Math.min(n - 1, b + 2)]);
    for (let i = a; i <= b; i++) lo = Math.min(lo, low[i]);
    let hiss = false;
    for (let i = a; i <= b; i++) if (v.high[i] - v.low[i] > -3 && v.high[i] > gate - 6) hiss = true;
    return around - lo >= 6 || hiss;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (let k = 1; k < pieces.length; k++) {
      const A = pieces[k - 1], B = pieces[k], d = Math.abs(A.m - B.m);
      const touching = B.a - A.b <= 1;
      let merge = false, keep: 'A' | 'B' = len(A) >= len(B) ? 'A' : 'B';
      if (B.cause === 'pitch' && touching) {
        if (len(A) < 170 && A.cause !== 'pitch' && A.spread > 0.3) { merge = true; keep = 'B'; } // scoop into B
        else if (d < 1.4 && Math.min(len(A), len(B)) < 210 && (d < 1.0 || (len(A) < len(B) ? A : B).spread > 0.3)) merge = true; // wobble or a vowel glide
        else if (A.spread > 0.6 && len(A) < 320) { merge = true; keep = 'B'; }              // a slide
      } else if ((B.cause === 'dip' || B.cause === 'vowel') && touching) {
        if (d < 1.2 && Math.min(len(A), len(B)) < 210 && B.depth < 4.5) merge = true;     // a consonant (gr, l, ng) on about one pitch
      } else if (B.cause === 'gap') {
        const gapMs = (B.a - A.b) * ms;
        if (gapMs < 110 && d < 0.6 && !voiceStopped(A.b, B.a)) merge = true;               // pitch dropout
      }
      if (!merge) continue;
      const m = keep === 'A' ? A.m : B.m, sp = keep === 'A' ? A.spread : B.spread;
      pieces.splice(k - 1, 2, { a: A.a, b: B.b, st: A.st, m, spread: sp, cause: A.cause, depth: A.depth });
      changed = true;
      break;
    }
  }
  const out: Syllable[] = pieces.map((q) => ({ start: q.st * ms, vowel: q.a * ms, end: q.b * ms, midi: q.m, cents: 0, spread: q.spread, cause: q.cause }));
  // the singer's own tuning: many people sing a little flat or sharp of A = 440 overall. Find the offset
  // that best centres the steady syllables on semitones, and write every note relative to it.
  const dec = decodePitches(out.map((x) => ({ m: x.midi, w: Math.min(1.5, (x.end - x.vowel) / 300) * (x.spread < 0.5 ? 1 : 0.4) })));
  out.forEach((x, i) => { x.cents = Math.round((x.midi - dec.offset - dec.notes[i]) * 100); x.midi = dec.notes[i]; });
  if (opts.key) Object.assign(opts.key, { tonic: dec.tonic, mode: dec.mode, offset: dec.offset });
  return out;
}

/**
 * Key, tuning and written pitches decided together, the way a musician hears a slightly loose singer:
 * every key and tuning offset is tried, and the one where the sung notes sit closest to that key's scale
 * wins. Each note is then written as the scale note it was aiming for; it stays chromatic only when it
 * was clearly sung there.
 */
export function decodePitches(ps: { m: number; w: number }[]): { notes: number[]; offset: number; tonic: number; mode: 'major' | 'minor' } {
  const MAJ = [1, 0.12, 0.7, 0.12, 0.85, 0.7, 0.12, 0.9, 0.12, 0.7, 0.12, 0.6];
  const MIN = [1, 0.12, 0.7, 0.85, 0.12, 0.7, 0.12, 0.9, 0.7, 0.12, 0.45, 0.5];
  const sig2 = 2 * 0.3 * 0.3;
  let best = { score: -Infinity, offset: 0, tonic: 0, mode: 'major' as 'major' | 'minor' };
  for (let o = -0.5; o < 0.5; o += 0.05) for (let tonic = 0; tonic < 12; tonic++) for (const mode of ['major', 'minor'] as const) {
    const prof = mode === 'major' ? MAJ : MIN;
    let sc = mode === 'minor' ? -1.2 : 0; // a loosely sung tune reads as major unless minor is clearly better
    for (const p of ps) {
      const x = p.m - o, base = Math.round(x);
      let l = 1e-9;
      for (let k = base - 1; k <= base + 1; k++) l += prof[(((k - tonic) % 12) + 12) % 12] * Math.exp(-((x - k) ** 2) / sig2);
      sc += p.w * Math.log(l);
    }
    if (sc > best.score) best = { score: sc, offset: o, tonic, mode };
  }
  const prof = best.mode === 'major' ? MAJ : MIN;
  const notes = ps.map((p) => {
    const x = p.m - best.offset, base = Math.round(x);
    let bk = base, bl = -1;
    for (let k = base - 1; k <= base + 1; k++) { const l = prof[(((k - best.tonic) % 12) + 12) % 12] * Math.exp(-((x - k) ** 2) / sig2); if (l > bl) { bl = l; bk = k; } }
    return bk;
  });
  return { notes, offset: best.offset, tonic: best.tonic, mode: best.mode };
}

/** The overall tuning offset (in semitones, -0.5..0.5) of a set of sung pitches: a weighted circular mean of their fractions. */
export function tuningOffset(ps: { m: number; w: number }[]): number {
  let x = 0, y = 0;
  for (const p of ps) { const a = 2 * Math.PI * (p.m - Math.round(p.m)); x += p.w * Math.cos(a); y += p.w * Math.sin(a); }
  if (Math.hypot(x, y) < 1e-6) return 0;
  return Math.atan2(y, x) / (2 * Math.PI);
}

/** Syllables as notes (for the existing tempo, key and notation steps). Each note starts at its vowel. */
export function syllablesToNotes(syl: Syllable[]): SungNote[] {
  return syl.map((s) => ({ midi: s.midi, start: s.vowel, end: s.end, cents: s.cents, spread: s.spread }));
}
