// Sing to score, step 2: automatic four-part (SATB) harmony for a melody.
// 1. Choose chords: every half bar (4/4) or bar (3/4, 2/4), the chord that holds the melody best, with
//    a preference for strong progressions (ii-V-I, IV-V-I ...) and a cadence at the end (Viterbi search).
// 2. Voice them: the melody is the soprano; alto, tenor and bass take chord tones in their ranges with
//    good spacing, a complete chord, no doubled leading note, no parallel fifths or octaves, and the
//    least movement from the chord before.
import type { KeyInfo, Melody, MelodyNote } from './transcribe';
import { pcName } from './transcribe';

export interface Chord { root: number; quality: 'maj' | 'min' | 'dim'; seventh?: boolean; degree: string }
export interface ChordSlot { beat: number; beats: number; chord: Chord | null }
export interface Voice { name: 'Soprano' | 'Alto' | 'Tenor' | 'Bass'; notes: MelodyNote[] }
export interface Harmony { slots: ChordSlot[]; voices: Voice[]; melodyShift: number }

export const RANGE = { S: [60, 79], A: [55, 74], T: [48, 67], B: [40, 60] } as const;

function diatonic(key: KeyInfo): Chord[] {
  const t = key.tonic;
  const c = (iv: number, quality: Chord['quality'], degree: string, seventh = false): Chord => ({ root: (t + iv) % 12, quality, degree, seventh });
  return key.mode === 'major'
    ? [c(0, 'maj', 'I'), c(2, 'min', 'ii'), c(4, 'min', 'iii'), c(5, 'maj', 'IV'), c(7, 'maj', 'V'), c(7, 'maj', 'V7', true), c(9, 'min', 'vi')]
    : [c(0, 'min', 'i'), c(3, 'maj', 'III'), c(5, 'min', 'iv'), c(7, 'maj', 'V'), c(7, 'maj', 'V7', true), c(8, 'maj', 'VI'), c(10, 'maj', 'VII')];
}
export const chordPcs = (ch: Chord) => {
  const third = ch.quality === 'maj' ? 4 : 3, fifth = ch.quality === 'dim' ? 6 : 7;
  return [ch.root, (ch.root + third) % 12, (ch.root + fifth) % 12, ...(ch.seventh ? [(ch.root + 10) % 12] : [])];
};
export const chordName = (ch: Chord, key: KeyInfo) => pcName(ch.root, key.fifths) + (ch.quality === 'min' ? 'm' : ch.quality === 'dim' ? '°' : '') + (ch.seventh ? '7' : '');

// how natural it is to move from one chord to the next (lower = better)
const GOOD: Record<string, string[]> = {
  I: ['IV', 'V', 'vi', 'ii', 'V7'], ii: ['V', 'V7'], iii: ['vi', 'IV'], IV: ['V', 'I', 'ii', 'V7'], V: ['I', 'vi'], V7: ['I', 'vi'], vi: ['IV', 'ii', 'V'],
  i: ['iv', 'V', 'VI', 'III', 'V7'], III: ['VI', 'iv'], iv: ['V', 'i', 'V7'], VI: ['iv', 'V', 'III'], VII: ['III', 'i'],
};
function moveCost(a: Chord | null, b: Chord): number {
  if (!a) return b.degree === 'I' || b.degree === 'i' ? 0 : 1;
  if (a.degree === b.degree) return 0.6;
  if (GOOD[a.degree]?.includes(b.degree)) return 0;
  if ((a.degree === 'V' || a.degree === 'V7') && (b.degree === 'IV' || b.degree === 'iv' || b.degree === 'ii')) return 2.2;
  return 1;
}

/** Chords for the melody, one per slot. */
export function chooseChords(m: Melody): ChordSlot[] {
  const barBeats = m.timeSig[0] * (4 / m.timeSig[1]);
  const slotLen = barBeats === 4 ? 2 : barBeats;
  const total = m.bars * barBeats;
  const cands = diatonic(m.key);
  const slots: { beat: number; beats: number; fit: number[]; empty: boolean }[] = [];
  for (let b = 0; b < total - 1e-9; b += slotLen) {
    const inside = m.notes.filter((n) => n.midi !== null && n.beat < b + slotLen - 1e-9 && n.beat + n.beats > b + 1e-9);
    const fit = cands.map((ch) => {
      const pcs = chordPcs(ch);
      let s = 0;
      for (const n of inside) {
        const dur = Math.min(n.beat + n.beats, b + slotLen) - Math.max(n.beat, b);
        const strong = Math.abs(n.beat - b) < 1e-9 || n.beat < b ? 1.6 : 1;
        s += (pcs.includes(n.midi! % 12) ? -1 : 1.2) * dur * strong;
      }
      return s + (ch.seventh ? 0.4 : 0);
    });
    slots.push({ beat: b, beats: slotLen, fit, empty: inside.length === 0 });
  }
  // Viterbi over the chord choices
  const n = slots.length, K = cands.length;
  const cost: number[][] = [], from: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost.push(new Array(K).fill(Infinity)); from.push(new Array(K).fill(-1));
    for (let k = 0; k < K; k++) {
      let local = slots[i].empty ? 0 : slots[i].fit[k];
      if (i === n - 1 && cands[k].degree !== 'I' && cands[k].degree !== 'i') local += 4; // end at home
      if (i === n - 2 && n > 2 && !cands[k].degree.startsWith('V')) local += 0.8; // cadence V-I
      if (i === 0) { cost[0][k] = local + moveCost(null, cands[k]); continue; }
      for (let j = 0; j < K; j++) {
        const c = cost[i - 1][j] + local + (slots[i].empty ? (j === k ? 0 : 2) : moveCost(cands[j], cands[k]));
        if (c < cost[i][k]) { cost[i][k] = c; from[i][k] = j; }
      }
    }
  }
  let k = cost[n - 1].indexOf(Math.min(...cost[n - 1]));
  const pick: number[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) { pick[i] = k; k = from[i][k]; }
  return slots.map((s, i) => ({ beat: s.beat, beats: s.beats, chord: cands[pick[i]] }));
}

