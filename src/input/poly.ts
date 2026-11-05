// Polyphonic piano detection from microphone audio (chords and several notes at once).
//
// Pipeline (pure TypeScript, unit-tested in tests/poly.test.ts):
//  1. Onset detection: log-magnitude spectral flux on a short window with an adaptive threshold.
//  2. "New energy" spectrum: long-window magnitude ~95 ms after the onset MINUS the spectrum just before it.
//     Notes that were already ringing cancel out, so only freshly struck keys remain.
//  3. Multi-pitch estimation: iterative harmonic-sum salience (piano partials with inharmonicity),
//     pick the strongest note, subtract its partials with spectral smoothing (so an octave played on top
//     still survives), repeat.
//  4. Score-informed confidence: the notes the lesson expects get a small prior. Unexpected notes need
//     stronger evidence, and an unexpected note that sits on a harmonic of a detected note is downgraded
//     to "uncertain" (never a confirmed mistake).

import { midiToFreq } from '../core/music';

// ---------- FFT ----------
export function fftMag(frame: Float32Array, n: number): Float32Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  const w = frame.length;
  for (let i = 0; i < w; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (w - 1)));
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
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / w;
  return mag;
}

// ---------- Multi-pitch estimation ----------
export interface PolyNote { midi: number; confidence: number; expected: boolean; salience: number }

/** What kind of keyboard sound the microphone is hearing. */
export type SoundProfile = 'piano' | 'epiano' | 'organ' | 'synth';

export interface PolyOptions {
  profile?: SoundProfile;
  lo?: number; hi?: number;   // MIDI search range
  expected?: number[] | null; // score-informed prior (current target notes)
  sensitivity?: number;       // 0.5 (strict) .. 1.5 (sensitive), default 1
  maxNotes?: number;
  masked?: number[];          // notes the app is playing (echo gate)
  debug?: (msg: string) => void;
}

const B_INHARM = 0.0003;
const MAX_FREQ = 5000;

function partialFreq(f0: number, h: number) { return f0 * h * Math.sqrt(1 + B_INHARM * h * h); }

let sideLobeRef: Float32Array | null = null;

/** Strongest LOCAL MAXIMUM within +-tolSemi of f, with the extent of its spectral lobe (valley to valley).
 *  Using true peaks (not window maxima) stops a note's leakage from creating ghost notes a semitone away. */
function peakAt(mag: Float32Array, binHz: number, f: number, tolSemi: number): { v: number; i0: number; i1: number } {
  const lo = Math.max(2, Math.floor((f * Math.pow(2, -tolSemi / 12)) / binHz));
  const hi = Math.min(mag.length - 3, Math.ceil((f * Math.pow(2, tolSemi / 12)) / binHz));
  let v = 0, at = -1;
  for (let i = lo; i <= hi; i++) {
    if (mag[i] >= mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > v) { v = mag[i]; at = i; }
  }
  if (at < 0) return { v: 0, i0: lo, i1: lo - 1 };
  // ignore window side-lobes: a real partial is not tiny next to a much bigger peak a few bins away
  // (judged on the original spectrum, so side-lobes do not become "peaks" once the main peak is removed)
  const ref = sideLobeRef ?? mag;
  let near = 0;
  for (let i = Math.max(1, at - 6); i <= Math.min(ref.length - 1, at + 6); i++) if (ref[i] > near) near = ref[i];
  if (sideLobeRef) v = Math.min(v, Math.max(0, mag[at]));
  if (v < near * 0.1) return { v: 0, i0: lo, i1: lo - 1 };
  let i0 = at, i1 = at;
  while (i0 > 1 && mag[i0 - 1] <= mag[i0] && at - i0 < 8) i0--;
  while (i1 < mag.length - 2 && mag[i1 + 1] <= mag[i1] && i1 - at < 8) i1++;
  return { v, i0, i1 };
}

function harmonics(f0: number) {
  const out: number[] = [];
  for (let h = 1; h <= 12 && partialFreq(f0, h) < MAX_FREQ; h++) out.push(h);
  return out;
}

/** Remove a note's partials from a spectrum. Partials much louder than their neighbours are shared
 *  with another note (octave, fifth...), so only this note's share is removed there. */
function subtractNote(mag: Float32Array, binHz: number, midi: number, full = false) {
  const f0 = midiToFreq(midi);
  const hs = harmonics(f0);
  const amps = hs.map((h) => peakAt(mag, binHz, partialFreq(f0, h), h === 1 ? 0.45 : 0.3));
  amps.forEach((pk, k) => {
    const nb = Math.max(amps[k - 1]?.v ?? 0, amps[k + 1]?.v ?? 0);
    const sub = !full && nb > 0 && pk.v > 1.5 * nb ? nb * 1.1 : pk.v;
    for (let i = pk.i0; i <= pk.i1; i++) mag[i] = Math.max(0, mag[i] - sub * (mag[i] / Math.max(pk.v, 1e-12)));
  });
}

