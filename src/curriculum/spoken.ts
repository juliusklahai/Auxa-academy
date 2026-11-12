// Every line the voice coach says, in one place, so each can be recorded ahead of time with a natural
// voice (scripts/voice). Lines not recorded fall back to the device's own speech.
import type { DrillSpec, Exercise, Lesson } from '../core/types';
import { NARRATION } from './narration';

export const hubLine = (l: Lesson) => `${l.title}. ${l.summary}`;
export const stepLine = (l: Lesson, i: number) => NARRATION[`${l.id}#${i}`] ?? `${l.teach[i].title}. ${l.teach[i].body.replace(/\n+/g, ' ')}`;
export const exerciseLine = (e: Exercise) => `${e.title}. ${e.objective} ${e.byEar ? 'Press listen first.' : e.drill ? 'Listen, then answer.' : 'Press start when you are ready.'}`;
export const RESULT_LINES = {
  passedMore: 'Well done! You passed. On to the next one when you are ready.',
  passedLast: 'Well done! You passed every exercise in this lesson.',
  tryAgain: 'Good try. Slow down a little, and try again.',
} as const;
export const DRILL_LINES: Record<DrillSpec['kind'], string> = {
  tonic: 'Listen to the tune. Then play the note that feels like home.',
  degree: 'First you hear the key. Then one note. Which note of the scale is it?',
  interval: 'Listen to the two notes. How far apart are they?',
  quality: 'Listen to the chord. What kind of chord is it?',
  progression: 'First you hear the home chord. Then four chords. Name each one.',
  bass: 'First you hear the home chord. Then four chords. Play the lowest note of each one.',
  count: 'Four clicks, then a rhythm. Pick the words that fit, and say them out loud.',
  tempo: 'Listen to how fast it goes. Which tempo word fits?',
  meter: 'Find the strong beat, then count to the next one. Which time signature is it?',
  roadmap: 'Follow the signs like a road map. In what order do you play the bars?',
  notename: 'Look at the note. Find a landmark note, count the steps, and pick its name.',
  keysig: 'Look at the sharps or flats at the start. Which major key is it?',
};

/** All lines, for the recording script. */
export function allLines(lessons: Lesson[]): string[] {
  const out = new Set<string>();
  for (const l of lessons) {
    out.add(hubLine(l));
    l.teach.forEach((_, i) => out.add(stepLine(l, i)));
    l.exercises.forEach((e) => out.add(exerciseLine(e)));
  }
  Object.values(RESULT_LINES).forEach((x) => out.add(x));
  Object.values(DRILL_LINES).forEach((x) => out.add(x));
  out.add('Hello! I am your Auxa coach.');
  return [...out];
}
