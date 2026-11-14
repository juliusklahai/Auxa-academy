// Sing to score, version 2: the rhythm.
//
// A sung note's written value is its HOLD: the time from its syllable to the next syllable, measured in
// beats. Singers breathe, lean and slow down, so instead of rounding each note to the nearest grid point
// on its own (which turns a held "graaace" plus a breath into the wrong value, and lets two notes fall on
// one slot and vanish), the whole tune is read at once: a Viterbi search over note values and a slowly
// drifting tempo, preferring the values hymns and songs actually use, notes on beats, and long notes on
// strong beats. Every sung note keeps its place. 3/4 and 4/4 are both tried; the better one wins.

import type { MelodyNote } from './transcribe';

export interface TimedNote { midi: number; /** onset (vowel), ms */ t: number; /** where the voice stops, ms */ e: number }
export interface RhythmResult { notes: MelodyNote[]; bpm: number; timeSig: [number, number]; cost: number }

/** note values (beats) and how common they are in sung melodies */
const VALUES: [number, number][] = [[0.25, 0.07], [0.5, 0.22], [0.75, 0.07], [1, 0.3], [1.5, 0.08], [2, 0.14], [3, 0.08], [4, 0.04]];
const GRID = 0.25;

/** cost of a note starting at this position in the bar (beats from the bar line) */
function placeCost(pos: number, len: number, bar: number): number {
  const frac = pos - Math.floor(pos + 1e-9);
  let c = frac < 1e-6 ? 0 : Math.abs(frac - 0.5) < 1e-6 ? 0.45 : 1.3;
  // long notes like strong beats: the bar line (and beat 3 in 4/4)
  if (len >= 1.5) {
    const strong = pos < 1e-6 || (bar === 4 && Math.abs(pos - 2) < 1e-6);
    if (!strong) c += len >= 2 ? 0.9 : 0.4;
  }
  // a note that runs across the bar line (tied) is unusual in hymn-like melodies
  if (pos + len > bar + 1e-6 && pos > 1e-6) c += 1.1;
  return c;
}

export interface RhythmOpts {
  /** known tempo (with a click) */
  bpm?: number;
  /** time (ms) of a known downbeat (with a click) */
  origin?: number;
  /** a fixed meter; otherwise 3/4 and 4/4 are tried */
  timeSig?: [number, number];
}

