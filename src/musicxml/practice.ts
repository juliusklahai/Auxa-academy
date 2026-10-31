// Turns an imported score + the learner's chosen part(s) into an assessable exercise.
// Only the chosen tracks are scored; every other unmuted track becomes accompaniment.

import type { Exercise, ScoreEvent } from '../core/types';
import type { Score, ScoreNote } from './parse';

export interface PracticeSpec {
  tracks: string[];         // track keys the learner performs
  fromMeasure: number;      // performance-order measure index (inclusive)
  toMeasure: number;        // inclusive
  mode: 'wait' | 'timed';
  transpose?: number;       // semitones applied to targets and playback
  voice?: boolean;          // singing
  octaveFree?: boolean;
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
  const pianoLike = score.parts.some((p) => p.staves > 1);
  const srcQ: number[] = [];
  const eventNotes: ScoreNote[][] = [];
  const events: ScoreEvent[] = [...groups.values()].sort((a, b) => a[0].startQ - b[0].startQ).map((g) => {
    srcQ.push(g[0].srcStartQ);
    eventNotes.push(g);
    const pitches = [...new Set(g.map((n) => n.midi + tr))].sort((a, b) => a - b);
    const staves = new Set(g.map((n) => staffOf(n.track)));
    return {
      pitches, beat: g[0].startQ - q0, beats: Math.min(...g.map((n) => n.durQ)),
      hand: pianoLike && staves.size === 1 ? (staves.has(1) ? 'RH' : 'LH') : undefined,
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
