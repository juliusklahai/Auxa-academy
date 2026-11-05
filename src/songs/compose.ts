// Original practice pieces composed from a seed (always the same piece for the same seed).
// Graded: Beginner (C position, whole-note bass), Easy (one octave, root-fifth bass), Intermediate
// (eighth notes, other keys, waltz or Alberti bass), Advanced (sixteenths, flat/sharp keys, arpeggios).
import type { SongSpec } from './build';
import type { Groove, Song, SongLevel } from './index';

function rng(seed: string) {
  let a = 0; for (let i = 0; i < seed.length; i++) a = (Math.imul(a ^ seed.charCodeAt(i), 2654435761) + 0x9e3779b9) | 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)] };
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m: number, flats: boolean) => `${(flats ? FLAT : SHARP)[m % 12]}${Math.floor(m / 12) - 1}`;

interface Plan { tonic: number; fifths: number; beats: number; rhythms: number[][]; lh: 'whole' | 'fifths' | 'waltz' | 'alberti' | 'arp'; range: [number, number]; tempo: number; groove: Groove }
const PLANS: Record<SongLevel, Plan[]> = {
  Beginner: [{ tonic: 0, fifths: 0, beats: 4, rhythms: [[1, 1, 2], [1, 1, 1, 1], [2, 2], [4]], lh: 'whole', range: [60, 67], tempo: 92, groove: 'soft' }],
  Easy: [
    { tonic: 7, fifths: 1, beats: 4, rhythms: [[1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 2], [1, 1, 2]], lh: 'fifths', range: [62, 74], tempo: 96, groove: 'soft' },
    { tonic: 5, fifths: -1, beats: 3, rhythms: [[1, 1, 1], [2, 1], [1, 0.5, 0.5, 1]], lh: 'waltz', range: [60, 72], tempo: 100, groove: 'waltz' },
  ],
  Intermediate: [
    { tonic: 2, fifths: 2, beats: 4, rhythms: [[0.5, 0.5, 1, 0.5, 0.5, 1], [1, 0.5, 0.5, 2], [1.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2]], lh: 'alberti', range: [62, 79], tempo: 96, groove: 'soft' },
    { tonic: 10, fifths: -2, beats: 3, rhythms: [[1, 0.5, 0.5, 1], [2, 1], [0.5, 0.5, 0.5, 0.5, 1]], lh: 'waltz', range: [62, 77], tempo: 108, groove: 'waltz' },
  ],
  Advanced: [
    { tonic: 3, fifths: -3, beats: 4, rhythms: [[0.25, 0.25, 0.25, 0.25, 1, 0.5, 0.5, 1], [0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 2], [1, 0.25, 0.25, 0.25, 0.25, 1, 1]], lh: 'arp', range: [63, 84], tempo: 100, groove: 'none' },
    { tonic: 9, fifths: 3, beats: 4, rhythms: [[0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 1, 1], [0.5, 0.25, 0.25, 1, 0.5, 0.5, 1], [1.5, 0.5, 0.25, 0.25, 0.25, 0.25, 1]], lh: 'arp', range: [64, 86], tempo: 104, groove: 'soft' },
  ],
};
const PROGS = [[1, 4, 5, 1, 6, 4, 5, 1], [1, 5, 6, 4, 1, 4, 5, 1], [1, 6, 4, 5, 1, 6, 5, 1], [1, 4, 6, 5, 4, 1, 5, 1]];
const ADJ = ['Velvet', 'Paper', 'Lantern', 'Silver', 'Hidden', 'Orchard', 'Northern', 'Amber', 'Glass', 'Clockwork', 'Starlit', 'Willow'];
const NOUN = ['Steps', 'Garden', 'Clocktower', 'Ferry', 'Sparrow', 'Meadow', 'Bridge', 'Carousel', 'Tide', 'Market', 'Valley', 'Streetlights'];
const FORM: Record<SongLevel, string[]> = { Beginner: ['Song', 'Tune', 'March'], Easy: ['Waltz', 'Song', 'Dance'], Intermediate: ['Etude', 'Waltz', 'Serenade'], Advanced: ['Toccatina', 'Nocturne', 'Study'] };

