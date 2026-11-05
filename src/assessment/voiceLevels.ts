// Singing levels, from "just sing" to strict vocal coaching. Applied on top of any sung exercise.
import type { Exercise } from '../core/types';

export type VoiceLevel = 'easy' | 'standard' | 'strict' | 'pro';

export interface VoiceLevelInfo {
  id: VoiceLevel;
  label: string;
  blurb: string;
  /** pitch-matching game: cents counted as in tune, and how long to hold (ms) */
  matchCents: number;
  holdMs: number;
}

export const VOICE_LEVELS: VoiceLevelInfo[] = [
  { id: 'easy', label: 'Easy', blurb: 'Just sing. Within a semitone counts, any octave, no restarts, and it moves on after 3 tries.', matchCents: 60, holdMs: 350 },
  { id: 'standard', label: 'Standard', blurb: 'The right note in any octave. Tuning tips, restart only after 5 misses in a row.', matchCents: 35, holdMs: 600 },
  { id: 'strict', label: 'Strict', blurb: 'Right note, tuned within about 25 cents, 3 misses in a row restart.', matchCents: 22, holdMs: 900 },
  { id: 'pro', label: 'Pro coach', blurb: 'Vocal coaching: only notes within 15 cents count, steady holds, rhythm as written.', matchCents: 12, holdMs: 1400 },
];
export const voiceLevelInfo = (id: VoiceLevel) => VOICE_LEVELS.find((l) => l.id === id) ?? VOICE_LEVELS[1];

export function applyVoiceLevel(ex: Exercise, level: VoiceLevel): Exercise {
  if (!ex.voice) return ex;
  switch (level) {
    case 'easy':
      return { ...ex, mode: 'wait', octaveFree: true, pitchSlack: 1, gentle: true, autoAdvanceAfter: 3, maxConsecutiveMistakes: 999, passScore: 60, centsTolerance: 70, strictCents: undefined };
    case 'standard':
      return { ...ex, octaveFree: true, pitchSlack: 0, gentle: false, autoAdvanceAfter: undefined, maxConsecutiveMistakes: 5, passScore: 75, centsTolerance: 40, strictCents: undefined };
    case 'strict':
      return { ...ex, octaveFree: true, maxConsecutiveMistakes: 3, passScore: 80, centsTolerance: 25, strictCents: undefined };
    case 'pro':
      return { ...ex, octaveFree: true, maxConsecutiveMistakes: 3, passScore: 85, centsTolerance: 15, strictCents: 15 };
  }
}