/** Estimate the set of simultaneously sounding (new) notes in a magnitude spectrum. */
export function estimateNotes(magIn: Float32Array, sampleRate: number, fftSize: number, floor: number, opts: PolyOptions = {}): PolyNote[] {
  const binHz = sampleRate / fftSize;
  const lo = opts.lo ?? 36, hi = opts.hi ?? 96;
  const expected = new Set(opts.expected ?? []);
  const sens = opts.sensitivity ?? 1;
  const pureOk = opts.profile === 'epiano' || opts.profile === 'organ';
  let peakAll = 0;
  for (let i = 0; i < magIn.length; i++) if (magIn[i] > peakAll) peakAll = magIn[i];
  peakAll /= Math.max(floor, 1e-7);
  const mag = Float32Array.from(magIn);
  sideLobeRef = magIn;
  const ref = Math.max(floor, 1e-7);
  const found: PolyNote[] = [];
  let first = 0;
  // Echo gate: notes the APP itself just played (accompaniment through speakers) are removed first
  // and can never be reported, unless the lesson expects that very note from the learner.
  const masked = new Set((opts.masked ?? []).filter((m) => !expected.has(m)));
  masked.forEach((m) => subtractNote(mag, binHz, m));

  for (let iter = 0; iter < (opts.maxNotes ?? 6); iter++) {
    let best = -1, bestS = 0, bestRaw = 0;
    for (let p = lo; p <= hi; p++) {
      if (found.some((n) => n.midi === p) || masked.has(p)) continue;
      const f0 = midiToFreq(p);
      let s = 0, hits = 0, fundA = 0;
      const hs = harmonics(f0);
      for (const h of hs) {
        const a = peakAt(mag, binHz, partialFreq(f0, h), h === 1 ? 0.45 : 0.3).v / ref;
        const v = Math.log1p(Math.max(0, a - 1));
        if (a > 3) hits++;
        if (h === 1) fundA = a;
        s += v / Math.pow(h, 0.7);
      }
      // a real note shows several partials; a lone peak is not a note
      // Pure-toned sounds (electric piano, organ flute stops) may show only the fundamental:
      // allowed for those profiles when the fundamental itself is strong.
      const needHits = pureOk ? (fundA > 8 && fundA >= 0.2 * peakAll ? 1 : 2) : 2;
      if (hits < Math.min(needHits, hs.length)) continue;
      // the fundamental region must show energy for mid/high notes (rejects sub-octave ghosts)
      const fund = peakAt(mag, binHz, f0, 0.45).v / ref;
      if ((p >= 48 || pureOk) && fund < 2) continue;
      const prior = expected.has(p) ? 1.2 : 1;
      if (opts.debug && expected.has(p)) opts.debug(`iter${iter} p${p} s=${s.toFixed(2)} hits=${hits} fund=${fund.toFixed(1)}`);
      if (s * prior > bestS) { bestS = s * prior; best = p; bestRaw = s; }
    }
    if (best < 0) break;
    if (iter === 0) first = bestRaw;
    const isExpectedNote = (m: number) => expected.has(m);
    const isExp = expected.has(best);
    const minAbs = 2.2 / sens;
    if (bestRaw < minAbs || bestRaw < first * 0.18) break;

    // Organ stops (4', 2') put strong energy on octaves of the note itself: remove it all,
    // expected octave notes are recovered by the joint check below.
    subtractNote(mag, binHz, best, pureOk);

    // Confidence = absolute evidence AND strength relative to the loudest new note of this onset.
    // Leakage and overtone residue is typically < 25% of the main note, a real chord tone > 40%.
    const rel = bestRaw / first;
    const [r0, r1] = isExpectedNote(best) ? [0.12, 0.32] : [0.22, 0.48];
    const relConf = Math.max(0, Math.min(1, (rel - r0) / (r1 - r0)));
    let conf = Math.min(1 - Math.exp(-bestRaw / (3.5 / sens)), 0.6 + 0.4 * relConf) * (relConf < 1 ? 0.8 + 0.2 * relConf : 1);
    if (!isExp) {
      conf *= expected.size ? 0.93 : 0.97;
      // sits on a harmonic of an already detected lower note: likely an overtone artefact -> uncertain
      const harmonicOfFound = found.some((n) => [12, 19, 24, 28, 31, 36].includes(best - n.midi))
        || [...masked].some((m) => [12, 19, 24, 28, 31, 36].includes(best - m) || [12, 24].includes(m - best));
      if (harmonicOfFound) conf *= 0.6;
    }
    found.push({ midi: best, confidence: Math.min(1, conf), expected: isExp, salience: bestRaw });
  }
  // Score-informed verification: in dense chords (e.g. C3 + C4 E4 G4) every partial of an expected note
  // can be shared with other notes, so greedy subtraction can miss it. Fit all candidates jointly
  // (non-negative least squares on harmonic templates) and accept expected notes with a real share.
  const missing = [...expected].filter((m) => m >= lo && m <= hi && !found.some((n) => n.midi === m));
  if (missing.length && found.length) {
    const cands = [...found.map((n) => n.midi), ...missing];
    const gains = nnlsTemplates(magIn, binHz, cands);
    const n0 = found.length;
    const gmax = Math.max(...gains.slice(0, n0), 1e-12);
    missing.forEach((m, k) => {
      const g = gains[n0 + k] / gmax;
      opts.debug?.(`nnls-check ${m} g=${g.toFixed(3)}`);
      if (g >= 0.2) {
        const confidence = Math.min(1, 0.55 + g);
        found.push({ midi: m, confidence, expected: true, salience: g * first });
      }
    });
  }
  sideLobeRef = null;
  return found.sort((a, b) => a.midi - b.midi);
}

