// Teach before you test: every exercise may only use what a learner has already been shown.
//
// For each exercise we list the ideas it needs (note values, rests, meters, clefs, key signatures,
// accidentals, tempo words, intervals, chord types, scale degrees...). For each teaching step we list the
// ideas it teaches (its animated demos, its explicit tags, and the words in its text). Walking the course
// in order, any idea an exercise needs that no earlier step (in this lesson or a lesson before it) taught
// is a gap. The curriculum test fails on gaps.

import type { Exercise, Lesson, TeachStep } from '../core/types';
import { CELLS } from './readingDrills';

export type Concept = string;

const VALUE_NAMES: [number, string][] = [[4, 'whole'], [3, 'dottedHalf'], [2, 'half'], [1.5, 'dottedQuarter'], [1, 'quarter'], [0.75, 'dottedEighth'], [0.5, 'eighth'], [0.25, 'sixteenth']];
/** the note value (or rest) a duration is written as; null for tied/unusual lengths */
export function valueName(beats: number): string | null {
  if (Math.abs(beats - 1 / 3) < 0.02 || Math.abs(beats - 2 / 3) < 0.02) return 'triplet';
  const v = VALUE_NAMES.find(([b]) => Math.abs(b - beats) < 1e-6);
  return v ? v[1] : null;
}

/** what an exercise asks of the learner */
export function conceptsNeeded(ex: Exercise): Set<Concept> {
  const c = new Set<Concept>();
  const d = ex.drill;
  if (d) {
    switch (d.kind) {
      case 'count':
        for (const cell of d.pool) {
          if (cell === 'sh') { c.add('rest:quarter'); continue; }
          for (const b of CELLS[cell]?.beats ?? []) { const v = valueName(b); if (v) c.add(`value:${v}`); }
          c.add('syllables');
        }
        break;
      case 'tempo': for (const w of d.pool) c.add(`tempo:${w}`); break;
      case 'meter': for (const m of d.pool) c.add(`meter:${m}`); break;
      case 'interval': for (const i of d.pool) c.add(`interval:${i}`); break;
      case 'quality': for (const q of d.pool) c.add(`chord:${q}`); break;
      case 'degree': c.add('degrees'); if (d.pool.some((x) => x.startsWith('b'))) c.add('minor'); break;
      case 'progression': case 'bass': c.add('numerals'); if (d.pool.some((p) => /7/.test(p))) c.add('chord:7'); break;
      case 'tonic': c.add('tonic'); break;
      case 'notename': if (d.pool.some((p) => p.startsWith('bass'))) c.add('clef:bass'); if (d.pool.includes('ledger')) c.add('ledger'); break;
      case 'keysig': c.add('keysig'); break;
      case 'roadmap': c.add('repeats'); if (d.pool.some((p) => +p >= 2)) c.add('dcds'); break;
    }
    return c;
  }
  // a score to read and play
  for (const e of ex.events) {
    const v = valueName(e.beats);
    if (!v) continue;
    c.add(e.pitches.length ? `value:${v}` : `rest:${v}`);
  }
  const [n, dd] = ex.timeSig;
  if (!(n === 4 && dd === 4)) c.add(`meter:${n}/${dd}`);
  if (ex.clef === 'bass' || ex.grand || ex.events.some((e) => e.hand === 'LH' || e.hands?.includes('LH'))) c.add('clef:bass');
  if (ex.fifths) c.add('keysig');
  if (!ex.fifths && ex.events.some((e) => e.pitches.some((m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12)))) c.add('accidentals');
  if (ex.swing) c.add('swing');
  return c;
}