export function composeSong(seed: string, level: SongLevel, variant = 0): Song {
  const r = rng(`${seed}:${level}:${variant}`);
  const P = PLANS[level][variant % PLANS[level].length];
  const flats = P.fifths < 0;
  const scale = (lo: number, hi: number) => { const o: number[] = []; for (let m = lo; m <= hi; m++) if (MAJOR.includes((((m - P.tonic) % 12) + 12) % 12)) o.push(m); return o; };
  const pool = scale(P.range[0], P.range[1]);
  const prog = r.pick(PROGS);
  const triad = (d: number) => [0, 2, 4].map((s) => (P.tonic + MAJOR[(d - 1 + s) % 7]) % 12);
  const rhBars: string[] = [], lhBars: string[] = [];
  let prev = pool[Math.floor(pool.length / 2)], prev2 = -1;
  let dir: 1 | -1 = r.next() < 0.5 ? 1 : -1;
  const motif = r.pick(P.rhythms);
  for (let b = 0; b < 8; b++) {
    const ch = triad(prog[b]);
    const rh = b === 7 ? [P.beats] : b % 2 === 0 ? motif : r.pick(P.rhythms);
    const notes: string[] = [];
    rh.forEach((d, k) => {
      const strong = k === 0;
      // a melodic contour: keep a direction for a while, turn at the edges or now and then
      if (prev >= P.range[1] - 1) dir = -1; else if (prev <= P.range[0] + 1) dir = 1; else if (r.next() < 0.28) dir = -dir as 1 | -1;
      const target = prev + dir * (strong ? r.pick([2, 3, 4, 5]) : d < 0.5 ? 1 : r.pick([1, 2, 2, 3]));
      let c = pool.filter((m) => m !== prev && m !== prev2);
      if (strong) { const ct = c.filter((m) => ch.includes(m % 12) && Math.abs(m - prev) <= 7); if (ct.length) c = ct; }
      if (b === 7) c = pool.filter((m) => m % 12 === P.tonic);
      if (!c.length) c = pool;
      const m = c.reduce((a, x) => (Math.abs(x - target) + r.next() * 0.9 < Math.abs(a - target) + r.next() * 0.9 ? x : a), c[0]);
      notes.push(`${nm(m, flats)}:${d}`); prev2 = prev; prev = m;
    });
    rhBars.push(notes.join(' '));
    // left hand
    const root = 36 + ((ch[0] - 36 % 12 + 12) % 12); // C2..B2
    const r3 = root + ((ch[1] - ch[0] + 12) % 12), r5 = root + ((ch[2] - ch[0] + 12) % 12);
    const n = (m: number, d: number) => `${nm(m, flats)}:${d}`;
    const B = P.beats;
    let lh: string;
    if (b === 7) lh = `${nm(root + 12, flats)}+${nm(r5 + 12, flats)}:${B}`;
    else if (P.lh === 'whole') lh = n(root + 12, B);
    else if (P.lh === 'fifths') lh = B === 4 ? `${n(root + 12, 2)} ${n(r5 + 12 > 59 ? r5 : r5 + 12, 2)}` : n(root + 12, B);
    else if (P.lh === 'waltz') lh = `${n(root, 1)} ${nm(r3 + 12, flats)}+${nm(r5 + 12, flats)}:1 ${nm(r3 + 12, flats)}+${nm(r5 + 12, flats)}:1${B === 4 ? ` ${nm(r3 + 12, flats)}+${nm(r5 + 12, flats)}:1` : ''}`;
    else if (P.lh === 'alberti') lh = Array.from({ length: B * 2 }, (_, i) => n([root + 12, r5 + 12, r3 + 12, r5 + 12][i % 4], 0.5)).join(' ');
    else lh = Array.from({ length: B * 2 }, (_, i) => n([root, r5, root + 12, r3 + 12, r5 + 12, r3 + 12, root + 12, r5][i % 8], 0.5)).join(' ');
    lhBars.push(lh);
  }
  const title = `${r.pick(ADJ)} ${r.pick(NOUN)} ${r.pick(FORM[level])}`;
  const spec: SongSpec = {
    title, composer: 'Maestro original', fifths: P.fifths, beats: P.beats, beatType: 4, tempo: P.tempo,
    parts: [{ id: 'P1', name: 'Piano', program: 1, staves: [{ clef: 'G', music: rhBars.join(' | ') }, { clef: 'F', music: lhBars.join(' | ') }] }],
  };
  const keyName = `${(flats ? FLAT : SHARP)[P.tonic]} major`;
  const lhText = { whole: 'one long bass note per bar', fifths: 'root and fifth', waltz: 'an oom-pah-pah waltz bass', alberti: 'an Alberti bass', arp: 'flowing arpeggios' }[P.lh];
  return {
    id: `gen-${level.toLowerCase()}-${variant}-${seed}`, title, composer: 'Maestro original (practice piece)', level, groove: P.groove, original: true,
    about: `Original practice piece in ${keyName}, ${P.beats}/4. Left hand: ${lhText}.`, spec, colors: {},
  };
}

/** Two generated practice pieces per level. */
export const COMPOSED: Song[] = (['Beginner', 'Easy', 'Intermediate', 'Advanced'] as SongLevel[]).flatMap((lv) => [composeSong('a', lv, 0), composeSong('b', lv, 1)]);
