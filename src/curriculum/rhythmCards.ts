// Rhythm demos written the way you say them: "ta ta ti-ti ta-a". Each word is one note (or rest),
// with its usual length; add a pitch with "E4=" and an exact length with "@1.5"; "r" makes a rest.
//   ta 1   ta-a 2   ta-a-a 3   ta-a-a-a 4   ta-i 1.5 (dotted quarter)   ti 0.5   ka 0.25
//   tri / po / let 1/3   sh 1 (quarter rest)   sh-h 2   sh-h-h 3   sh-h-h-h 4   s 0.5 (eighth rest)
import { nameToMidi } from '../core/music';
import type { RhythmDemo } from '../core/types';

const LEN: Record<string, number> = {
  ta: 1, 'ta-a': 2, 'ta-a-a': 3, 'ta-a-a-a': 4, 'ta-i': 1.5, ti: 0.5, 'ti-i': 0.75, ka: 0.25, tri: 1 / 3, po: 1 / 3, let: 1 / 3,
  sh: 1, 'sh-h': 2, 'sh-h-h': 3, 'sh-h-h-h': 4, s: 0.5,
};
const REST = new Set(['sh', 'sh-h', 'sh-h-h', 'sh-h-h-h', 's']);

/** "ta ta ti ti ta-a" -> an animated rhythm demo */
export function R(spec: string, opts: { bpm?: number; timeSig?: [number, number]; midi?: number; countIn?: boolean } = {}): RhythmDemo {
  const items = spec.trim().split(/\s+/).map((tok) => {
    let say = tok, midi = opts.midi ?? 72, beats: number | undefined, rest = false;
    const eq = say.indexOf('=');
    if (eq > 0) { midi = nameToMidi(say.slice(0, eq)); say = say.slice(eq + 1); }
    const at = say.indexOf('@');
    if (at > 0) { const v = say.slice(at + 1); rest = v.endsWith('r'); beats = parseFloat(v); say = say.slice(0, at); }
    if (REST.has(say)) rest = true;
    const b = beats ?? LEN[say];
    if (b === undefined) throw new Error(`rhythm word "${say}" has no length`);
    return { beats: b, rest, say: say === 's' ? 'sh' : say, midi: rest ? undefined : midi };
  });
  return { items, bpm: opts.bpm ?? 80, timeSig: opts.timeSig, countIn: opts.countIn };
}

/** A map of the staff: each note appears in turn with its letter name under it ("E4 G4 B4 D5 F5"). */
export function M(clef: 'treble' | 'bass', notes: string, opts: { bpm?: number; beats?: number } = {}): RhythmDemo {
  const items = notes.trim().split(/\s+/).map((n) => ({ beats: opts.beats ?? 1, midi: nameToMidi(n), say: n.replace(/\d+$/, '').replace('#', '♯').replace(/(?<=[A-G])b$/, '♭') }));
  // one bar holds them all, so the map never breaks across lines
  const total = items.reduce((a, it) => a + it.beats, 0);
  return { items, bpm: opts.bpm ?? 60, clef, map: true, countIn: false, timeSig: [Math.max(4, Math.ceil(total)), 4] };
}
