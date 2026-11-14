import { analyzeVoice, findSyllables, syllablesToNotes } from '../src/compose/voiceNotes';
import { readRhythm } from '../src/compose/rhythm';
import { detectKey, snapToKey, type SungNote, type Melody } from '../src/compose/transcribe';
export function melodyFrom(sung: SungNote[]): Melody | null {
  if (!sung.length) return null;
  const key = detectKey(sung);
  snapToKey(sung, key);
  const r = readRhythm(sung.map((n) => ({ midi: n.midi, t: n.start, e: n.end })));
  if (!r) return null;
  const bar = r.timeSig[0] * (4 / r.timeSig[1]);
  const total = r.notes.reduce((a, n) => Math.max(a, n.beat + n.beats), 0);
  return { notes: r.notes, bpm: r.bpm, timeSig: r.timeSig, key: detectKey(r.notes), bars: Math.round(total / bar) };
}
export const pipe = (x: Float32Array, sr: number): { notes: SungNote[]; meter?: [number, number]; bpm?: number; melody?: Melody | null } => {
  const syl = findSyllables(analyzeVoice(x, sr));
  const notes = syllablesToNotes(syl).map((n, i) => ({ ...n, start: syl[i].start }));
  const m = melodyFrom(syllablesToNotes(syl));
  return { notes, meter: m?.timeSig, bpm: m?.bpm, melody: m };
};
