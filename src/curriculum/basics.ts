// Foundations the method books teach that we were rushing: getting set at the piano, counting out loud,
// tempo words, sixteenths, triplets, compound time, and reading a score's road map. Our own wording and
// melodies throughout (concepts only, nothing copied).
import type { Clef, DrillSpec, Exercise, ScoreEvent, SkillId } from '../core/types';
import { hands, seqOf, type LessonDef } from './levels';

function ex(id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[], skills: SkillId[], opts: Partial<Exercise> = {}): Exercise {
  return { id, title, objective, clef, mode, events, skills, tempo: 66, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], ...opts };
}
const drill = (id: string, title: string, objective: string, spec: DrillSpec, skills: SkillId[] = ['rhythm']): Exercise =>
  ex(id, title, objective, 'treble', 'wait', [], skills, { drill: spec, passScore: 80 });
const t = (title: string, body: string, show?: number[], play?: number[]) => ({ title, body, show, play, sequential: true });

/** Level 0, first lesson: sit, shape, arm weight, and make music straight away on the black keys. */
export const SETUP_LESSON: LessonDef = {
  id: 'L0-0', level: 0, title: 'Get set: posture, hands and your first music', prerequisites: [],
  summary: 'Sit well, shape your hands, play with arm weight, and make music on the black keys from day one.',
  teach: [
    t('Your setup checklist', 'Bench: sit on the front half, facing the middle of the keyboard. Height: forearms level with the keys, elbows a little in front of you. Distance: knuckles can reach the black keys with arms gently bent. Feet flat on the floor. Shoulders down, back tall, breathe.'),
    t('Hand shape', 'Let your arms hang, then lift your hands to the keys without changing their shape. That relaxed curve is your piano hand: rounded fingers, knuckles up, wrist level, the thumb resting on its side corner. Play on the fingertips.'),
    t('Arm weight, not finger push', 'Support finger 3 with your thumb behind its first joint. Let the weight of your whole arm drop into one black key, then let the wrist float back up. Drop, release. A full sound comes from weight, never from pressing hard.', [61, 63], [61, 63]),
    t('High and low, and make it yours', 'Black keys sound good in any order, so you can make music right now. Low keys sound like a bear, high keys like a bird. Play low, then high, slowly and evenly, and listen to the difference.', [37, 39, 85, 87], [37, 39, 85, 87]),
  ],
  exercises: [
    ex('L0-0-a', 'Drop and release', 'Finger 3 (supported by the thumb) drops arm weight into the two black keys, each hand in turn.', 'treble', 'wait',
      hands('R:2 C#4:1 D#4:1 R:2 C#4:1 D#4:1', 'C#3:1 D#3:1 R:2 C#3:1 D#3:1 R:2'), ['fingerTechnique', 'keyboardGeography'], { grand: true }),
    ex('L0-0-b', 'Way down low, way up high', 'Two black keys low with the left hand, then high with the right.', 'treble', 'wait',
      hands('R:4 C#6:1 D#6:1 C#6:1 D#6:1', 'C#2:1 D#2:1 C#2:1 D#2:1 R:4'), ['keyboardGeography'], { grand: true, hideLabels: true }),
  ],
  playAlong: { keys: [61, 63, 66, 68, 70], hand: 'RH', styles: ['echo', 'call'], skills: ['keyboardGeography'] },
};

