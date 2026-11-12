// Ear-training drills: question generators (pure, unit-tested). The EarDrill screen plays them and checks
// answers given by tapping a choice or by playing on the keys.
import type { DrillSpec } from '../core/types';
import { countQuestion, meterQuestion, roadmapQuestion, tempoQuestion } from './readingDrills';

export interface Sound { midi: number; startMs: number; durMs: number }
export interface DrillQuestion {
  /** what to do, shown above the choices */
  prompt: string;
  /** the context (key) and the question itself */
  sound: Sound[];
  /** the key alone, to hear again */
  context: Sound[];
  /** one answer per slot (most drills have one slot) */
  answers: string[];
  /** choices for every slot */
  options: string[];
  /** answers by playing: does this key answer slot i? */
  byKey?: (midi: number, slot: number) => boolean;
  /** heard after answering: the resolution or the answer played alone */
  reveal: Sound[];
  /** road-map drills: the tiny score as tokens (bar numbers and signs), drawn as boxes */
  map?: string[];
  /** one line on how to hear it next time */
  explain: string;
  tonic: number;
}

const PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const keyName = (tonic: number, mode: 'major' | 'minor' = 'major') => `${PC[((tonic % 12) + 12) % 12]} ${mode}`;

export const DEGREE_SEMI: Record<string, number> = { '1': 0, b2: 1, '2': 2, b3: 3, '3': 4, '4': 5, '#4': 6, '5': 7, b6: 8, '6': 9, b7: 10, '7': 11 };
export const SOLFEGE: Record<string, string> = { '1': 'do', b2: 'ra', '2': 're', b3: 'me', '3': 'mi', '4': 'fa', '#4': 'fi', '5': 'sol', b6: 'le', '6': 'la', b7: 'te', '7': 'ti' };
const DEGREE_FEEL: Record<string, string> = {
  '1': 'home: stable, finished',
  '2': 'wants to fall to do',
  b3: 'the minor third: dark, wants to fall to do',
  '3': 'bright and calm, rests well',
  '4': 'leans down to mi',
  '5': 'strong and open, the second home',
  b6: 'heavy, leans down to sol',
  '6': 'sweet, slightly sad, leans down to sol',
  b7: 'bluesy, falls to la or sol',
  '7': 'the leading tone: tense, pulls up to do',
};

export const INTERVALS: { id: string; semi: number; name: string; up: string; down?: string }[] = [
  { id: 'm2', semi: 1, name: 'minor 2nd', up: 'the shark theme from Jaws', down: 'Für Elise (first two notes)' },
  { id: 'M2', semi: 2, name: 'major 2nd', up: 'Happy Birthday ("Hap-py")', down: 'Mary Had a Little Lamb' },
  { id: 'm3', semi: 3, name: 'minor 3rd', up: 'Greensleeves', down: 'Hey Jude ("Hey Jude")' },
  { id: 'M3', semi: 4, name: 'major 3rd', up: 'When the Saints Go Marching In', down: 'Swing Low, Sweet Chariot' },
  { id: 'P4', semi: 5, name: 'perfect 4th', up: 'Here Comes the Bride', down: 'O Come, All Ye Faithful' },
  { id: 'TT', semi: 6, name: 'tritone', up: 'Maria (West Side Story)', down: 'the Simpsons theme' },
  { id: 'P5', semi: 7, name: 'perfect 5th', up: 'Twinkle Twinkle ("Twin-kle, twin-kle")', down: 'the Flintstones theme' },
  { id: 'm6', semi: 8, name: 'minor 6th', up: 'The Entertainer (the jump up)', down: 'Love Story theme' },
  { id: 'M6', semi: 9, name: 'major 6th', up: 'My Bonnie Lies Over the Ocean', down: 'Nobody Knows the Trouble I\'ve Seen' },
  { id: 'm7', semi: 10, name: 'minor 7th', up: 'Somewhere (West Side Story)', down: 'Watermelon Man' },
  { id: 'M7', semi: 11, name: 'major 7th', up: 'Take On Me (chorus jump)', down: 'I Love You (Cole Porter)' },
  { id: 'P8', semi: 12, name: 'octave', up: 'Somewhere Over the Rainbow', down: 'Willow Weep for Me' },
];

