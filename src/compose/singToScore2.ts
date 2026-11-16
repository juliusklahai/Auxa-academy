// Sing to score, version 2, in one call: a recorded take -> syllables -> a written melody.
import { analyzeVoice, findSyllables, type Syllable } from './voiceNotes';
import { readRhythm } from './rhythm';
import { keyInfo, type Melody } from './transcribe';

export interface VoiceScoreOpts {
  /** known tempo (sung with the click), or a forced tempo (half / double reading) */
  bpm?: number;
  /** time of a known downbeat, ms from the start of the samples (with the click) */
  origin?: number;
  /** a fixed meter */
  timeSig?: [number, number];
  /** times of the metronome clicks, ms from the start of the samples */
  clicks?: number[];
  a4?: number;
  /** ms from the start of the samples: anything sung before this (during the count-in) is ignored */
  singFrom?: number;
}

/** A take, written as a melody. Also returns the syllables (with their times in ms) for checking. */
export function scoreFromVoice(samples: Float32Array, sampleRate: number, opts: VoiceScoreOpts = {}): (Melody & { syllables: Syllable[]; /** the singer's overall tuning against A = 440, cents */ tuning: number }) | null {
  const key: { tonic?: number; mode?: 'major' | 'minor'; offset?: number } = {};
  const syl = findSyllables(analyzeVoice(samples, sampleRate, opts.a4 ?? 440), { clicks: opts.clicks, key })
    .filter((s) => opts.singFrom === undefined || s.vowel >= opts.singFrom);
  if (!syl.length) return null;
  const r = readRhythm(syl.map((s) => ({ midi: s.midi, t: s.vowel, e: s.end })), { bpm: opts.bpm, origin: opts.origin, timeSig: opts.timeSig });
  if (!r) return null;
  const bar = r.timeSig[0] * (4 / r.timeSig[1]);
  const total = r.notes.reduce((a, n) => Math.max(a, n.beat + n.beats), 0);
  return { notes: r.notes, bpm: r.bpm, timeSig: r.timeSig, key: keyInfo(key.tonic ?? 0, key.mode ?? 'major'), tuning: Math.round((key.offset ?? 0) * 100), bars: Math.round(total / bar), syllables: syl };
}
