// Play-along mastery exercises: short original pieces where the app plays the melody, chords and
// bass, and the learner plays only the keys the lesson has taught (just middle C, or C to G, or the
// left-hand notes...). Every piece is generated from a seed, so it is the same every time.
//
// Music: a major key that contains every taught key, an 8-bar progression (I IV V vi and friends),
// a singable stepwise melody that lands on the taught keys on strong beats, and a light left-hand
// accompaniment. Notes the learner plays become the exercise events; everything else is backing.

import type { BackNote, Clef, Exercise, Hand, ScoreEvent, SkillId } from '../core/types';

export type PlayAlongStyle = 'echo' | 'call' | 'tempo' | 'melody' | 'chords';

export interface PlayAlongSpec {
  /** keys the learner plays */
  keys: number[];
  /** which line holds the learner's notes: RH = melody, LH = bass line, both = melody and bass */
  hand: Hand | 'both';
  styles: PlayAlongStyle[];
  /** chord voicings for the 'chords' style, by degree: 1 = I, 4 = IV, 5 = V, 6 = vi, 2 = ii */
  voicings?: Record<number, number[]>;
  beats?: 3 | 4;
  tempo?: number;
  skills?: SkillId[];
  hideLabels?: boolean;
}

// ---------- seeded randomness ----------
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: string) {
  let a = hash(seed) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)], chance: (p: number) => next() < p };
}

// ---------- harmony ----------
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const TONICS = [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6]; // C G F D Bb A Eb E Ab B Db F#
const PROGRESSIONS = [
  [1, 4, 5, 1, 6, 4, 5, 1], [1, 5, 6, 4, 1, 4, 5, 1], [1, 1, 4, 4, 5, 5, 1, 1], [1, 6, 2, 5, 1, 6, 5, 1], [1, 4, 1, 5, 1, 4, 5, 1],
];
/** First major key (in order of familiarity) whose scale contains all the keys. */
function keyFor(keys: number[]): number {
  for (const t of TONICS) if (keys.every((k) => MAJOR.includes((((k - t) % 12) + 12) % 12))) return t;
  return 0;
}
const triad = (tonic: number, degree: number) => [0, 2, 4].map((s) => (tonic + MAJOR[(degree - 1 + s) % 7]) % 12);
const inScale = (tonic: number, m: number) => MAJOR.includes((((m - tonic) % 12) + 12) % 12);

// ---------- names (original, fictional pieces) ----------
const ADJ = ['Little', 'Sleepy', 'Golden', 'Rainy', 'Copper', 'Quiet', 'Lucky', 'Silver', 'Morning', 'Paper', 'Velvet', 'Sunny', 'Midnight', 'Wandering', 'Jolly', 'Misty'];
const NOUN = ['Lantern', 'River', 'Train', 'Garden', 'Kite', 'Harbor', 'Owl', 'Market', 'Meadow', 'Carousel', 'Bridge', 'Comet', 'Fox', 'Lighthouse', 'Teapot', 'Parade'];
const KIND = ['Song', 'Waltz', 'March', 'Tune', 'Dance', 'Lullaby', 'Blues', 'Rag'];
export function pieceName(seed: string, beats: number) {
  const r = rng(seed + ':name');
  const kind = beats === 3 ? r.pick(['Waltz', 'Lullaby', 'Dance']) : r.pick(KIND.filter((k) => k !== 'Waltz'));
  return `${r.pick(ADJ)} ${r.pick(NOUN)} ${kind}`;
}

const RHYTHMS4: Record<PlayAlongStyle, number[][]> = {
  echo: [[1, 1, 2], [1, 1, 1, 1], [2, 2], [1, 1, 2]],
  call: [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1, 0.5, 0.5, 2]],
  tempo: [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [2, 2]],
  melody: [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [1.5, 0.5, 2]],
  chords: [[1, 1, 2], [2, 2], [1, 1, 1, 1]],
};
const RHYTHMS3: Record<PlayAlongStyle, number[][]> = {
  echo: [[1, 1, 1], [2, 1]], call: [[1, 1, 1], [2, 1], [1, 2]], tempo: [[1, 1, 1], [2, 1]], melody: [[1, 1, 1], [2, 1], [1, 0.5, 0.5, 1]], chords: [[2, 1], [1, 1, 1]],
};

interface Line { beat: number; beats: number; midi: number }