export const QUALITIES: Record<string, { name: string; ints: number[]; hear: string }> = {
  maj: { name: 'major', ints: [0, 4, 7], hear: 'bright, settled' },
  min: { name: 'minor', ints: [0, 3, 7], hear: 'darker, softer' },
  dim: { name: 'diminished', ints: [0, 3, 6], hear: 'tight, tense, unstable' },
  aug: { name: 'augmented', ints: [0, 4, 8], hear: 'floating, dreamy, unresolved' },
  sus4: { name: 'sus4', ints: [0, 5, 7], hear: 'open, waiting to drop to major' },
  maj7: { name: 'major 7', ints: [0, 4, 7, 11], hear: 'lush, soft, a little wistful' },
  m7: { name: 'minor 7', ints: [0, 3, 7, 10], hear: 'mellow, smooth minor' },
  '7': { name: 'dominant 7', ints: [0, 4, 7, 10], hear: 'bluesy, wants to move' },
  m7b5: { name: 'half-diminished', ints: [0, 3, 6, 10], hear: 'dark and searching, the ii of a minor key' },
  dim7: { name: 'diminished 7', ints: [0, 3, 6, 9], hear: 'spooky, suspenseful, symmetrical' },
  '9': { name: 'dominant 9', ints: [0, 4, 7, 10, 14], hear: 'funky, rich dominant' },
  m9: { name: 'minor 9', ints: [0, 3, 7, 10, 14], hear: 'warm, modern minor' },
  '6': { name: 'major 6', ints: [0, 4, 7, 9], hear: 'sweet, old-time ending chord' },
};

/** Chords by Roman numeral, as semitones above the tonic (root first). */
export const NUMERALS: Record<string, number[]> = {
  I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16], 'vii°': [11, 14, 17],
  i: [0, 3, 7], 'ii°': [2, 5, 8], III: [3, 7, 10], iv: [5, 8, 12], v: [7, 10, 14], VI: [8, 12, 15], VII: [10, 14, 17], bVII: [10, 14, 17],
  Imaj7: [0, 4, 7, 11], ii7: [2, 5, 9, 12], iii7: [4, 7, 11, 14], IVmaj7: [5, 9, 12, 16], V7: [7, 11, 14, 17], vi7: [9, 12, 16, 19],
  I7: [0, 4, 7, 10], IV7: [5, 9, 12, 15], VI7: [9, 13, 16, 19], II7: [2, 6, 9, 12], III7: [4, 8, 11, 14], bII7: [1, 5, 8, 11],
  'iiø7': [2, 5, 8, 12], 'V7b9': [7, 11, 14, 17, 20], im7: [0, 3, 7, 10], im6: [0, 3, 7, 9],
};

export type Rnd = () => number;
const pick = <T,>(a: T[], rnd: Rnd) => a[Math.floor(rnd() * a.length) % a.length];
const DEFAULT_KEYS = [60, 62, 65, 67, 57, 58, 64];

/** Chord as notes: root in the bass (an octave below the key's home), the rest voiced close above. */
export function voiceChord(tonic: number, semis: number[], prevTop?: number[]): number[] {
  let bass = tonic + semis[0];
  while (bass > 52) bass -= 12;
  while (bass < 40) bass += 12;
  // upper notes: pick the octave of each that stays nearest the middle (or the previous chord)
  const centre = prevTop?.length ? prevTop.reduce((a, b) => a + b, 0) / prevTop.length : tonic + 5;
  const upper = semis.slice(semis.length > 3 ? 1 : 0).map((s) => {
    let m = tonic + s;
    while (m - centre > 6) m -= 12;
    while (centre - m > 6) m += 12;
    return m;
  }).sort((a, b) => a - b);
  return [bass, ...upper];
}

export function cadence(tonic: number, mode: 'major' | 'minor' = 'major', startMs = 0, beatMs = 600): Sound[] {
  const prog = mode === 'major' ? ['I', 'IV', 'V', 'I'] : ['i', 'iv', 'V', 'i'];
  return chords(tonic, prog, startMs, beatMs * 1.4);
}

