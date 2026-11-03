// Turns an imported score + the learner's chosen part(s) into an assessable exercise.
// Only the chosen tracks are scored; every other unmuted track becomes accompaniment.

import type { Exercise, Hand, ScoreEvent } from '../core/types';
import type { Score, ScoreNote } from './parse';

export interface PracticeSpec {
  tracks: string[];         // track keys the learner performs
  fromMeasure: number;      // performance-order measure index (inclusive)
  toMeasure: number;        // inclusive
  mode: 'wait' | 'timed';
  transpose?: number;       // semitones applied to targets and playback
  voice?: boolean;          // singing
  octaveFree?: boolean;
  /** which hand plays each track (guide hands); default: staff 1 = right, staff 2 = left in keyboard parts */
  handOf?: (trackKey: string) => Hand;
}

const VOCAL = /choir|chorus|satb|voice|vocal|soprano|alto|tenor|\bbass\b(?! guitar)|baritone|lead|solo|melody|singer/i;
const KEYBOARD = /piano|keyboard|organ|harpsichord|clavi|e-?piano|rhodes/i;
/** A part played by two hands: named like a keyboard, or two staves that both hold notes and is not a voice part. */
export function isKeyboardPart(score: Score, partId: string): boolean {
  const part = score.parts.find((p) => p.id === partId);
  if (!part) return false;
  if (KEYBOARD.test(part.name)) return true;
  const used = new Set(score.tracks.filter((t) => t.partId === partId).map((t) => t.staff));
  return used.size >= 2 && !VOCAL.test(part.name);
}

/**
 * What the guide hands play for a score: the keyboard part you practice; otherwise the score's
 * keyboard part (the accompaniment); otherwise a piano reduction of every pitched part, upper
 * voices in the right hand and lower voices (tenor, bass, low instruments) in the left.
 */
export function handTracksFor(score: Score, targets: Iterable<string>): { keys: string[]; handOf: (key: string) => Hand } {
  const targetParts = new Set([...targets].map((k) => k.split('|')[0]));
  const kb = score.parts.filter((p) => isKeyboardPart(score, p.id)).map((p) => p.id);
  const kbPart = kb.find((id) => targetParts.has(id)) ?? kb[0];
  const byStaff = (key: string): Hand => (score.tracks.find((t) => t.key === key)?.staff ?? 1) === 1 ? 'RH' : 'LH';
  if (kbPart) return { keys: score.tracks.filter((t) => t.partId === kbPart).map((t) => t.key), handOf: byStaff };
  const tracks = score.tracks.filter((t) => t.noteCount > 0);
  const lowRoles = new Set(['T', 'B']);
  const hand = new Map<string, Hand>(tracks.map((t) => [t.key, t.role ? (lowRoles.has(t.role) ? 'LH' : 'RH') : t.avgMidi < 60 ? 'LH' : 'RH']));
  return { keys: tracks.map((t) => t.key), handOf: (k) => hand.get(k) ?? 'RH' };
}

/** Written-score position (for the notation cursor) of a performance-timeline position. */
export function toSrcQ(score: Score, q: number): number {
  const M = score.measures.find((m) => q >= m.startQ - 1e-9 && q < m.startQ + m.lengthQ - 1e-9) ?? score.measures[score.measures.length - 1];
  return M ? M.srcStartQ + (q - M.startQ) : q;
}

export function rangeQ(score: Score, from: number, to: number): [number, number] {
  const a = score.measures[Math.max(0, from)], b = score.measures[Math.min(score.measures.length - 1, to)];
  return [a.startQ, b.startQ + b.lengthQ];
}

export function notesInRange(score: Score, from: number, to: number, tracks?: Set<string>): ScoreNote[] {
  const [q0, q1] = rangeQ(score, from, to);
  return score.notes.filter((n) => n.startQ >= q0 - 1e-9 && n.startQ < q1 - 1e-9 && (!tracks || tracks.has(n.track)));
}

export interface PracticeBuild { exercise: Exercise; srcQ: number[]; startQ: number; endQ: number; eventNotes: ScoreNote[][] }

export function buildPractice(score: Score, spec: PracticeSpec, tempoBpm: number): PracticeBuild {
  const set = new Set(spec.tracks);
  const [q0, q1] = rangeQ(score, spec.fromMeasure, spec.toMeasure);
  const notes = notesInRange(score, spec.fromMeasure, spec.toMeasure, set).filter((n) => !n.grace);
  const groups = new Map<string, ScoreNote[]>();
  for (const n of notes) { const k = n.startQ.toFixed(4); (groups.get(k) ?? groups.set(k, []).get(k)!).push(n); }
  const tr = spec.transpose ?? 0;
  const staffOf = (key: string) => score.tracks.find((t) => t.key === key)?.staff ?? 1;
  // two staves that both hold notes are played as two hands (piano, or a choir in closed score)
  const twoStaves = (pid: string) => new Set(score.tracks.filter((t) => t.partId === pid).map((t) => t.staff)).size >= 2;
  const handOfTrack = spec.handOf ?? ((key: string): Hand | undefined => (twoStaves(key.split('|')[0]) ? (staffOf(key) === 1 ? 'RH' : 'LH') : undefined));
  const srcQ: number[] = [];
  const eventNotes: ScoreNote[][] = [];
  const events: ScoreEvent[] = [...groups.values()].sort((a, b) => a[0].startQ - b[0].startQ).map((g) => {
    srcQ.push(g[0].srcStartQ);
    eventNotes.push(g);
    const pitches = [...new Set(g.map((n) => n.midi + tr))].sort((a, b) => a - b);
    const noteOf = (p: number) => g.find((n) => n.midi + tr === p)!;
    const handsOf = pitches.map((p) => handOfTrack(noteOf(p).track));
    const handSet = new Set(handsOf);
    const fingers = pitches.map((p) => noteOf(p).finger ?? 0);
    return {
      pitches, beat: g[0].startQ - q0, beats: Math.min(...g.map((n) => n.durQ)),
      hand: handSet.size === 1 ? handsOf[0] : undefined,
      hands: handSet.size > 1 && !handSet.has(undefined) ? (handsOf as Hand[]) : undefined,
      fingers: fingers.some((f) => f) ? fingers : undefined,
    };
  });
  const m0 = score.measures[spec.fromMeasure];
  const exercise: Exercise = {
    id: `score:${score.title}:${spec.tracks.join(',')}:${spec.fromMeasure}-${spec.toMeasure}`,
    title: score.title, objective: 'Play your part from the score.', clef: 'treble', mode: spec.mode,
    tempo: tempoBpm, timeSig: [m0.beats, m0.beatType], events, skills: [], passScore: 80,
    maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'],
    voice: spec.voice, octaveFree: spec.octaveFree,
  };
  return { exercise, srcQ, startQ: q0, endQ: q1, eventNotes };
}
