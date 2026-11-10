// Sing to score, step 2: arrange a sung melody for four voices (SATB).
//
// How it works, the way an arranger would:
// 1. Phrases: split the tune where it breathes (rests, long notes), and plan a cadence at each end:
//    V-I (full stop) or a half cadence on V (comma), and always V-I at the very end.
// 2. Harmonic rhythm: a chord for every melody note that starts on a beat (note against note), a change
//    under long held notes so the harmony keeps moving, and short off-beat notes treated as passing notes.
// 3. Chords: a search (Viterbi) over the key's chords and their inversions, scored by how well each chord
//    holds the melody, by functional grammar (tonic -> subdominant -> dominant -> tonic), by a smooth bass
//    line, and by the planned cadences. Secondary dominant (V of V) and the cadential 6/4 are available.
// 4. Voicing: a beam search over every legal alto/tenor/bass under the melody: ranges, spacing, complete
//    chords, doubling rules, no parallel 5ths/8ves, leading tone up, 7th down, smallest motion.
// 5. Style: hymn (note against note), moving parts (passing tones, suspensions, a walking bass), oohs
//    (sustained pad), call and response (lead, choir echoes, full-choir answers) or melody in the tenor
//    with a soprano descant.
import type { KeyInfo, Melody, MelodyNote } from './transcribe';
import { pcName } from './transcribe';

export interface Chord {
  root: number; quality: 'maj' | 'min' | 'dim'; seventh?: boolean; degree: string;
  /** 0 root position, 1 first inversion (3rd in the bass), 2 second inversion (5th in the bass) */
  inv?: 0 | 1 | 2;
  func?: 'T' | 'S' | 'D' | 'X';
}
export interface ChordSlot { beat: number; beats: number; chord: Chord | null }
export interface Voice { name: 'Soprano' | 'Alto' | 'Tenor' | 'Bass'; notes: MelodyNote[] }
export type ArrStyle = 'hymn' | 'moving' | 'pad' | 'call' | 'tenor';
export interface Harmony { slots: ChordSlot[]; voices: Voice[]; melodyShift: number; style: ArrStyle; techniques: string[] }

export const STYLES: { id: ArrStyle; name: string; about: string }[] = [
  { id: 'hymn', name: 'Hymn: note against note', about: 'Every voice moves with the melody, a fresh chord on each main note.' },
  { id: 'moving', name: 'Moving parts', about: 'Hymn harmony with passing notes, suspensions and a walking bass so every part sings.' },
  { id: 'pad', name: 'Oohs under the melody', about: 'Alto, tenor and bass hold soft chords ("ooh") while the melody leads.' },
  { id: 'call', name: 'Call and response', about: 'The lead sings, the choir echoes the end of each phrase, then answers in full harmony.' },
  { id: 'tenor', name: 'Melody in the tenor', about: 'Tenors carry the tune, sopranos float a descant above, alto and bass fill in.' },
];

export const RANGE = { S: [60, 79], A: [55, 74], T: [48, 67], B: [40, 60] } as const;

// ---------------------------------------------------------------------------------------------- chords

function vocabulary(key: KeyInfo): Chord[] {
  const t = key.tonic;
  const c = (iv: number, quality: Chord['quality'], degree: string, func: Chord['func'], inv: 0 | 1 | 2 = 0, seventh = false): Chord => ({ root: (t + iv) % 12, quality, degree, func, inv, seventh });
  return key.mode === 'major'
    ? [
      c(0, 'maj', 'I', 'T'), c(0, 'maj', 'I', 'T', 1), c(9, 'min', 'vi', 'T'), c(4, 'min', 'iii', 'T'),
      c(5, 'maj', 'IV', 'S'), c(5, 'maj', 'IV', 'S', 1), c(2, 'min', 'ii', 'S'), c(2, 'min', 'ii', 'S', 1),
      c(7, 'maj', 'V', 'D'), c(7, 'maj', 'V', 'D', 1), c(7, 'maj', 'V7', 'D', 0, true), c(11, 'dim', 'vii°', 'D', 1),
      c(2, 'maj', 'V/V', 'X'), c(0, 'maj', 'I64', 'D', 2),
    ]
    : [
      c(0, 'min', 'i', 'T'), c(0, 'min', 'i', 'T', 1), c(8, 'maj', 'VI', 'T'), c(3, 'maj', 'III', 'T'),
      c(5, 'min', 'iv', 'S'), c(5, 'min', 'iv', 'S', 1), c(2, 'dim', 'ii°', 'S', 1),
      c(7, 'maj', 'V', 'D'), c(7, 'maj', 'V', 'D', 1), c(7, 'maj', 'V7', 'D', 0, true), c(10, 'maj', 'VII', 'X'),
      c(0, 'min', 'i64', 'D', 2),
    ];
}

