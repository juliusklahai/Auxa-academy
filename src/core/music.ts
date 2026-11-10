// Pure music helpers shared by every module. No DOM, no audio: fully unit-testable.

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SOLFEGE = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number to scientific pitch name, e.g. 60 -> "C4". */
export function midiToName(midi: number): string {
  return `${NOTE_NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToSolfege(midi: number): string {
  return SOLFEGE[((midi % 12) + 12) % 12];
}

/** "C4", "F#3", "Bb2" -> MIDI number. Throws on invalid input. */
export function nameToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Invalid note name: ${name}`);
  const pc = PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Frequency to fractional MIDI (69.0 = A4). */
export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

/** Nearest MIDI note plus deviation in cents (-50..+50). */
export function freqToNote(freq: number, a4 = 440): { midi: number; cents: number } {
  const f = freqToMidiFloat(freq, a4);
  const midi = Math.round(f);
  return { midi, cents: Math.round((f - midi) * 100) };
}

/** VexFlow key string, e.g. 61 -> "c#/4". */
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export function midiToVexKey(midi: number, flats = false): string {
  const n = (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((midi % 12) + 12) % 12].toLowerCase();
  return `${n}/${Math.floor(midi / 12) - 1}`;
}

export const MIDDLE_C = 60;