export function chords(tonic: number, prog: string[], startMs: number, chordMs: number): Sound[] {
  const out: Sound[] = [];
  let prev: number[] | undefined;
  prog.forEach((n, i) => {
    const v = voiceChord(tonic, NUMERALS[n]);
    prev = v.slice(1);
    for (const m of v) out.push({ midi: m, startMs: startMs + i * chordMs, durMs: chordMs * 0.92 });
  });
  void prev;
  return out;
}

const endOf = (s: Sound[]) => Math.max(0, ...s.map((x) => x.startMs + x.durMs));
const notes = (ms: number[], start: number, each: number): Sound[] => ms.map((m, i) => ({ midi: m, startMs: start + i * each, durMs: each * 0.9 }));

/** The shortest walk from a degree back home, the way functional ear training resolves (6 7 1, 4 3 2 1). */
export function resolution(tonic: number, deg: string, mode: 'major' | 'minor' = 'major'): number[] {
  const scale = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const s = DEGREE_SEMI[deg];
  const idx = scale.findIndex((x) => x === s);
  const start = tonic + s;
  if (idx < 0) return [start, tonic];
  if (idx >= 4) { const up = scale.slice(idx).map((x) => tonic + x); return [...up, tonic + 12]; } // 5 6 7 1 up
  return scale.slice(0, idx + 1).reverse().map((x) => tonic + x);
}

/** Short tunes as scale degrees (with a chord per bar) for "find the home note". */
const TUNES: { degs: string[]; prog: string[] }[] = [
  { degs: ['3', '2', '1', '2', '3', '3', '3', '2', '2', '2', '3', '5', '5'], prog: ['I', 'V', 'I', 'I'] },
  { degs: ['5', '3', '4', '5', '6', '5', '4', '3'], prog: ['I', 'IV', 'I', 'V'] },
  { degs: ['1', '3', '5', '6', '5', '3', '2', '3'], prog: ['I', 'vi', 'IV', 'V'] },
  { degs: ['5', '6', '5', '4', '3', '2', '3', '5'], prog: ['I', 'ii', 'V', 'I'] },
  { degs: ['3', '4', '5', '3', '2', '7', '1', '2'], prog: ['I', 'V', 'vi', 'IV'] },
  { degs: ['6', '5', '3', '5', '6', '1', '6', '5'], prog: ['vi', 'IV', 'I', 'V'] },
];