export const chordPcs = (ch: Chord) => {
  const third = ch.quality === 'maj' ? 4 : 3, fifth = ch.quality === 'dim' ? 6 : 7;
  return [ch.root, (ch.root + third) % 12, (ch.root + fifth) % 12, ...(ch.seventh ? [(ch.root + 10) % 12] : [])];
};
const bassPc = (ch: Chord) => chordPcs(ch)[ch.inv ?? 0];
export const chordName = (ch: Chord, key: KeyInfo) => {
  const base = pcName(ch.root, key.fifths) + (ch.quality === 'min' ? 'm' : ch.quality === 'dim' ? '°' : '') + (ch.seventh ? '7' : '');
  return ch.inv ? `${base}/${pcName(bassPc(ch), key.fifths)}` : base;
};
/** Roman numeral with inversion figure, for the chord strip. */
export const chordLabel = (ch: Chord) => (ch.degree === 'I64' || ch.degree === 'i64' ? ch.degree.replace('64', '⁶₄') : ch.degree + (ch.inv === 1 ? '⁶' : ''));

// functional grammar: how natural a move is (lower is better)
function moveCost(a: Chord | null, b: Chord): number {
  if (!a) return b.func === 'T' && !b.inv ? 0 : 1.2;
  if (a.degree === b.degree) return a.inv === b.inv ? 0.7 : 0.25;
  if (a.degree === 'I64' || a.degree === 'i64') return b.degree.startsWith('V') && !b.inv ? 0 : 6; // a cadential 6/4 must go to V
  if (a.degree === 'V/V') return b.degree.startsWith('V') || b.degree === 'I64' ? 0 : 4;
  if (b.degree === 'I64' || b.degree === 'i64') return a.func === 'S' || a.degree === 'V/V' ? 0.2 : 4;
  if (a.degree === 'VII') return b.degree === 'III' || b.func === 'T' ? 0.4 : 2;
  const f: Record<string, Record<string, number>> = {
    T: { T: 0.6, S: 0, D: 0.2, X: 0.6 },
    S: { T: 0.8, S: 0.4, D: 0, X: 0.3 },
    D: { T: 0, S: 2.4, D: 0.4, X: 2 },
    X: { T: 1, S: 1, D: 0, X: 1.5 },
  };
  let c = f[a.func ?? 'T'][b.func ?? 'T'];
  if (a.func === 'D' && (b.degree === 'vi' || b.degree === 'VI')) c = 0.3; // deceptive is fine
  if (a.degree === 'iii' && b.degree === 'IV') c = 0.1;
  return c;
}

// ---------------------------------------------------------------------------------------------- plan

interface Slot { beat: number; beats: number; sop: number | null; inside: MelodyNote[]; phraseEnd: 'none' | 'half' | 'full' | 'final'; prePhraseEnd: number }