/** Template for a piano note: partial amplitudes ~ 1/h, weaker fundamental in the bass. */
function template(p: number, h: number) { return (h === 1 && p < 52 ? 0.5 : 1) / h; }

/** Non-negative least squares (coordinate descent) of observed partial peaks against note templates. */
export function nnlsTemplates(mag: Float32Array, binHz: number, notes: number[]): number[] {
  const rows: { f: number; y: number }[] = [];
  const A: Map<number, number>[] = [];
  notes.forEach((p, j) => {
    const f0 = midiToFreq(p);
    for (const h of harmonics(f0).slice(0, 8)) {
      const f = partialFreq(f0, h);
      let r = rows.findIndex((row) => Math.abs(Math.log2(row.f / f)) < 0.3 / 12);
      if (r < 0) { rows.push({ f, y: peakAt(mag, binHz, f, 0.3).v }); A.push(new Map()); r = rows.length - 1; }
      A[r].set(j, (A[r].get(j) ?? 0) + template(p, h));
    }
  });
  const g = new Array(notes.length).fill(0);
  const col = (j: number) => A.map((m) => m.get(j) ?? 0);
  const cols = notes.map((_, j) => col(j));
  const norms = cols.map((c) => c.reduce((a, b) => a + b * b, 0) || 1);
  for (let it = 0; it < 300; it++) {
    for (let j = 0; j < notes.length; j++) {
      let dot = 0;
      for (let r = 0; r < rows.length; r++) {
        let pred = 0;
        for (let k = 0; k < notes.length; k++) pred += cols[k][r] * g[k];
        dot += cols[j][r] * (rows[r].y - pred);
      }
      g[j] = Math.max(0, g[j] + dot / norms[j]);
    }
  }
  return g;
}

export function medianFloor(mag: Float32Array, sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  const a = Array.from(mag.subarray(Math.floor(60 / binHz), Math.floor(4000 / binHz))).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)] || 1e-7;
}

// ---------- Streaming tracker ----------
export interface PolyEvent { notes: PolyNote[]; onsetMs: number }

/**
 * Feed it the most recent `window` samples every hop (~20 ms). Returns an event ~95 ms after each onset.
 * `getExpected` supplies the lesson's current target notes (score-informed detection).
 */
export class PolyTracker {
  readonly fftSize = 8192;
  private prevShort: Float32Array | null = null;
  private fluxHist: number[] = [];
  private lastOnset = -1e9;
  private longHist: { t: number; mag: Float32Array }[] = [];
  private pending: { t: number; pre: Float32Array | null } | null = null;
  noiseGate = 0.01;
  sensitivity = 1;
  profile: SoundProfile = 'piano';
  analysisDelayMs = 95;
  lastFlux = 0;
  /** Background noise spectrum (hum, fans, room tone), learned continuously from quiet moments. */
  noiseSpec: Float32Array | null = null;
  private quietFrames = 0;
  /** A second look ~60 ms later: notes must still be there (rejects clicks, thumps and ghosts). */
  confirmMs = 60;
  private confirm: { t: number; onsetMs: number; notes: PolyNote[]; pre: Float32Array | null } | null = null;

  constructor(public sampleRate: number, public getExpected: () => number[] | null = () => null,
    /** notes the app started around this onset time (performance.now ms) */
    public getMasked: (onsetMs: number) => number[] = () => []) {}

  reset() { this.prevShort = null; this.fluxHist = []; this.pending = null; this.longHist = []; this.confirm = null; }