/** Build one round of a drill. */
export function makeQuestion(spec: DrillSpec, rnd: Rnd = Math.random): DrillQuestion {
  const mode = spec.mode ?? 'major';
  const tonic = pick(spec.keys ?? DEFAULT_KEYS, rnd);
  const beat = 600;
  switch (spec.kind) {
    case 'count': return countQuestion(spec.pool, rnd);
    case 'tempo': return tempoQuestion(spec.pool, rnd);
    case 'meter': return meterQuestion(spec.pool, rnd);
    case 'roadmap': return roadmapQuestion(spec.pool, rnd);
    case 'tonic': {
      const tune = pick(TUNES, rnd);
      const mel = tune.degs.map((d) => tonic + 12 + DEGREE_SEMI[d] - (DEGREE_SEMI[d] > 7 ? 12 : 0));
      const each = 380;
      const per = Math.ceil(mel.length / tune.prog.length) * each;
      const sound = [...chords(tonic, tune.prog, 0, per), ...notes(mel, 0, each)];
      return {
        prompt: 'Where is home? Play the note the tune wants to end on (any octave).',
        sound, context: [], answers: [PC[tonic % 12]], options: [...PC],
        byKey: (m) => ((m - tonic) % 12 + 12) % 12 === 0,
        reveal: [...chords(tonic, [mode === 'major' ? 'I' : 'i'], 0, 1400), ...notes([tonic + 12], 0, 1400)],
        explain: `Home was ${PC[tonic % 12]}. Hum the tune and stop: the note that feels finished is home.`,
        tonic,
      };
    }
    case 'degree': {
      const deg = pick(spec.pool, rnd);
      const ctx = cadence(tonic, mode, 0, beat);
      const at = endOf(ctx) + 500;
      const target = tonic + DEGREE_SEMI[deg];
      return {
        prompt: `Key of ${keyName(tonic, mode)}. Which note of the scale is it? Tap it, or play it on the keys.`,
        sound: [...ctx, { midi: target, startMs: at, durMs: 1300 }], context: ctx,
        answers: [deg], options: spec.pool,
        byKey: (m) => ((m - target) % 12 + 12) % 12 === 0,
        reveal: notes(resolution(tonic, deg, mode), 0, 420),
        explain: `${deg} (${SOLFEGE[deg]}): ${DEGREE_FEEL[deg] ?? 'listen for where it wants to go'}.`,
        tonic,
      };
    }
    case 'interval': {
      const id = pick(spec.pool, rnd);
      const iv = INTERVALS.find((x) => x.id === id)!;
      const style = spec.style === 'mixed' || !spec.style ? pick(['up', 'down', 'together'] as const, rnd) : spec.style;
      const low = tonic - 5 + Math.floor(rnd() * 7);
      const pair = style === 'down' ? [low + iv.semi, low] : [low, low + iv.semi];
      const sound = style === 'together' ? pair.map((m) => ({ midi: m, startMs: 0, durMs: 1500 })) : notes(pair, 0, 750);
      return {
        prompt: style === 'together' ? 'Two notes together. How far apart?' : `Two notes, going ${style}. How far apart?`,
        sound, context: [], answers: [id], options: spec.pool,
        reveal: notes(pair, 0, 650),
        explain: `${iv.name}: think ${style === 'down' && iv.down ? iv.down : iv.up}.`,
        tonic,
      };
    }
    case 'quality': {
      const q = pick(spec.pool, rnd);
      const root = tonic - 3 + Math.floor(rnd() * 6);
      const ch = [root - 12, ...QUALITIES[q].ints.map((x) => root + x)];
      return {
        prompt: 'What kind of chord is it?',
        sound: [...ch.map((m) => ({ midi: m, startMs: 0, durMs: 1600 })), ...notes(ch.slice(1), 1800, 300)],
        context: [], answers: [q], options: spec.pool,
        reveal: ch.map((m) => ({ midi: m, startMs: 0, durMs: 1400 })),
        explain: `${QUALITIES[q].name}: ${QUALITIES[q].hear}.`,
        tonic,
      };
    }
    case 'progression':
    case 'bass': {
      const prog = pick(spec.pool, rnd).split('-');
      const home = mode === 'major' ? (prog.some((p) => /7/.test(p)) ? 'Imaj7' : 'I') : 'i';
      const ctx = chords(tonic, [home], 0, 1300);
      const at = endOf(ctx) + 700;
      const sound = [...ctx, ...chords(tonic, prog, at, 1300)];
      const opts = [...new Set(spec.pool.flatMap((p) => p.split('-')))];
      const roots = prog.map((p) => tonic + NUMERALS[p][0]);
      return {
        prompt: spec.kind === 'bass'
          ? `Home chord first, then four chords. Play the bass note (root) of each one, in order.`
          : `Home chord first, then four chords. Name each one.`,
        sound, context: ctx, answers: prog, options: opts,
        byKey: (m, slot) => ((m - roots[slot]) % 12 + 12) % 12 === 0,
        reveal: chords(tonic, prog, 0, 1100),
        explain: `${prog.join(' – ')} in ${keyName(tonic, mode)}: bass ${roots.map((r) => PC[r % 12]).join(' ')}.`,
        tonic,
      };
    }
  }
}

/** Labels for answer buttons. */
export function optionLabel(kind: DrillSpec['kind'], id: string): string {
  if (kind === 'degree') return `${id} · ${SOLFEGE[id] ?? ''}`;
  if (kind === 'interval') return INTERVALS.find((x) => x.id === id)?.name ?? id;
  if (kind === 'quality') return QUALITIES[id]?.name ?? id;
  return id;
}