/** words in a teaching step that teach an idea (our own curriculum wording) */
const WORDS: [RegExp, Concept[]][] = [
  [/whole note|ta-a-a-a/i, ['value:whole']],
  [/dotted half|ta-a-a\b/i, ['value:dottedHalf']],
  [/half note|"ta-a"/i, ['value:half']],
  [/dotted quarter/i, ['value:dottedQuarter']],
  [/quarter note|"ta"/i, ['value:quarter']],
  [/dotted eighth|dotted-eighth/i, ['value:dottedEighth']],
  [/eighth note|eighths|ti-ti/i, ['value:eighth']],
  [/sixteenth|ti-ka/i, ['value:sixteenth']],
  [/triplet|tri-po-let/i, ['value:triplet']],
  [/quarter rest|"sh"/i, ['rest:quarter']],
  [/half rest/i, ['rest:half']],
  [/whole rest|whole-bar rest|full bar of rest/i, ['rest:whole']],
  [/eighth rest/i, ['rest:eighth']],
  [/dotted half rest/i, ['rest:dottedHalf']],
  [/\brests?\b/i, []],
  [/4\/4|four-four|common time/i, ['meter:4/4']],
  [/3\/4|three-four|three beats in a bar|waltz time/i, ['meter:3/4']],
  [/2\/4|two-four/i, ['meter:2/4']],
  [/6\/8|six-eight/i, ['meter:6/8']],
  [/cut time|2\/2|alla breve/i, ['meter:2/2']],
  [/12\/8|twelve-eight/i, ['meter:12/8']],
  [/bass clef|f clef/i, ['clef:bass']],
  [/ledger line/i, ['ledger']],
  [/key signature/i, ['keysig']],
  [/sharp|flat|black key/i, ['accidentals']],
  [/swing/i, ['swing']],
  [/syllable|"ta"|ta-a/i, ['syllables']],
  [/repeat sign|first ending|second ending|repeats/i, ['repeats']],
  [/d\.c\.|d\.s\.|coda|da capo|dal segno/i, ['dcds']],
  [/scale degree|do re mi|solfege|\bdo\b.*\bsol\b/i, ['degrees']],
  [/home note|tonic|key centre|key center/i, ['tonic']],
  [/roman numeral|\bI-IV-V|\bI IV V\b|\bV7?\b chord/i, ['numerals']],
  [/minor/i, ['minor', 'chord:min']],
  [/major chord|major triad|major and minor/i, ['chord:maj']],
  [/diminished/i, ['chord:dim']],
  [/augmented/i, ['chord:aug']],
  [/major 7|maj7|major seventh/i, ['chord:maj7']],
  [/minor 7|m7\b|minor seventh/i, ['chord:m7']],
  [/dominant 7|dominant seventh|\bV7\b|seventh chord/i, ['chord:7']],
  [/half-diminished|m7b5|ø/i, ['chord:m7b5']],
  [/major 2nd|major second|whole step|whole tone/i, ['interval:M2']],
  [/minor 3rd|minor third/i, ['interval:m3']],
  [/major 3rd|major third/i, ['interval:M3']],
  [/perfect 4th|perfect fourth|\bfourth\b/i, ['interval:P4']],
  [/perfect 5th|perfect fifth|\bfifth\b/i, ['interval:P5']],
  [/major 6th|major sixth|\bsixth\b/i, ['interval:M6']],
  [/octave/i, ['interval:P8']],
  [/adagio/i, ['tempo:Adagio']], [/andante/i, ['tempo:Andante']], [/moderato/i, ['tempo:Moderato']],
  [/allegro/i, ['tempo:Allegro']], [/presto/i, ['tempo:Presto']], [/largo/i, ['tempo:Largo']],
];

/** what a teaching step teaches */
export function conceptsTaught(s: TeachStep): Set<Concept> {
  const c = new Set<Concept>(s.teaches ?? []);
  const text = `${s.title}\n${s.body}\n${(s.tips ?? []).join('\n')}`;
  for (const [re, cs] of WORDS) if (re.test(text)) cs.forEach((x) => c.add(x));
  if (s.rhythm) for (const it of s.rhythm.items) {
    const v = valueName(it.beats);
    if (v) c.add(it.rest ? `rest:${v}` : `value:${v}`);
    if (it.say) c.add('syllables');
  }
  if (s.tempos) for (const w of s.tempos) c.add(`tempo:${w}`);
  if (s.meters) for (const m of s.meters) c.add(`meter:${m}`);
  return c;
}

export interface Gap { lesson: string; exercise: string; title: string; missing: Concept[] }

/** Walk the course in order and report every exercise that uses something not yet taught. */
export function auditCourse(lessons: Lesson[]): Gap[] {
  const gaps: Gap[] = [];
  const taught = new Set<Concept>();
  for (const l of lessons) {
    const here = new Set(taught);
    for (const s of l.teach) conceptsTaught(s).forEach((x) => here.add(x));
    for (const ex of l.exercises) {
      const missing = [...conceptsNeeded(ex)].filter((x) => !here.has(x));
      if (missing.length) gaps.push({ lesson: l.id, exercise: ex.id, title: ex.title, missing });
    }
    here.forEach((x) => taught.add(x));
  }
  return gaps;
}
