// Play-along band for ANY score: works out the harmony bar by bar from the notes in the score,
// then writes a strings pad (smoothly voiced chords), a bass line (chord roots) and an optional
// melody guide (the top line doubled by an instrument). Pure functions, tested in tests/band.test.ts.

import type { Score, ScoreNote } from './parse';

export interface ChordSeg { q: number; len: number; root: number; quality: 'maj' | 'min' | 'dim' | null; measure: number; srcQ: number }

const TEMPLATES: { quality: 'maj' | 'min' | 'dim'; iv: number[] }[] = [
  { quality: 'maj', iv: [0, 4, 7] },
  { quality: 'min', iv: [0, 3, 7] },
  { quality: 'dim', iv: [0, 3, 6] },
];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const chordName = (c: ChordSeg) => (c.quality ? NAMES[c.root] + (c.quality === 'min' ? 'm' : c.quality === 'dim' ? 'dim' : '') : '–');

/** Harmony per half bar (4/4 and longer) or per bar (shorter meters). */
export function analyzeChords(score: Score, notes: ScoreNote[] = score.notes): ChordSeg[] {
  const segs: ChordSeg[] = [];
  score.measures.forEach((M, mi) => {
    const split = M.lengthQ >= 4 - 1e-9 && M.beatType === 4 ? 2 : M.beatType === 8 && M.beats >= 6 ? M.beats / 3 : 1;
    const len = M.lengthQ / split;
    for (let k = 0; k < split; k++) {
      const q0 = M.startQ + k * len, q1 = q0 + len;
      const w = new Array(12).fill(0);
      let lowest = Infinity, lowestPc = -1;
      for (const n of notes) {
        const ov = Math.min(q1, n.startQ + n.durQ) - Math.max(q0, n.startQ);
        if (ov <= 1e-9 || n.grace) continue;
        const onBeat = Math.abs(n.startQ - q0) < 1e-6 ? 1.3 : 1;
        w[n.midi % 12] += ov * onBeat;
        if (n.midi < lowest && n.startQ <= q0 + len / 2) { lowest = n.midi; lowestPc = n.midi % 12; }
      }
      const total = w.reduce((a, b) => a + b, 0);
      let best: { root: number; quality: 'maj' | 'min' | 'dim'; s: number } | null = null;
      if (total > 0) for (let r = 0; r < 12; r++) for (const t of TEMPLATES) {
        const tones = t.iv.map((i) => (r + i) % 12);
        const inW = tones.reduce((a, pc) => a + w[pc], 0);
        // root and third matter most; a chord whose root is in the bass is preferred
        const s = inW - (total - inW) * 0.6 + (w[r] > 0 ? 0.2 * total : -0.3 * total) + (lowestPc === r ? 0.25 * total : 0) + (t.quality === 'dim' ? -0.15 * total : 0);
        if (!best || s > best.s) best = { root: r, quality: t.quality, s };
      }
      const prev = segs[segs.length - 1];
      const chord = best && best.s > 0 ? best : prev && total > 0 ? { root: prev.root, quality: prev.quality ?? 'maj', s: 0 } : null;
      segs.push({ q: q0, len, root: chord?.root ?? 0, quality: chord ? chord.quality : null, measure: mi, srcQ: M.srcStartQ + k * len });
    }
  });
  return segs;
}

export interface BandParts { pad: boolean; bass: boolean; melody: boolean }
export const BAND_KEYS = { pad: 'band|pad', bass: 'band|bass', melody: 'band|melody' } as const;

/** Generate play-along notes from the harmony and the score's top line. */
export function makeBand(score: Score, parts: BandParts): ScoreNote[] {
  const segs = analyzeChords(score);
  const out: ScoreNote[] = [];
  let prevVoicing: number[] | null = null;
  for (const c of segs) {
    if (!c.quality) { prevVoicing = null; continue; }
    const tones = (c.quality === 'maj' ? [0, 4, 7] : c.quality === 'min' ? [0, 3, 7] : [0, 3, 6]).map((i) => (c.root + i) % 12);
    if (parts.bass) {
      let b = 36 + c.root;
      if (b < 40) b += 12; // E2..Eb3: low but clear
      out.push({ midi: b, startQ: c.q, durQ: c.len * 0.95, srcStartQ: c.srcQ, track: BAND_KEYS.bass, measure: c.measure });
    }
    if (parts.pad) {
      // all inversions between G3 and C5; choose the one closest to the previous chord (smooth voice leading)
      const cands: number[][] = [];
      for (let base = 52; base <= 64; base++) {
        if (!tones.includes(base % 12)) continue;
        const v = [base];
        let m = base;
        for (let k = 0; k < 2; k++) { m++; while (!tones.includes(m % 12) || v.some((x) => x % 12 === m % 12)) m++; v.push(m); }
        if (v[2] <= 72) cands.push(v);
      }
      const center = 60;
      const pick = cands.reduce((a, v) => {
        const cost = (x: number[]) => (prevVoicing ? x.reduce((s, n, i) => s + Math.abs(n - prevVoicing![i]), 0) : Math.abs(x[1] - center) * 2);
        return cost(v) < cost(a) ? v : a;
      }, cands[0]);
      prevVoicing = pick;
      for (const m of pick) out.push({ midi: m, startQ: c.q, durQ: c.len, srcStartQ: c.srcQ, track: BAND_KEYS.pad, measure: c.measure });
    }
  }
  if (parts.melody) {
    // the top line of the highest-sounding track (the tune), doubled an octave up if it sits low
    const byTrack = new Map<string, ScoreNote[]>();
    for (const n of score.notes) (byTrack.get(n.track) ?? byTrack.set(n.track, []).get(n.track)!).push(n);
    let top: ScoreNote[] = [];
    let topAvg = -1;
    // the tune: a keyboard part's right hand if there is one, otherwise the highest line
    const piano = score.parts.find((p) => p.staves === 2);
    byTrack.forEach((ns, key) => {
      if (piano && !(key.startsWith(piano.id + '|1|'))) return;
      const a = ns.reduce((s, n) => s + n.midi, 0) / ns.length;
      if (a > topAvg) { topAvg = a; top = ns; }
    });
    const byOnset = new Map<string, ScoreNote>();
    for (const n of top) { const k = n.startQ.toFixed(4); const cur = byOnset.get(k); if (!cur || n.midi > cur.midi) byOnset.set(k, n); }
    const shift = topAvg < 62 ? 12 : 0;
    for (const n of byOnset.values()) out.push({ ...n, midi: n.midi + shift, track: BAND_KEYS.melody, lyric: undefined });
  }
  return out.sort((a, b) => a.startQ - b.startQ || a.midi - b.midi);
}