/** Level 1: count out loud with syllables, and the Italian tempo words. */
export const COUNT_LESSON: LessonDef = {
  id: 'L1-6', level: 1, title: 'Count out loud: ta, ta-a and tempo words', prerequisites: ['L1-2'],
  summary: 'Say rhythms as you play them, and learn the words that tell you how fast to go.',
  teach: [
    t('Rhythm has words', 'Say rhythms out loud and your hands follow. A quarter note is "ta" (one beat). A half note is "ta-a" (two beats). A dotted half is "ta-a-a" (three). A whole note is "ta-a-a-a" (four). A quarter rest is a silent "sh".'),
    t('Count the bar too', 'Numbers keep your place: "1 2 3 4" in every bar of four-four. Clap and say "ta ta ta-a" while you count "1 2 3-4". If the words and the counting line up, the rhythm is right.'),
    t('How fast? Tempo words', 'Tempo words are Italian. Adagio: slow and at ease. Andante: walking speed. Moderato: medium. Allegro: quick and bright. Presto: very fast. The number after them (like 84) is beats per minute.'),
  ],
  exercises: [
    drill('L1-6-a', 'Say the rhythm', 'Hear four beats and pick the syllables that match.', { kind: 'count', pool: ['ta', 'ta-a', 'ta-a-a', 'sh'], rounds: 6 }),
    ex('L1-6-b', 'Play and say it', 'Play while saying "ta ta ta-a, ta-a ta-a, ta sh ta sh, ta-a-a-a".', 'treble', 'timed',
      seqOf('C4:1 D4:1 E4:2 F4:2 E4:2 D4:1 R:1 D4:1 R:1 C4:4', 'RH', [1, 2, 3, 4, 3, 2, 2, 2, 2, 1]), ['rhythm', 'pulse'], { tempo: 72 }),
    drill('L1-6-c', 'Name the tempo', 'Listen to the speed and pick the tempo word.', { kind: 'tempo', pool: ['Adagio', 'Andante', 'Allegro', 'Presto'], rounds: 6 }, ['pulse']),
  ],
  playAlong: { keys: [60, 62, 64, 65, 67], hand: 'RH', styles: ['tempo', 'tempo'], skills: ['rhythm', 'pulse'] },
};