/** Phrases end at rests of a beat or more, or at a long note (2+ beats) followed by a new start. */
export function phrases(notes: MelodyNote[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  notes.forEach((n, i) => {
    if (n.midi === null) { if (start >= 0 && n.beats >= 1) { out.push([start, i - 1]); start = -1; } return; }
    if (start < 0) start = i;
    const next = notes[i + 1];
    if (n.beats >= 2 && next && next.midi !== null && i - start >= 3) { out.push([start, i]); start = -1; }
  });
  if (start >= 0) { let e = notes.length - 1; while (e > start && notes[e].midi === null) e--; out.push([start, e]); }
  return out;
}

function planSlots(sop: MelodyNote[], m: Melody, style: ArrStyle): Slot[] {
  const barBeats = m.timeSig[0] * (4 / m.timeSig[1]);
  const total = Math.max(barBeats, ...sop.map((n) => n.beat + n.beats));
  const cuts = new Set<number>();
  if (style === 'pad') {
    const step = barBeats === 4 ? 2 : barBeats;
    for (let b = 0; b < total - 1e-9; b += step) cuts.add(b);
  } else {
    for (const n of sop) {
      const onBeat = Math.abs(n.beat - Math.round(n.beat)) < 1e-6;
      if (n.midi === null) { cuts.add(n.beat); continue; }
      if (onBeat || n.beats >= 1) cuts.add(n.beat);
      // keep the harmony moving under a long note: change at the half bar or next bar
      if (n.beats >= 3) for (let b = Math.ceil((n.beat + 1.5) / 2) * 2; b < n.beat + n.beats - 0.9; b += 2) cuts.add(b);
    }
  }
  const starts = [...cuts].filter((b) => b < total - 1e-9).sort((a, b) => a - b);
  const slots: Slot[] = starts.map((b, i) => {
    const e = starts[i + 1] ?? total;
    const inside = sop.filter((n) => n.midi !== null && n.beat < e - 1e-9 && n.beat + n.beats > b + 1e-9);
    const at = inside.find((n) => n.beat <= b + 1e-9) ?? inside[0];
    return { beat: b, beats: e - b, sop: at?.midi ?? null, inside, phraseEnd: 'none', prePhraseEnd: 99 };
  });
  // cadence plan
  const ph = phrases(sop);
  const tonicPcs = [m.key.tonic, (m.key.tonic + (m.key.mode === 'major' ? 4 : 3)) % 12];
  ph.forEach(([, e], pi) => {
    const endNote = sop[e];
    const si = slots.findIndex((s) => s.beat <= endNote.beat + 1e-9 && s.beat + s.beats > endNote.beat + 1e-9);
    if (si < 0) return;
    const final = pi === ph.length - 1;
    slots[si].phraseEnd = final ? 'final' : tonicPcs.includes(endNote.midi! % 12) ? 'full' : 'half';
    for (let k = 1; k <= 3 && si - k >= 0; k++) slots[si - k].prePhraseEnd = Math.min(slots[si - k].prePhraseEnd, k);
  });
  return slots;
}

function chooseFor(slots: Slot[], key: KeyInfo, style: ArrStyle): Chord[] {
  const V = vocabulary(key);
  const K = V.length, n = slots.length;
  const local = slots.map((s) => V.map((ch) => {
    if (s.sop === null) return 0;
    const pcs = chordPcs(ch);
    let c = 0;
    if (s === slots.find((x) => x.sop !== null)) c += (ch.degree === 'I' || ch.degree === 'i') && !ch.inv ? -0.6 : 0.8; // start at home
    // the note sounding at the chord change must belong (unless it is very short and stepwise)
    if (!pcs.includes(s.sop % 12)) c += 5;
    for (const nt of s.inside) {
      if (nt.midi === s.sop && nt.beat <= s.beat + 1e-9) continue;
      const dur = Math.min(nt.beat + nt.beats, s.beat + s.beats) - Math.max(nt.beat, s.beat);
      c += pcs.includes(nt.midi! % 12) ? -0.3 * dur : 0.5 * dur;
    }
    if (ch.inv === 1) c += 0.45;
    if (ch.seventh) c += 0.35;
    if (ch.degree === 'iii' || ch.degree === 'III') c += 0.6;
    if (ch.degree === 'V/V') c += 0.9;
    if (ch.degree === 'I64' || ch.degree === 'i64') c += s.prePhraseEnd <= 2 ? 0 : 6;
    if (ch.degree === 'vii°' || ch.degree === 'ii°') c += 0.5;
    // the melody doubling the bass of an inversion sounds weak
    if (ch.inv && bassPc(ch) === s.sop % 12) c += 1.5;
    // cadences
    const isI = ch.func === 'T' && (ch.degree === 'I' || ch.degree === 'i');
    if (s.phraseEnd === 'final') c += isI && !ch.inv ? -1 : 8;
    if (s.phraseEnd === 'full') c += isI && !ch.inv ? -0.8 : 1.5;
    if (s.phraseEnd === 'half') c += ch.degree === 'V' && !ch.inv ? -1 : isI && !ch.inv ? 0 : 1.5;
    if (s.prePhraseEnd === 1) c += ch.degree.startsWith('V') && ch.degree !== 'V/V' && !ch.inv ? -0.9 : ch.degree === 'I64' || ch.degree === 'i64' ? -0.4 : 0.6;
    if (s.prePhraseEnd === 2) c += ch.func === 'S' || ch.degree === 'V/V' || ch.degree === 'I64' || ch.degree === 'i64' ? -0.4 : 0;
    return c;
  }));
  const cost: number[][] = [], from: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost.push(new Array(K).fill(Infinity)); from.push(new Array(K).fill(-1));
    for (let k = 0; k < K; k++) {
      if (i === 0) { cost[0][k] = local[0][k] + moveCost(null, V[k]); continue; }
      for (let j = 0; j < K; j++) {
        let mc = slots[i].sop === null ? (j === k ? 0 : 1) : moveCost(V[j], V[k]);
        // a smooth bass line: steps are good, leaps of a 4th/5th are fine at root position
        const bj = bassPc(V[j]), bk = bassPc(V[k]), d = Math.min((bk - bj + 12) % 12, (bj - bk + 12) % 12);
        if (d === 1 || d === 2) mc -= 0.15;
        if (style === 'moving' && V[j].degree === V[k].degree && V[j].inv === V[k].inv) mc += 0.5;
        const c = cost[i - 1][j] + local[i][k] + mc;
        if (c < cost[i][k]) { cost[i][k] = c; from[i][k] = j; }
      }
    }
  }
  let k = cost[n - 1].indexOf(Math.min(...cost[n - 1]));
  const pick: Chord[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) { pick[i] = V[k]; k = from[i][k]; }
  return pick;
}