  /** New energy since before the onset, with the room's background noise removed. */
  private freshSpectrum(long: Float32Array, pre: Float32Array | null) {
    const fresh = new Float32Array(long.length);
    const ns = this.quietFrames > 8 ? this.noiseSpec : null;
    for (let i = 0; i < long.length; i++) fresh[i] = Math.max(0, long[i] - Math.max(pre ? pre[i] * 1.1 : 0, ns ? ns[i] * 1.6 : 0));
    return fresh;
  }
  private floorOf(long: Float32Array) {
    const f = Math.max(medianFloor(long, this.sampleRate, this.fftSize), 2e-6);
    return this.noiseSpec && this.quietFrames > 8 ? Math.max(f, medianFloor(this.noiseSpec, this.sampleRate, this.fftSize) * 1.2) : f;
  }

  process(buf: Float32Array, nowMs: number): PolyEvent | null {
    // short window for onsets (last 2048 samples)
    const short = buf.subarray(buf.length - 2048);
    let e = 0;
    for (let i = 0; i < short.length; i++) e += short[i] * short[i];
    const rmsShort = Math.sqrt(e / short.length);
    const sm = fftMag(short, 2048);
    let flux = 0;
    if (this.prevShort) for (let i = 2; i < 700; i++) flux += Math.max(0, Math.log1p(sm[i] * 2000) - Math.log1p(this.prevShort[i] * 2000));
    this.prevShort = sm;
    this.lastFlux = flux;
    const mean = this.fluxHist.length ? this.fluxHist.reduce((a, b) => a + b, 0) / this.fluxHist.length : 0;
    this.fluxHist.push(flux);
    if (this.fluxHist.length > 12) this.fluxHist.shift();

    const long = fftMag(buf, this.fftSize);
    this.longHist.push({ t: nowMs, mag: long });
    if (this.longHist.length > 10) this.longHist.shift();
    // learn the room: while nothing is being played, track the background spectrum (slowly, and
    // only downward quickly) so steady hum or fan noise is never heard as notes
    if (!this.pending && !this.confirm && rmsShort < this.noiseGate * 1.2 && nowMs - this.lastOnset > 400) {
      this.quietFrames++;
      if (!this.noiseSpec) this.noiseSpec = Float32Array.from(long);
      else for (let i = 0; i < long.length; i++) { const n = this.noiseSpec[i]; this.noiseSpec[i] = long[i] < n ? n * 0.7 + long[i] * 0.3 : n * 0.97 + long[i] * 0.03; }
    }

    // second look for notes that were not certain
    if (this.confirm && nowMs - this.confirm.t >= this.confirmMs) {
      const c = this.confirm;
      this.confirm = null;
      const fresh = this.freshSpectrum(long, c.pre);
      const floor = this.floorOf(long);
      const again = estimateNotes(fresh, this.sampleRate, this.fftSize, floor, { expected: this.getExpected(), sensitivity: this.sensitivity * 1.15, profile: this.profile, masked: this.getMasked(c.onsetMs) });
      const kept = c.notes.filter((n) => n.confidence >= 0.8 || n.expected || again.some((a) => a.midi === n.midi));
      return kept.length ? { notes: kept, onsetMs: c.onsetMs } : null;
    }

    const isOnset = rmsShort > this.noiseGate && flux > mean * 1.6 + 25 / this.sensitivity && nowMs - this.lastOnset > 70;
    if (isOnset && this.pending && nowMs - this.pending.t >= 30) {
      // a newer attack (e.g. the real note after a key-release click): analyse from here, keep the
      // spectrum from before the first onset so both are measured as new energy
      this.pending.t = nowMs;
      this.lastOnset = nowMs;
    } else if (isOnset && !this.pending) {
      this.lastOnset = nowMs;
      // the long window that ended just before this onset = what was already sounding
      const window = (buf.length / this.sampleRate) * 1000;
      const pre = [...this.longHist].reverse().find((h) => h.t <= nowMs - 25)?.mag ?? null;
      void window;
      this.pending = { t: nowMs, pre };
    }
    if (this.pending && nowMs - this.pending.t >= this.analysisDelayMs) {
      const { t, pre } = this.pending;
      this.pending = null;
      const fresh = this.freshSpectrum(long, pre);
      const floor = this.floorOf(long);
      const onsetMs = t - (1024 / this.sampleRate) * 1000; // start of the attack inside the short window
      const notes = estimateNotes(fresh, this.sampleRate, this.fftSize, floor, { expected: this.getExpected(), sensitivity: this.sensitivity, profile: this.profile, masked: this.getMasked(onsetMs) });
      if (!notes.length) return null;
      // unexpected notes with only moderate evidence get a second look before they are reported
      if (this.confirmMs > 0 && notes.some((n) => !n.expected && n.confidence < 0.8)) { this.confirm = { t: nowMs, onsetMs, notes, pre }; return null; }
      return { notes, onsetMs };
    }
    return null;
  }
}