/** Level 4: the rest of the rhythm toolkit, and the road map of a score. */
export const RHYTHM_LESSONS: LessonDef[] = [
  {
    id: 'L4-6', level: 4, title: 'Sixteenth notes', prerequisites: ['L4-1'],
    summary: 'Four notes in a beat, and the gallop rhythms they make.',
    teach: [
      t('Four to a beat', 'Two beams make a sixteenth note: four of them fill one beat. Say "ti-ka-ti-ka", or count "1 e and a, 2 e and a". Keep them even, like rain on a roof.'),
      t('Gallops', 'Mix one eighth and two sixteenths and you get a gallop: "ti-tika" (long short short) or "tika-ti" (short short long). Say it before you play it.'),
    ],
    exercises: [
      drill('L4-6-a', 'Hear the sixteenths', 'Pick the syllables for the rhythm you hear.', { kind: 'count', pool: ['ta', 'ti-ti', 'ti-ka-ti-ka', 'ti-tika', 'tika-ti'], rounds: 6 }),
      ex('L4-6-b', 'Ti-ka-ti-ka', 'Quarter, then four even sixteenths on each step.', 'treble', 'timed',
        seqOf('C4:1 D4:0.25 D4:0.25 D4:0.25 D4:0.25 E4:1 F4:0.25 E4:0.25 D4:0.25 C4:0.25 D4:1 E4:0.25 F4:0.25 G4:0.25 F4:0.25 E4:1 C4:2', 'RH'), ['rhythm'], { tempo: 56 }),
      ex('L4-6-c', 'The gallop', 'Ti-tika and tika-ti: long short short, short short long.', 'treble', 'timed',
        seqOf('C4:0.5 E4:0.25 E4:0.25 G4:0.5 E4:0.25 E4:0.25 C4:0.25 C4:0.25 E4:0.5 G4:0.25 G4:0.25 E4:0.5 C4:2', 'RH'), ['rhythm'], { tempo: 60 }),
    ],
  },
  {
    id: 'L4-7', level: 4, title: 'Triplets', prerequisites: ['L4-1'],
    summary: 'Three notes in the time of two: the lilt of blues, gospel and ballads.',
    teach: [
      t('Three in the space of two', 'A small 3 over three notes makes a triplet: three equal notes in one beat, where two eighths would normally go. Say "tri-po-let" on each beat, smooth and round.'),
      t('Twos against threes', 'Switching between "ti-ti" and "tri-po-let" is the skill. Count the beat in your head and only change how you split it. The beat itself never moves.'),
    ],
    exercises: [
      drill('L4-7-a', 'Two or three?', 'Hear each beat split in two or in three, and pick the words.', { kind: 'count', pool: ['ta', 'ti-ti', 'tri-po-let'], rounds: 6 }),
      ex('L4-7-b', 'Triplet arpeggios', 'C E G as triplets, a quarter note on each landing.', 'treble', 'timed',
        seqOf('C4:1/3 E4:1/3 G4:1/3 C5:1 G4:1/3 E4:1/3 C4:1/3 G4:1 C4:1/3 E4:1/3 G4:1/3 E4:1/3 G4:1/3 C5:1/3 C5:2', 'RH'), ['rhythm'], { tempo: 60 }),
      ex('L4-7-c', 'Ti-ti, tri-po-let', 'Eighths then triplets, steady beat.', 'treble', 'timed',
        seqOf('C4:0.5 D4:0.5 E4:1/3 F4:1/3 E4:1/3 D4:0.5 E4:0.5 F4:1/3 G4:1/3 F4:1/3 E4:0.5 D4:0.5 C4:1/3 D4:1/3 E4:1/3 C4:2', 'RH'), ['rhythm'], { tempo: 58 }),
    ],
  },
  {
    id: 'L4-8', level: 4, title: 'Two-four, six-eight and cut time', prerequisites: ['L4-4'],
    summary: 'Marches, lilting six-eight, and counting in two.',
    teach: [
      t('Two-four', 'Two quarter beats in a bar: STRONG weak, STRONG weak. Marches and many folk songs live here. Count "1 2, 1 2".'),
      t('Six-eight', 'Six eighth notes in a bar, felt as two big beats, each split in three: "ONE-and-a TWO-and-a". Count all six slowly at first: "1 2 3 4 5 6", leaning on 1 and 4. The metronome clicks each eighth.'),
      t('Cut time', 'A C with a line through it is cut time (two-two): the half note gets the beat, so a bar of four quarters is felt in two. It looks like four-four but swings along twice as broad.'),
    ],
    exercises: [
      drill('L4-8-a', 'Which time is it?', 'Hear the strong beats and name the time signature.', { kind: 'meter', pool: ['2/4', '3/4', '4/4', '6/8'], rounds: 6 }, ['pulse']),
      ex('L4-8-b', 'A march in two-four', 'STRONG weak, crisp and even.', 'treble', 'timed',
        seqOf('C4:0.5 E4:0.5 G4:0.5 G4:0.5 A4:0.5 G4:0.5 E4:1 F4:0.5 D4:0.5 E4:0.5 C4:0.5 D4:1 C4:1', 'RH'), ['rhythm', 'pulse'], { tempo: 76, timeSig: [2, 4] }),
      ex('L4-8-c', 'Row along in six-eight', 'Feel two big beats: long-short, long-short.', 'treble', 'timed',
        seqOf('C4:1 C4:0.5 C4:1 D4:0.5 E4:1 D4:0.5 E4:1 F4:0.5 G4:3 E4:1 E4:0.5 D4:1 D4:0.5 C4:3', 'RH'), ['rhythm', 'pulse'], { tempo: 50, timeSig: [6, 8] }),
      ex('L4-8-d', 'Cut time', 'Four quarters to a bar, felt in two.', 'treble', 'timed',
        seqOf('E4:1 G4:1 C5:2 B4:1 A4:1 G4:2 F4:1 E4:1 D4:1 F4:1 E4:4', 'RH'), ['rhythm', 'pulse'], { tempo: 96, timeSig: [2, 2] }),
    ],
  },
  {
    id: 'L4-9', level: 4, title: 'The road map: repeats, endings, D.C. and D.S.', prerequisites: ['L4-3'],
    summary: 'Follow the signs that send you back and forward through a piece.',
    teach: [
      t('Repeat signs', 'Two dots beside a thick double bar mean "go back". Play to the end sign ( :| ), return to the facing sign ( |: ) or to the start if there is none, and play that part again.'),
      t('First and second endings', 'A bracket marked 1 is the first ending: play it the first time. On the repeat, jump over it and play the bracket marked 2.'),
      t('D.C., D.S., Fine and Coda', 'D.C. (da capo) means go back to the beginning. D.S. (dal segno) means go back to the sign that looks like a slanted S. "Al Fine" means stop at the word Fine. "Al Coda" means play until "To Coda", then jump to the Coda at the end.'),
      t('The fermata', 'A dot under an arch (the "bird\'s eye") is a fermata: hold that note longer than its value, then carry on. In a hymn or song, everyone holds together and breathes before moving on.'),
    ],
    exercises: [
      drill('L4-9-a', 'Follow the map', 'Read the signs and choose the order the bars are played in.', { kind: 'roadmap', pool: ['0', '1', '2'], rounds: 5 }, ['noteReadingTreble']),
      drill('L4-9-b', 'D.C. and D.S.', 'Longer maps with D.C. al Fine, D.S. al Coda and repeats.', { kind: 'roadmap', pool: ['2', '3', '4'], rounds: 5 }, ['noteReadingTreble']),
    ],
  },
];