// ---------------------------------------------------------------------------------------------- voicing

const notesIn = (pcs: number[], lo: number, hi: number) => { const r: number[] = []; for (let m = lo; m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) r.push(m); return r; };
const parallel = (a1: number, a2: number, b1: number, b2: number) => {
  if (a1 === a2 || b1 === b2) return false;
  const i1 = Math.abs(a1 - b1) % 12, i2 = Math.abs(a2 - b2) % 12;
  return (i1 === 7 && i2 === 7) || (i1 === 0 && i2 === 0);
};
type Four = [number, number, number, number]; // S A T B

/** Every legal voicing of a chord with one voice fixed (the melody). */
function candidates(ch: Chord, fixed: number, fixedVoice: 0 | 2, key: KeyInfo): { v: Four; c: number }[] {
  const pcs = chordPcs(ch), [root, third, fifth] = pcs;
  const leading = (key.tonic + 11) % 12;
  const out: { v: Four; c: number }[] = [];
  const fixedPc = ((fixed % 12) + 12) % 12;
  const asChord = pcs.includes(fixedPc) ? fixed : notesIn(pcs, fixed - 2, fixed + 2).sort((x, y) => Math.abs(x - fixed) - Math.abs(y - fixed))[0] ?? fixed;
  for (const b of notesIn([bassPc(ch)], RANGE.B[0], RANGE.B[1])) {
    const sRange: [number, number] = fixedVoice === 0 ? [asChord, asChord] : [Math.max(64, asChord + 3), 79];
    for (const s of fixedVoice === 0 ? [asChord] : notesIn(pcs, sRange[0], sRange[1])) {
      const tList = fixedVoice === 2 ? [asChord] : notesIn(pcs, Math.max(RANGE.T[0], b), RANGE.T[1]);
      for (const t of tList) {
        if (t < b || t - b > 19) continue;
        for (const a of notesIn(pcs, Math.max(RANGE.A[0], t), Math.min(RANGE.A[1], s))) {
          if (s - a > 12 || a - t > 12) continue;
          const set = [s, a, t, b].map((x) => ((x % 12) + 12) % 12);
          if (!set.includes(root) || !set.includes(third)) continue;
          let c = 0;
          if (!set.includes(fifth)) c += ch.seventh ? 0.3 : 0.9;
          if (ch.seventh && !set.includes(pcs[3])) c += 2;
          const count = (pc: number) => set.filter((x) => x === pc).length;
          if (count(leading) > 1) c += 6;
          if (ch.seventh && count(pcs[3]) > 1) c += 4;
          if (count(third) > 1 && ch.quality === 'maj' && ch.degree !== 'vi' && ch.degree !== 'VI') c += 1.2;
          if (ch.inv === 2 && count(fifth) < 2) c += 1; // 6/4 chords double the bass
          if (ch.inv === 1 && count(bassPc(ch)) > 1 && ch.quality === 'maj') c += 0.8;
          c += Math.abs(a - 65) * 0.03 + Math.abs(t - 56) * 0.03 + Math.abs(b - 47) * 0.02;
          out.push({ v: [s, a, t, b], c });
        }
      }
    }
  }
  return out;
}