/** The best rhythm for one meter. */
export function solve(ns: TimedNote[], bar: number, opts: RhythmOpts): { durs: number[]; pos0: number; Ts: number[]; cost: number; music: number } {
  const n = ns.length;
  const slots = Math.round(bar / GRID);
  // tempo states: beat period in ms, 3% apart
  const Ts: number[] = [];
  if (opts.bpm) for (let k = -2; k <= 2; k++) Ts.push((60000 / opts.bpm) * 1.015 ** k);
  else for (let T = 380; T <= 1400; T *= 1.03) Ts.push(T);
  const nT = Ts.length, S = slots * nT;
  const INF = 1e18;
  let cost = new Float64Array(S).fill(INF);
  // first note: any place in the bar (a pickup costs a little), any tempo (around 90 bpm is likeliest)
  const firstPos = opts.origin !== undefined && opts.bpm ? Math.round((((ns[0].t - opts.origin) / (60000 / opts.bpm)) % bar + bar) % bar / GRID) % slots : -1;
  for (let p = 0; p < slots; p++) for (let k = 0; k < nT; k++) {
    if (firstPos >= 0 && p !== firstPos) continue;
    const tempoPrior = ((Math.log(Ts[k] / 650)) / 0.4) ** 2 * 0.5;
    cost[p * nT + k] = (p === 0 ? 0 : 0.6) + ((p * GRID) % 1 ? 0.8 : 0) + tempoPrior;
  }
  const back: Int32Array[] = []; // for each note: previous state and chosen value index
  for (let i = 0; i + 1 < n; i++) {
    const ioi = ns[i + 1].t - ns[i].t;
    const next = new Float64Array(S).fill(INF);
    const bp = new Int32Array(S * 2).fill(-1);
    for (let p = 0; p < slots; p++) for (let k = 0; k < nT; k++) {
      const c0 = cost[p * nT + k];
      if (c0 >= INF) continue;
      for (let vi = 0; vi < VALUES.length; vi++) {
        const [d, prob] = VALUES[vi];
        const pos = p * GRID;
        const pc = placeCost(pos, d, bar);
        const vc = -Math.log(prob);
        const p2 = Math.round(((pos + d) % bar) / GRID) % slots;
        for (let dk = -1; dk <= 1; dk++) {
          const k2 = k + dk;
          if (k2 < 0 || k2 >= nT) continue;
          const T = Ts[k2];
          const pred = d * T, sig = 0.11 * pred + 30;
          const tc = ((ioi - pred) / sig) ** 2;
          const dc = dk === 0 ? 0 : 0.7; // tempo drifts slowly
          // songs and hymns mostly move at 60 to 120 beats a minute; at double speed every note would sit
          // on a beat, so without this the fastest reading always looks tidiest
          const tp = opts.bpm ? 0 : 0.3 * (Math.log(T / 667) / 0.35) ** 2;
          const c = c0 + tc + vc + pc + dc + tp;
          const s2 = p2 * nT + k2;
          if (c < next[s2]) { next[s2] = c; bp[s2 * 2] = p * nT + k; bp[s2 * 2 + 1] = vi; }
        }
      }
    }
    back.push(bp);
    cost = next;
  }
  // last note: its value from how long it was held
  let best = INF, bs = -1, bv = 0;
  for (let s = 0; s < S; s++) {
    if (cost[s] >= INF) continue;
    const T = Ts[s % nT], held = (ns[n - 1].e - ns[n - 1].t) / T, p = Math.floor(s / nT) * GRID;
    for (let vi = 0; vi < VALUES.length; vi++) {
      const d = VALUES[vi][0];
      const c = cost[s] + ((held - d) / (0.25 * d + 0.25)) ** 2 * 0.5 - Math.log(VALUES[vi][1]) + placeCost(p, d, bar);
      if (c < best) { best = c; bs = s; bv = vi; }
    }
  }
  const durs = new Array<number>(n), tIdx = new Array<number>(n);
  durs[n - 1] = VALUES[bv][0];
  let s = bs;
  tIdx[n - 1] = s % nT;
  for (let i = n - 2; i >= 0; i--) {
    const bp = back[i];
    durs[i] = VALUES[bp[s * 2 + 1]][0];
    s = bp[s * 2];
    tIdx[i] = s % nT;
  }
  // how musical the result is on its own (note values and where they fall in the bar), used to choose the meter
  let music = 0, pos = Math.floor(s / nT) * GRID;
  for (const d of durs) { music += -Math.log(VALUES.find((v) => v[0] === d)![1]) + placeCost(pos % bar, d, bar); pos += d; }
  return { durs, pos0: Math.floor(s / nT) * GRID, Ts: tIdx.map((k) => Ts[k]), cost: best, music };
}

/**
 * Writes timed notes as a rhythm: note values (beats), rests where the voice really stopped, the tempo
 * and the meter. Beat 0 is the first bar line; a pickup is written after a rest at the start of bar 1.
 */
export function readRhythm(ns: TimedNote[], opts: RhythmOpts = {}): RhythmResult | null {
  if (!ns.length) return null;
  const meters: [number, number][] = opts.timeSig ? [opts.timeSig] : [[4, 4], [3, 4]];
  let best: ({ timeSig: [number, number] } & ReturnType<typeof solve>) | null = null;
  for (const ts of meters) {
    const bar = ts[0] * (4 / ts[1]);
    const r = solve(ns, bar, opts);
    // the meter whose bars make the most musical sense wins (the musical part counts double here)
    const c = r.cost + r.music;
    if (!best || c < best.cost + best.music) best = { ...r, timeSig: ts };
  }
  const b = best!;
  const bar = b.timeSig[0] * (4 / b.timeSig[1]);
  const notes: MelodyNote[] = [];
  let at = b.pos0;
  if (at > 0) notes.push({ midi: null, beat: 0, beats: at });
  ns.forEach((nt, i) => {
    const d = b.durs[i];
    // a rest only where the voice really stopped: at least half the value and at least a beat (or the last note)
    const held = (nt.e - nt.t) / b.Ts[i];
    let sound = d;
    const gap = d - held;
    if (i < ns.length - 1 && gap >= Math.max(1, d * 0.45)) {
      sound = Math.max(GRID * 2, Math.round(held / 0.5) * 0.5);
      if (d - sound < 0.5) sound = d;
    }
    notes.push({ midi: nt.midi, beat: at, beats: sound });
    if (sound < d) notes.push({ midi: null, beat: at + sound, beats: d - sound });
    at += d;
  });
  const total = Math.max(bar, Math.ceil(at / bar - 1e-9) * bar);
  if (total > at + 1e-9) notes.push({ midi: null, beat: at, beats: total - at });
  const Ts = [...b.Ts].sort((p, q) => p - q);
  return { notes, bpm: Math.round(60000 / Ts[Ts.length >> 1]), timeSig: b.timeSig, cost: b.cost };
}
