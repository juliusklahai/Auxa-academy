// Single entry point for LEARNER input from every source. App playback never flows through here,
// so assessment can never advance from the app's own demo notes.

import { audio } from '../audio/engine';
import type { InputSource } from '../core/types';
import { mic } from './mic';
import { midiIn } from './midi';

export interface LearnerNote { midi: number; on: boolean; velocity: number; at: number; source: InputSource; confidence: number; cents?: number }
type L = (n: LearnerNote) => void;
const listeners = new Set<L>();

export function onLearnerNote(l: L): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function emit(n: LearnerNote) {
  // Sound the note for on-screen / computer-keyboard / MIDI input (an acoustic piano makes its own sound).
  if (n.source !== 'mic') {
    if (n.on) audio.noteOn(n.midi, Math.max(0.35, n.velocity));
    else audio.noteOff(n.midi);
  }
  listeners.forEach((l) => l(n));
}

midiIn.onNote = (e) => emit({ midi: e.midi, on: e.on, velocity: e.velocity, at: e.at, source: 'midi', confidence: 1 });
// Voice: one note at a time.
mic.onNote = (n) => { if (mic.settings.mode === 'voice') emit({ midi: n.midi, on: true, velocity: 0.7, at: n.at, source: 'mic', confidence: n.confidence, cents: n.cents }); };
// Piano: every note struck together arrives as one chord event. Confident notes are passed on;
// if nothing in the chord is clear, ONE uncertain observation is passed so the learner is told,
// but it is never scored as a mistake.
mic.onChord = (c) => {
  if (mic.settings.mode === 'voice') return;
  const sure = c.notes.filter((n) => n.confidence >= mic.settings.minConfidence);
  const list = sure.length ? sure : [...c.notes].sort((a, b) => b.confidence - a.confidence).slice(0, 1);
  list.forEach((n) => emit({ midi: n.midi, on: true, velocity: 0.7, at: c.at, source: 'mic', confidence: n.confidence }));
};

// Desktop keyboard: two rows mapped like a piano, starting at an adjustable octave.
const WHITE = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
const WHITE_OFF = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
const BLACK: Record<string, number> = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15 };
export const keyboardMap = { baseMidi: 60 };
export function keyToMidi(key: string): number | null {
  const k = key.toLowerCase();
  const wi = WHITE.indexOf(k);
  if (wi >= 0) return keyboardMap.baseMidi + WHITE_OFF[wi];
  if (k in BLACK) return keyboardMap.baseMidi + BLACK[k];
  return null;
}
export function midiToKeyHint(midi: number): string | null {
  const off = midi - keyboardMap.baseMidi;
  const wi = WHITE_OFF.indexOf(off);
  if (wi >= 0) return WHITE[wi].toUpperCase();
  const b = Object.entries(BLACK).find(([, v]) => v === off);
  return b ? b[0].toUpperCase() : null;
}

const down = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'z') { keyboardMap.baseMidi = Math.max(24, keyboardMap.baseMidi - 12); return; }
    if (e.key === 'x') { keyboardMap.baseMidi = Math.min(96, keyboardMap.baseMidi + 12); return; }
    const m = keyToMidi(e.key);
    if (m === null || e.repeat || down.has(e.key) || e.ctrlKey || e.metaKey) return;
    down.add(e.key);
    emit({ midi: m, on: true, velocity: 0.75, at: performance.now(), source: 'computer-keyboard', confidence: 1 });
  });
  window.addEventListener('keyup', (e) => {
    const m = keyToMidi(e.key);
    down.delete(e.key);
    if (m !== null) emit({ midi: m, on: false, velocity: 0, at: performance.now(), source: 'computer-keyboard', confidence: 1 });
  });
}
