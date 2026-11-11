// Sung melody -> finished MusicXML (melody line, or SATB in closed score with chord names).
import { harmonize, type Harmony } from './harmony';
import type { Melody } from './transcribe';
import { writeXml } from './xml';

/** Move a sung melody by octaves to where a soprano line sits (middle around E4 to D5). */
export function asSoprano(m: Melody): { melody: Melody; shift: number } {
  const p = m.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const med = p.length ? [...p].sort((a, b) => a - b)[p.length >> 1] : 67;
  let shift = 0;
  while (med + shift < 64) shift += 12;
  while (med + shift > 74) shift -= 12;
  return { shift, melody: shift ? { ...m, notes: m.notes.map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + shift })) } : m };
}

/**
 * The tune on one staff. A tune sung alone is the melody line, which choirs give to the sopranos, so by
 * default it is written in the soprano octave on the treble staff ("as sung" keeps the real octave).
 */
export function melodyXml(m: Melody, title: string, chords?: Harmony['slots'], asSung = false): string {
  const mm = asSung ? m : asSoprano(m).melody;
  const p = mm.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const med = p.length ? [...p].sort((a, b) => a - b)[p.length >> 1] : 67;
  return writeXml({ title, key: mm.key, timeSig: mm.timeSig, bpm: mm.bpm, partName: asSung ? 'Voice' : 'Soprano', staves: [med < 57 ? 'bass' : 'treble'], voices: [{ notes: mm.notes, staff: 0 }], chords });
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