const notesIn = (pcs: number[], lo: number, hi: number) => { const r: number[] = []; for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) r.push(m); return r; };
const parallel = (a1: number, a2: number, b1: number, b2: number) => {
  if (a1 === a2 || b1 === b2) return false; // a voice holds its note: no parallel
  const i1 = Math.abs(a1 - b1) % 12, i2 = Math.abs(a2 - b2) % 12;
  return (i1 === 7 && i2 === 7) || (i1 === 0 && i2 === 0);
};

/** Best alto, tenor and bass under a soprano note, given the previous chord's voicing. */
export function voiceChord(ch: Chord, sop: number, key: KeyInfo, prev: [number, number, number, number] | null): [number, number, number] {
  const pcs = chordPcs(ch);
  const third = pcs[1], fifth = pcs[2];
  const leading = (key.tonic + 11) % 12;
  let best: [number, number, number] = [sop - 4, sop - 9, sop - 16], bc = Infinity;
  for (const b of notesIn(pcs, RANGE.B[0], RANGE.B[1])) {
    const bpc = b % 12;
    if (bpc !== ch.root && bpc !== third) continue; // root position or first inversion
    for (const t of notesIn(pcs, Math.max(RANGE.T[0], b), RANGE.T[1])) {
      if (t - b > 19) continue;
      for (const a of notesIn(pcs, Math.max(RANGE.A[0], t), Math.min(RANGE.A[1], sop))) {
        if (sop - a > 12 || a - t > 12) continue;
        const set = [sop % 12, a % 12, t % 12, bpc];
        let c = 0;
        if (!set.includes(ch.root) || !set.includes(third)) continue;
        if (!set.includes(fifth)) c += 0.8;
        if (ch.seventh && !set.includes(pcs[3])) c += 1.5;
        if (bpc !== ch.root) c += 1.4;
        const count = (pc: number) => set.filter((x) => x === pc).length;
        if (count(leading) > 1) c += 4;
        if (count(third) > 1 && ch.quality === 'maj') c += 1.2;
        if (prev) {
          const [ps, pa, pt, pb] = prev;
          c += Math.abs(a - pa) * 0.9 + Math.abs(t - pt) * 0.9 + Math.abs(b - pb) * 0.35;
          const now = [sop, a, t, b], was = [ps, pa, pt, pb];
          for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (parallel(was[i], now[i], was[j], now[j])) c += 8;
        } else {
          c += Math.abs(a - 64) * 0.1 + Math.abs(t - 57) * 0.1 + Math.abs(b - 48) * 0.1;
        }
        if (c < bc) { bc = c; best = [a, t, b]; }
      }
    }
  }
  return best;
}

/**
 * Full four-part arrangement. The melody is moved by octaves into the soprano range if needed (a man
 * singing gets his tune written where sopranos read it); melodyShift says by how much.
 */
export function harmonize(m: Melody): Harmony {
  const pitched = m.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const med = pitched.length ? [...pitched].sort((a, b) => a - b)[pitched.length >> 1] : 67;
  let shift = 0;
  while (med + shift < 64) shift += 12;
  while (med + shift > 74) shift -= 12;
  const sopNotes = m.notes.map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + shift }));
  const slots = chooseChords({ ...m, notes: sopNotes });
  const A: MelodyNote[] = [], T: MelodyNote[] = [], B: MelodyNote[] = [];
  let prev: [number, number, number, number] | null = null;
  for (const s of slots) {
    const atStart = sopNotes.find((n) => n.midi !== null && n.beat <= s.beat + 1e-9 && n.beat + n.beats > s.beat + 1e-9)
      ?? sopNotes.find((n) => n.midi !== null && n.beat >= s.beat && n.beat < s.beat + s.beats);
    if (!s.chord || !atStart) { for (const v of [A, T, B]) v.push({ midi: null, beat: s.beat, beats: s.beats }); continue; }
    // the soprano note that sounds with the chord should belong to it; otherwise voice against the
    // nearest chord tone (the melody note is then a passing note)
    const pcs = chordPcs(s.chord);
    let sop = atStart.midi!;
    if (!pcs.includes(sop % 12)) sop = notesIn(pcs, sop - 2, sop + 2).sort((x, y) => Math.abs(x - sop) - Math.abs(y - sop))[0] ?? sop;
    const [a, t, b] = voiceChord(s.chord, sop, m.key, prev);
    A.push({ midi: a, beat: s.beat, beats: s.beats });
    T.push({ midi: t, beat: s.beat, beats: s.beats });
    B.push({ midi: b, beat: s.beat, beats: s.beats });
    prev = [sop, a, t, b];
  }
  return { slots, melodyShift: shift, voices: [{ name: 'Soprano', notes: sopNotes }, { name: 'Alto', notes: A }, { name: 'Tenor', notes: T }, { name: 'Bass', notes: B }] };
}