function transitionCost(p: Four, q: Four, pc: Chord, qc: Chord, key: KeyInfo): number {
  let c = Math.abs(q[1] - p[1]) * 0.8 + Math.abs(q[2] - p[2]) * 0.8 + Math.abs(q[3] - p[3]) * 0.25;
  if (Math.abs(q[1] - p[1]) > 5) c += 1.5;
  if (Math.abs(q[2] - p[2]) > 5) c += 1.5;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (parallel(p[i], q[i], p[j], q[j])) c += 12;
  // voice overlap: a voice moving past where its neighbor just was
  if (q[1] < p[2] || q[2] > p[1] || q[2] < p[3] || q[3] > p[2]) c += 1.2;
  // hidden octaves/fifths in the outer voices when the soprano leaps
  const ds = q[0] - p[0], db = q[3] - p[3];
  if (Math.sign(ds) === Math.sign(db) && ds !== 0 && Math.abs(ds) > 2 && [0, 7].includes(Math.abs(q[0] - q[3]) % 12)) c += 2;
  // tendency tones: leading tone rises to the tonic, a chord 7th falls
  const leading = (key.tonic + 11) % 12;
  const isTonic = qc.root === key.tonic;
  for (const i of [1, 2]) {
    if (((p[i] % 12) + 12) % 12 === leading && isTonic && pc.func === 'D' && q[i] !== p[i] + 1) c += 2.5;
    if (pc.seventh && ((p[i] % 12) + 12) % 12 === chordPcs(pc)[3] && !(q[i] === p[i] - 1 || q[i] === p[i] - 2)) c += 3;
  }
  // contrary motion between outer voices is good
  if (ds && db && Math.sign(ds) !== Math.sign(db)) c -= 0.4;
  return c;
}