/** Build one play-along exercise. */
export function playAlong(id: string, spec: PlayAlongSpec, style: PlayAlongStyle, n: number): Exercise {
  const r = rng(`${id}:${style}:${n}`);
  const beats = spec.beats ?? 4;
  const tonic = keyFor(spec.keys);
  const prog = r.pick(PROGRESSIONS);
  const bars = 8;
  const keySet = new Set(spec.keys);
  const rhKeys = spec.hand === 'LH' ? [] : spec.keys.filter((k) => spec.hand === 'RH' || k >= 60);
  const lhKeys = spec.hand === 'RH' ? [] : spec.keys.filter((k) => spec.hand === 'LH' || k < 60);
  // melody range: around the taught right-hand keys (or around middle C)
  const mLo = rhKeys.length ? Math.min(...rhKeys) - 4 : 60, mHi = rhKeys.length ? Math.max(...rhKeys) + 5 : 74;
  const scaleNotes = (lo: number, hi: number) => { const out: number[] = []; for (let m = lo; m <= hi; m++) if (inScale(tonic, m)) out.push(m); return out; };
  const mPool = scaleNotes(Math.max(55, mLo), Math.min(84, mHi));
  const rhythms = (beats === 3 ? RHYTHMS3 : RHYTHMS4)[style];

  // ---- melody
  const melody: Line[] = [];
  let prev = rhKeys.length ? rhKeys[Math.floor(rhKeys.length / 2)] : mPool[Math.floor(mPool.length / 2)];
  for (let b = 0; b < bars; b++) {
    const chord = triad(tonic, prog[b]);
    const rh = r.pick(rhythms);
    let t = b * beats;
    rh.forEach((d, k) => {
      const strong = k === 0 || Math.abs(t - b * beats - 2) < 1e-6;
      const last = k === rh.length - 1;
      // stepwise, singable motion: strong beats go to a chord tone, weak beats step; avoid repeating
      const step = r.pick(strong ? [-4, -3, -2, 2, 3, 4] : [-2, -1, 1, 2, -1, 1]);
      let cands = mPool.filter((m) => m !== prev && Math.abs(m - prev) <= (strong ? 5 : 2));
      if (strong) { const ct = cands.filter((m) => chord.includes(m % 12)); if (ct.length) cands = ct; }
      if (!cands.length) cands = mPool.filter((m) => m !== prev);
      // drift back toward the middle of the range so the tune does not wander off
      const mid = (Math.min(...mPool) + Math.max(...mPool)) / 2;
      const score = (c: number) => Math.abs(c - (prev + step)) + Math.abs(c - mid) * 0.15 + r.next() * 0.8;
      let m = cands.reduce((a, c) => (score(c) < score(a) ? c : a), cands[0]);
      // land on the learner's keys: the end of every bar (echo), strong beats (call), most notes (melody)
      const want = rhKeys.length && (style === 'echo' ? last : style === 'call' ? strong : style === 'melody' ? strong || r.chance(0.35) : strong || last);
      if (want) m = rhKeys.reduce((a, c) => (Math.abs(c - m) < Math.abs(a - m) ? c : a));
      if (b === bars - 1 && last) m = rhKeys.length ? rhKeys.reduce((a, c) => (((c - tonic) % 12 === 0 ? 0 : 1) - ((a - tonic) % 12 === 0 ? 0 : 1) < 0 ? c : a)) : mPool.find((x) => (x - tonic) % 12 === 0) ?? m;
      melody.push({ beat: t, beats: d, midi: m });
      prev = m; t += d;
    });
  }

  // ---- bass / left hand
  const bass: Line[] = [];
  const bPool = (lo: number, hi: number, pcs: number[]) => { const out: number[] = []; for (let m = lo; m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m); return out; };
  const bLo = lhKeys.length ? Math.min(...lhKeys) - 2 : 41, bHi = lhKeys.length ? Math.max(...lhKeys) + 2 : 55;
  let bPrev = lhKeys.length ? lhKeys[0] : 48;
  for (let b = 0; b < bars; b++) {
    const chord = triad(tonic, prog[b]);
    const pattern = lhKeys.length ? (beats === 3 ? [[1, 1, 1], [2, 1]][b % 2] : r.pick([[2, 2], [1, 1, 2], [4], [1, 1, 1, 1]])) : beats === 3 ? [3] : [2, 2];
    let t = b * beats;
    pattern.forEach((d, k) => {
      let pcs = k === 0 ? [chord[0]] : chord;
      let cands = bPool(bLo, bHi, pcs);
      if (!cands.length) cands = bPool(bLo - 12, bHi, pcs);
      let m = cands.reduce((a, c) => (Math.abs(c - bPrev) < Math.abs(a - bPrev) ? c : a), cands[0] ?? 48);
      if (lhKeys.length) {
        const fits = lhKeys.filter((x) => chord.includes(x % 12));
        if (fits.length && (k === 0 || r.chance(0.7))) m = r.pick(fits.filter((x) => x !== bPrev).length ? fits.filter((x) => x !== bPrev) : fits);
        else if (r.chance(0.5)) m = lhKeys.reduce((a, c) => (Math.abs(c - m) < Math.abs(a - m) ? c : a));
      }
      bass.push({ beat: t, beats: d, midi: m });
      bPrev = m; t += d;
      void pcs; pcs = chord;
    });
  }

  // ---- split into the learner's events and the band's backing
  const events: ScoreEvent[] = [];
  const backing: BackNote[] = [];
  const evAt = new Map<number, ScoreEvent>();
  const addUser = (beat: number, beats: number, midi: number, hand: Hand) => {
    const k = Math.round(beat * 1000);
    const e = evAt.get(k);
    if (e) { if (!e.pitches.includes(midi)) { e.pitches.push(midi); e.hands = [...(e.hands ?? e.pitches.slice(0, -1).map(() => e.hand!)), hand]; e.beats = Math.min(e.beats, beats); e.hand = undefined; } return; }
    const ne: ScoreEvent = { pitches: [midi], beat, beats, hand };
    evAt.set(k, ne); events.push(ne);
  };
  const chordsStyle = style === 'chords' && spec.voicings;
  for (const m of melody) {
    if (!chordsStyle && rhKeys.length && keySet.has(m.midi)) addUser(m.beat, m.beats, m.midi, 'RH');
    else backing.push({ midi: chordsStyle && spec.hand !== 'LH' ? m.midi + 12 : m.midi, beat: m.beat, beats: m.beats, hand: 'RH', line: chordsStyle ? 'accomp' : 'melody', vel: 0.55 });
  }
  if (chordsStyle) {
    for (let b = 0; b < bars; b++) {
      const v = spec.voicings![prog[b]] ?? spec.voicings![1];
      const d = beats === 3 ? 3 : r.pick([[4], [2, 2]])[0];
      for (let t = 0; t < beats; t += d) v.forEach((m) => addUser(b * beats + t, d, m, spec.hand === 'LH' ? 'LH' : 'RH'));
    }
  }
  for (const m of bass) {
    if (lhKeys.length && keySet.has(m.midi)) addUser(m.beat, m.beats, m.midi, 'LH');
    else backing.push({ midi: m.midi, beat: m.beat, beats: m.beats, hand: 'LH', line: lhKeys.length ? 'melody' : 'accomp', vel: lhKeys.length ? 0.5 : 0.36 });
  }
  // soft chords under a right-hand part so it sounds like a band, not a bare line
  if (!lhKeys.length && !chordsStyle) for (let b = 0; b < bars; b++) {
    const chord = triad(tonic, prog[b]);
    const notes = bPool(50, 59, chord).slice(0, 3);
    notes.forEach((m) => backing.push({ midi: m, beat: b * beats, beats, hand: 'LH', line: 'accomp', vel: 0.24 }));
  }
  events.sort((a, b) => a.beat - b.beat);
  events.forEach((e) => {
    if (e.hands) { const o = e.pitches.map((p, i) => [p, e.hands![i]] as const).sort((a, b) => a[0] - b[0]); e.pitches = o.map((x) => x[0]); e.hands = o.map((x) => x[1]); }
    else e.pitches.sort((a, b) => a - b);
  });
  const timed = style === 'tempo';
  const clef: Clef = spec.hand === 'LH' ? 'bass' : 'treble';
  const name = pieceName(`${id}:${style}:${n}`, beats);
  const what = style === 'echo' ? 'The band plays each phrase; you answer with your notes at the end of the bar.'
    : style === 'call' ? 'The band plays; you play your notes on the strong beats.'
    : style === 'tempo' ? 'Keep time with the band: your notes come exactly on the beat.'
    : style === 'chords' ? 'The band plays the tune; you play the chords.'
    : 'You play every note of the tune that uses your keys; the band fills in the rest.';
  return {
    id: `${id}-pa${n}`, title: `Play along: ${name}`, objective: what, clef, mode: timed ? 'timed' : 'wait',
    tempo: spec.tempo ?? (timed ? 72 : 84), timeSig: [beats, 4], events, skills: spec.skills ?? ['keyboardGeography', 'pitchAccuracy'],
    passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'],
    backing, grand: spec.hand === 'both', hideLabels: spec.hideLabels,
  };
}

/** 2 to 5 play-along exercises for a lesson. */
export function playAlongs(lessonId: string, spec: PlayAlongSpec): Exercise[] {
  return spec.styles.map((st, i) => playAlong(lessonId, spec, st, i + 1)).filter((e) => e.events.length >= 3);
}
