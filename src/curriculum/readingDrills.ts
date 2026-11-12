// Reading drills that need no score: say a rhythm in syllables, name a tempo, name a meter, and follow a
// score's road map (repeats, endings, D.C., D.S., coda). Same question shape as the ear drills.
import type { DrillQuestion, Sound } from './drills';

type Rnd = () => number;
const pick = <T,>(xs: T[], rnd: Rnd) => xs[Math.floor(rnd() * xs.length)];
const shuffle = <T,>(xs: T[], rnd: Rnd) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------------- rhythm syllables ----------------
   one beat = one quarter note. Each cell is one beat (or two for ta-a) and has a syllable. */
export const CELLS: Record<string, { beats: number[]; say: string; name: string }> = {
  ta: { beats: [1], say: 'ta', name: 'quarter' },
  'ta-a': { beats: [2], say: 'ta-a', name: 'half' },
  'ta-a-a': { beats: [3], say: 'ta-a-a', name: 'dotted half' },
  sh: { beats: [], say: 'sh', name: 'quarter rest' },
  'ti-ti': { beats: [0.5, 0.5], say: 'ti-ti', name: 'two eighths' },
  'ti-ka-ti-ka': { beats: [0.25, 0.25, 0.25, 0.25], say: 'ti-ka-ti-ka', name: 'four sixteenths' },
  'ti-tika': { beats: [0.5, 0.25, 0.25], say: 'ti-tika', name: 'eighth and two sixteenths' },
  'tika-ti': { beats: [0.25, 0.25, 0.5], say: 'tika-ti', name: 'two sixteenths and an eighth' },
  'tri-po-let': { beats: [1 / 3, 1 / 3, 1 / 3], say: 'tri-po-let', name: 'triplet' },
};
const cellLen = (c: string) => (c === 'sh' ? 1 : CELLS[c].beats.reduce((a, b) => a + b, 0));

/** A four-beat pattern made from the allowed cells. */
function pattern(pool: string[], rnd: Rnd): string[] {
  for (let tries = 0; tries < 50; tries++) {
    const out: string[] = []; let len = 0;
    while (len < 4) { const c = pick(pool, rnd); if (len + cellLen(c) <= 4) { out.push(c); len += cellLen(c); } }
    if (out.some((c) => c !== 'ta')) return out;
  }
  return ['ta', 'ta', 'ta-a'];
}
function rhythmSound(cells: string[], beatMs: number, at = 0, midi = 72): Sound[] {
  const out: Sound[] = []; let t = at;
  for (const c of cells) {
    if (c === 'sh') { t += beatMs; continue; }
    for (const b of CELLS[c].beats) { out.push({ midi, startMs: t, durMs: Math.max(90, b * beatMs * 0.85) }); t += b * beatMs; }
  }
  return out;
}
const clicks = (n: number, beatMs: number): Sound[] => Array.from({ length: n }, (_, i) => ({ midi: i === 0 ? 96 : 91, startMs: i * beatMs, durMs: 60 }));

export function countQuestion(pool: string[], rnd: Rnd): DrillQuestion {
  const beatMs = 640;
  const right = pattern(pool, rnd);
  const say = (p: string[]) => p.map((c) => CELLS[c].say).join('  ');
  const wrong = new Set<string>();
  for (let i = 0; i < 40 && wrong.size < 3; i++) { const w = pattern(pool, rnd); if (say(w) !== say(right)) wrong.add(say(w)); }
  const ctx = clicks(4, beatMs);
  return {
    prompt: 'Four clicks, then a rhythm of four beats. Which words fit it? Say them out loud as you listen again.',
    sound: [...ctx, ...rhythmSound(right, beatMs, 4 * beatMs)], context: ctx,
    answers: [say(right)], options: shuffle([say(right), ...wrong], rnd),
    reveal: [...clicks(4, beatMs), ...rhythmSound(right, beatMs, 4 * beatMs)],
    explain: `${right.map((c) => `${CELLS[c].say} (${CELLS[c].name})`).join(', ')}.`,
    tonic: 60,
  };
}

/* ---------------- tempo words ---------------- */
export const TEMPOS: { id: string; bpm: number; means: string }[] = [
  { id: 'Largo', bpm: 50, means: 'very slow and broad' },
  { id: 'Adagio', bpm: 66, means: 'slow, at ease' },
  { id: 'Andante', bpm: 84, means: 'walking speed' },
  { id: 'Moderato', bpm: 104, means: 'moderate' },
  { id: 'Allegro', bpm: 136, means: 'quick and bright' },
  { id: 'Presto', bpm: 180, means: 'very fast' },
];
export function tempoQuestion(pool: string[], rnd: Rnd): DrillQuestion {
  const id = pick(pool, rnd);
  const t = TEMPOS.find((x) => x.id === id)!;
  const beatMs = 60000 / t.bpm;
  const tune = [60, 64, 67, 64, 65, 62, 64, 60];
  const sound: Sound[] = tune.map((m, i) => ({ midi: m + 12, startMs: i * beatMs, durMs: beatMs * 0.8 }));
  for (let i = 0; i < tune.length; i += 2) sound.push({ midi: i % 4 === 0 ? 48 : 43, startMs: i * beatMs, durMs: beatMs * 1.8 });
  return {
    prompt: 'Listen to the speed. Which tempo word fits best?',
    sound, context: [], answers: [t.id], options: pool,
    reveal: sound,
    explain: `${t.id}: ${t.means}, about ${t.bpm} beats a minute.`,
    tonic: 60,
  };
}