/** Beam search: the best voicing for the whole progression, not one chord at a time. */
function voiceAll(chords: (Chord | null)[], fixed: (number | null)[], fixedVoice: 0 | 2, key: KeyInfo): (Four | null)[] {
  const W = 40;
  type State = { cost: number; path: (Four | null)[] };
  let beam: State[] = [{ cost: 0, path: [] }];
  chords.forEach((ch, i) => {
    if (!ch || fixed[i] === null) { beam = beam.map((s) => ({ cost: s.cost, path: [...s.path, null] })); return; }
    const cands = candidates(ch, fixed[i]!, fixedVoice, key);
    if (!cands.length) { beam = beam.map((s) => ({ cost: s.cost + 20, path: [...s.path, null] })); return; }
    const next: State[] = [];
    for (const s of beam) {
      let prevI = s.path.length - 1;
      while (prevI >= 0 && !s.path[prevI]) prevI--;
      const prev = prevI >= 0 ? s.path[prevI]! : null, prevCh = prevI >= 0 ? chords[prevI]! : null;
      for (const cd of cands) {
        const t = prev && prevCh ? transitionCost(prev, cd.v, prevCh, ch, key) : 0;
        next.push({ cost: s.cost + cd.c + t, path: [...s.path, cd.v] });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, W);
  });
  return beam[0].path;
}

// ---------------------------------------------------------------------------------------------- styles

const scaleOf = (key: KeyInfo) => (key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11]).map((x) => (key.tonic + x) % 12);
/** The scale note between two notes a third apart (for passing tones). */
function between(a: number, b: number, key: KeyInfo): number | null {
  const sc = scaleOf(key), lo = Math.min(a, b), hi = Math.max(a, b);
  for (let m = lo + 1; m < hi; m++) if (sc.includes(((m % 12) + 12) % 12)) return m;
  return null;
}
const fillRests = (notes: MelodyNote[], total: number): MelodyNote[] => {
  const out: MelodyNote[] = [];
  let pos = 0;
  for (const n of [...notes].sort((a, b) => a.beat - b.beat)) {
    if (n.beat > pos + 1e-6) out.push({ midi: null, beat: pos, beats: n.beat - pos });
    out.push(n); pos = n.beat + n.beats;
  }
  if (total > pos + 1e-6) out.push({ midi: null, beat: pos, beats: total - pos });
  return out;
};
/** Join repeated notes in a voice into one held note (pads and inner voices sound smoother tied). */
function tieRepeats(notes: MelodyNote[], maxBeats = 4): MelodyNote[] {
  const out: MelodyNote[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && n.midi !== null && last.midi === n.midi && Math.abs(last.beat + last.beats - n.beat) < 1e-6 && last.beats + n.beats <= maxBeats && !n.lyric) last.beats += n.beats;
    else out.push({ ...n });
  }
  return out;
}

/**
 * Four-part arrangement in a chosen style. The melody is moved by octaves into the soprano range (or the
 * tenor range for "melody in the tenor"); melodyShift says by how much.
 */
