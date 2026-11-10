// Sung melody -> finished MusicXML (melody line, or SATB in closed score with chord names).
import { harmonize, type Harmony } from './harmony';
import type { Melody } from './transcribe';
import { writeXml } from './xml';

export function melodyXml(m: Melody, title: string, chords?: Harmony['slots']): string {
  const p = m.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const med = p.length ? [...p].sort((a, b) => a - b)[p.length >> 1] : 67;
  return writeXml({ title, key: m.key, timeSig: m.timeSig, bpm: m.bpm, partName: 'Voice', staves: [med < 57 ? 'bass' : 'treble'], voices: [{ notes: m.notes, staff: 0 }], chords });
}

export function satbXml(m: Melody, title: string, h: Harmony = harmonize(m)): string {
  const [S, A, T, B] = h.voices;
  // chord symbols only where the chord changes
  const chords = h.slots.filter((s, i) => s.chord && !(h.slots[i - 1]?.chord && h.slots[i - 1].chord!.degree === s.chord.degree && h.slots[i - 1].chord!.inv === s.chord.inv));
  return writeXml({
    title, key: m.key, timeSig: m.timeSig, bpm: m.bpm, partName: 'Choir', staves: ['treble', 'bass'], chords,
    voices: [{ notes: S.notes, staff: 1, stem: 'up' }, { notes: A.notes, staff: 1, stem: 'down' }, { notes: T.notes, staff: 2, stem: 'up' }, { notes: B.notes, staff: 2, stem: 'down' }],
  });
}

/** Every note to play back, in ms from the start. */
export function playbackNotes(voices: { notes: Melody['notes'] }[], bpm: number) {
  const beat = 60000 / bpm;
  return voices.flatMap((v) => v.notes.filter((n) => n.midi !== null).map((n) => ({ midi: n.midi!, startMs: n.beat * beat, durMs: n.beats * beat * 0.95 })));
}