/* ---------------- meter ---------------- */
const METERS: Record<string, { strong: number[]; per: number; beatMs: number; how: string }> = {
  '2/4': { strong: [1, 0], per: 2, beatMs: 520, how: 'two beats in a bar: STRONG weak, like a march' },
  '3/4': { strong: [1, 0, 0], per: 3, beatMs: 500, how: 'three beats: STRONG weak weak, like a waltz' },
  '4/4': { strong: [1, 0, 0.5, 0], per: 4, beatMs: 480, how: 'four beats: STRONG weak medium weak' },
  '6/8': { strong: [1, 0, 0, 0.5, 0, 0], per: 6, beatMs: 230, how: 'two big beats, each split in three: ONE-and-a TWO-and-a' },
};
export function meterQuestion(pool: string[], rnd: Rnd): DrillQuestion {
  const id = pick(pool, rnd);
  const m = METERS[id];
  const sound: Sound[] = [];
  const bars = 4;
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < m.per; k++) {
      const t = (b * m.per + k) * m.beatMs, s = m.strong[k];
      if (s === 1) { sound.push({ midi: 41, startMs: t, durMs: m.beatMs * 0.9 }, { midi: 53, startMs: t, durMs: m.beatMs * 0.9 }); }
      else sound.push(...[57, 60, 65].map((x) => ({ midi: x + (s ? 0 : 0), startMs: t, durMs: m.beatMs * (s ? 0.7 : 0.45) })));
    }
  }
  return {
    prompt: 'Find the strong beat and count to the next one. Which time signature is it?',
    sound, context: [], answers: [id], options: pool,
    reveal: sound,
    explain: `${id}: ${m.how}.`,
    tonic: 53,
  };
}

/* ---------------- road map ----------------
   A tiny score as bar numbers and signs; the answer is the order you play the bars in. */
interface Map { show: string; order: number[]; wrong: number[][]; how: string }
function roadMaps(rnd: Rnd): Map[] {
  const r = (n: number) => 1 + Math.floor(rnd() * n);
  const a = r(2);
  return [
    { // simple repeat
      show: `${a === 1 ? '1 2 |: 3 4 :| 5' : '|: 1 2 :| 3 4'}`,
      order: a === 1 ? [1, 2, 3, 4, 3, 4, 5] : [1, 2, 1, 2, 3, 4],
      wrong: a === 1 ? [[1, 2, 3, 4, 5], [1, 2, 3, 4, 1, 2, 3, 4, 5], [1, 2, 3, 3, 4, 4, 5]] : [[1, 2, 3, 4], [1, 2, 3, 4, 1, 2, 3, 4], [1, 1, 2, 2, 3, 4]],
      how: 'Play to the repeat sign :|, go back to the facing sign |: (or to the start), and play that part once more.',
    },
    { // first and second endings
      show: '|: 1 2 [1. 3 :| [2. 4',
      order: [1, 2, 3, 1, 2, 4], wrong: [[1, 2, 3, 4], [1, 2, 3, 1, 2, 3, 4], [1, 2, 3, 4, 1, 2]],
      how: 'First time through play the 1st ending; on the repeat skip it and play the 2nd ending.',
    },
    { // D.C. al Fine
      show: '1 2 Fine 3 4 D.C. al Fine',
      order: [1, 2, 3, 4, 1, 2], wrong: [[1, 2, 3, 4], [1, 2, 3, 4, 1, 2, 3, 4], [1, 2, 1, 2, 3, 4]],
      how: 'D.C. means back to the beginning; al Fine means stop at the word Fine.',
    },
    { // D.S. al Coda
      show: '1 Segno 2 3 To Coda 4 D.S. al Coda Coda 5',
      order: [1, 2, 3, 4, 2, 3, 5], wrong: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 1, 2, 3, 5], [1, 2, 3, 4, 2, 3, 4, 5]],
      how: 'D.S. sends you back to the Segno sign; at "To Coda" jump to the Coda at the end.',
    },
    { // repeat inside D.C.
      show: '|: 1 2 :| Fine 3 4 D.C. al Fine',
      order: [1, 2, 1, 2, 3, 4, 1, 2], wrong: [[1, 2, 1, 2, 3, 4, 1, 2, 1, 2], [1, 2, 3, 4, 1, 2], [1, 2, 1, 2, 3, 4]],
      how: 'Repeats are usually not taken again after a D.C., so on the way back play bars 1 and 2 once and stop at Fine.',
    },
  ];
}
export function roadmapQuestion(pool: string[], rnd: Rnd): DrillQuestion {
  const maps = roadMaps(rnd);
  const idx = pool.length ? Number(pick(pool, rnd)) : Math.floor(rnd() * maps.length);
  const m = maps[Math.max(0, Math.min(maps.length - 1, idx))];
  const fmt = (o: number[]) => o.join(' ');
  const scale = [60, 62, 64, 65, 67, 69];
  const reveal: Sound[] = m.order.map((bar, i) => ({ midi: scale[bar - 1] + 12, startMs: i * 420, durMs: 380 }));
  return {
    prompt: 'In what order do you play the bars?',
    map: m.show.replace('To Coda', 'To-Coda').replace('D.C. al Fine', 'D.C.-al-Fine').replace('D.S. al Coda', 'D.S.-al-Coda').split(' ').map((x) => x.replace(/-/g, ' ')),
    sound: [], context: [], answers: [fmt(m.order)], options: shuffle([fmt(m.order), ...m.wrong.map(fmt)], rnd),
    reveal,
    explain: m.how,
    tonic: 60,
  };
}