export function harmonize(m: Melody, style: ArrStyle = 'hymn'): Harmony {
  const pitched = m.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const med = pitched.length ? [...pitched].sort((a, b) => a - b)[pitched.length >> 1] : 67;
  const tenorLead = style === 'tenor';
  const [lo, hi] = tenorLead ? [54, 61] : [64, 74];
  let shift = 0;
  while (med + shift < lo) shift += 12;
  while (med + shift > hi) shift -= 12;
  const lead = m.notes.map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + shift }));
  const barBeats = m.timeSig[0] * (4 / m.timeSig[1]);
  const total = Math.max(m.bars * barBeats, ...lead.map((n) => n.beat + n.beats));
  const plan = planSlots(lead, m, style === 'call' ? 'hymn' : style);
  const chords = chooseFor(plan, m.key, style);
  const voicing = voiceAll(chords, plan.map((s) => s.sop), tenorLead ? 2 : 0, m.key);
  const slots: ChordSlot[] = plan.map((s, i) => ({ beat: s.beat, beats: s.beats, chord: s.sop === null ? null : chords[i] }));
  const techniques: string[] = [];
  const cad = plan.map((s, i) => (s.phraseEnd !== 'none' && slots[i].chord ? `${s.phraseEnd === 'half' ? 'half cadence on V' : `${chordLabel(slots[i - 1]?.chord ?? chords[i])}–${chordLabel(chords[i])} cadence`} in bar ${Math.floor(s.beat / barBeats) + 1}` : '')).filter(Boolean);
  if (cad.length) techniques.push(`Phrases end with a ${cad.join(', a ')}.`);
  if (chords.some((c, i) => slots[i].chord && c.inv === 1)) techniques.push('First-inversion chords keep the bass line stepping.');
  if (chords.some((c, i) => slots[i].chord && (c.degree === 'I64' || c.degree === 'i64'))) techniques.push('A cadential 6/4 sets up the final cadence.');
  if (chords.some((c, i) => slots[i].chord && c.degree === 'V/V')) techniques.push('A secondary dominant (V of V) leans into the dominant.');

  // plain block voices, one note per slot
  const part = (v: number) => plan.map((s, i) => ({ midi: voicing[i] ? voicing[i]![v] : null, beat: s.beat, beats: s.beats } as MelodyNote));
  let S: MelodyNote[] = tenorLead ? part(0) : lead.map((n) => ({ ...n }));
  let A = part(1), T: MelodyNote[] = tenorLead ? lead.map((n) => ({ ...n })) : part(2), B = part(3);

  if (style === 'hymn' || style === 'tenor') {
    techniques.unshift(style === 'hymn' ? 'Note against note: a new chord under each main melody note, all four voices moving together.' : 'The tune is in the tenor; the sopranos sing a descant made of chord tones, mostly moving against the tune.');
    if (tenorLead) S = tieRepeats(S, 2); else { A = tieRepeats(A, 1); T = tieRepeats(T, 1); }
  }

  if (style === 'moving') {
    techniques.unshift('Moving parts: the lower voices fill leaps with passing notes and the bass walks between chords.');
    const embellish = (v: MelodyNote[], name: string, bass = false) => {
      const out: MelodyNote[] = [];
      let added = 0;
      v.forEach((n, i) => {
        const nx = v[i + 1];
        const leap = n.midi !== null && nx?.midi != null ? Math.abs(nx.midi - n.midi) : 0;
        if (n.midi !== null && nx?.midi != null && n.beats >= 1 && (leap === 3 || leap === 4 || (bass && leap === 5 && n.beats >= 2))) {
          const p = between(n.midi, nx.midi, m.key);
          if (p !== null) {
            const half = n.beats >= 2 ? n.beats - 1 : n.beats / 2;
            out.push({ midi: n.midi, beat: n.beat, beats: half }, { midi: p, beat: n.beat + half, beats: n.beats - half });
            added++; return;
          }
        }
        out.push({ ...n });
      });
      if (added) techniques.push(`${added} passing note${added > 1 ? 's' : ''} in the ${name}.`);
      return out;
    };
    A = embellish(A, 'alto'); T = embellish(T, 'tenor'); B = embellish(B, 'bass', true);
    // 4-3 suspension at the final cadence: an inner voice holds the tonic over V, then falls to the leading tone
    const fin = plan.findIndex((s) => s.phraseEnd === 'final');
    const vI = fin - 1;
    if (vI > 0 && chords[vI].degree.startsWith('V') && voicing[vI] && voicing[vI - 1] && plan[vI].beats >= 1) {
      const lead7 = (m.key.tonic + 11) % 12;
      for (const [vi, arr, name] of [[1, A, 'alto'], [2, T, 'tenor']] as const) {
        const now = voicing[vI]![vi], before = voicing[vI - 1]![vi];
        if (((now % 12) + 12) % 12 === lead7 && before === now + 1) {
          const idx = arr.findIndex((n) => Math.abs(n.beat - plan[vI].beat) < 1e-6);
          if (idx >= 0) {
            const n = arr[idx], h = n.beats / 2;
            arr.splice(idx, 1, { midi: now + 1, beat: n.beat, beats: h }, { midi: now, beat: n.beat + h, beats: n.beats - h });
            techniques.push(`A 4–3 suspension in the ${name} at the final cadence.`);
            break;
          }
        }
      }
    }
  }

  if (style === 'pad') {
    techniques.unshift('Alto, tenor and bass hold soft chords on "ooh", changing every half bar, while the melody leads.');
    const ooh = (v: MelodyNote[]) => tieRepeats(v, 8).map((n, i) => (n.midi !== null && (i === 0 || v[i - 1]?.midi === null) ? { ...n, lyric: 'Ooh' } : n));
    A = ooh(A); T = ooh(T); B = tieRepeats(B, 8).map((n, i) => (i === 0 && n.midi !== null ? { ...n, lyric: 'Ooh' } : n));
  }

  if (style === 'call') {
    const ph = phrases(lead);
    const A2: MelodyNote[] = [], T2: MelodyNote[] = [], B2: MelodyNote[] = [];
    let echoes = 0, full = 0;
    ph.forEach(([s0, e0], pi) => {
      const p0 = lead[s0].beat, p1 = lead[e0].beat + lead[e0].beats;
      const inPhrase = (n: MelodyNote) => n.beat >= p0 - 1e-6 && n.beat < p1 - 1e-6;
      if (pi % 2 === 1) {
        // the answer: the whole choir in harmony
        full++;
        for (const [src, dst] of [[A, A2], [T, T2], [B, B2]] as const) dst.push(...src.filter(inPhrase));
      } else {
        // the call: lead alone over a soft hum on the chord roots and 5ths
        const hum = harmonize(m, 'pad');
        hum.voices.slice(1).forEach((v, vi) => {
          const dst = [A2, T2, B2][vi];
          const inside = v.notes.filter((n) => n.midi !== null && n.beat >= p0 - 1e-6 && n.beat < p1 - 1e-6);
          inside.forEach((n, k) => dst.push({ midi: n.midi, beat: n.beat, beats: Math.min(n.beats, p1 - n.beat), lyric: k === 0 ? 'Mm' : undefined }));
        });
      }
      // the response: in the gap after the phrase (a held last note or a rest), the choir echoes the
      // phrase's last motif
      const gapStart = lead[e0].beats >= 2 ? lead[e0].beat + 1 : p1;
      let gapEnd = lead[e0 + 1]?.midi === null ? lead[e0 + 1].beat + lead[e0 + 1].beats : p1;
      if (ph[pi + 1]) gapEnd = Math.min(gapEnd, lead[ph[pi + 1][0]].beat);
      const room = gapEnd - gapStart;
      if (room >= 1 - 1e-6 && pi % 2 === 0) {
        const tail = lead.slice(s0, e0 + 1).filter((n) => n.midi !== null).filter((n, j, arr) => j === 0 || arr[j - 1].midi !== n.midi);
        const motif = tail.slice(room >= 2 ? -3 : -2);
        const len = motif.reduce((a, n) => a + Math.min(n.beats, 1), 0);
        const k = Math.min(1, room / Math.max(1, len));
        let at = gapStart;
        const endSlot = plan.findIndex((s) => s.beat <= lead[e0].beat + 1e-6 && s.beat + s.beats > lead[e0].beat + 1e-6);
        const ch = chords[endSlot] ?? chords[chords.length - 1];
        const pcs = chordPcs(ch);
        for (const n of motif) {
          const d = room < 2 ? room / motif.length : Math.max(0.5, Math.round(Math.min(n.beats, 1) * k * 2) / 2);
          if (at + d > gapEnd + 1e-6) break;
          let tn = n.midi! - shift; while (tn > 64) tn -= 12; while (tn < 50) tn += 12;
          const al = notesIn(pcs, tn + 3, tn + 9)[0] ?? tn + 4;
          // drop any held notes from the call under the echo
          for (const arr of [T2, A2, B2]) for (let j = arr.length - 1; j >= 0; j--) if (arr[j].beat < at + d - 1e-6 && arr[j].beat + arr[j].beats > at + 1e-6) { const c0 = arr[j]; if (c0.beat < at) c0.beats = at - c0.beat; else arr.splice(j, 1); }
          const first = at === gapStart;
          T2.push({ midi: tn, beat: at, beats: d, lyric: first ? 'echo' : undefined }); A2.push({ midi: al, beat: at, beats: d });
          at += d;
        }
        B2.push({ midi: notesIn([ch.root], 43, 54)[0], beat: gapStart, beats: Math.max(0.5, at - gapStart) });
        echoes++;
      }
    });
    A = A2; T = T2; B = B2;
    techniques.unshift(`Call and response: the lead sings each call over a hum${echoes ? `, the choir echoes the end of ${echoes > 1 ? `${echoes} phrases` : 'the phrase'}` : ''}${full ? `, and ${full > 1 ? `${full} phrases are` : 'the next phrase is'} answered in full harmony` : ''}.`);
    if (!echoes) techniques.push('Sing longer notes or leave short rests between phrases and the choir will echo you.');
  }

  const clean = (v: MelodyNote[]) => fillRests(v.filter((n) => n.beats > 1e-6), total);
  return {
    slots, melodyShift: shift, style, techniques,
    voices: [{ name: 'Soprano', notes: clean(S) }, { name: 'Alto', notes: clean(A) }, { name: 'Tenor', notes: clean(T) }, { name: 'Bass', notes: clean(B) }],
  };
}
