// Levels 10 to 12: playing by ear, jazz, and four-part writing and arranging.
// These levels teach methods, not just pieces: how to work out any song you hear, how jazz pianists build
// and move chords, and the rules arrangers use to write for voices. Each lesson explains a technique,
// lets you hear it (often the wrong way next to the right way), then drills it.

import { nameToMidi } from '../core/music';
import type { Clef, DrillSpec, Exercise, Hand, ScoreEvent, SkillId, TeachStep } from '../core/types';
import { hands, seqOf, type LessonDef } from './levels';

/** "C3+G3+E4+C5 F3+A3+F4+C5" -> chords for listening */
const C = (s: string) => s.trim().split(/\s+/).map((ch) => (ch === 'R' ? [] : ch.split('+').map(nameToMidi)));

interface StepOpts { tips?: string[]; seq?: number[][]; seqBeats?: number; compare?: { label: string; seq: number[][] }[]; show?: number[] }
const step = (title: string, body: string, o: StepOpts = {}): TeachStep => ({ title, body, ...o });

function ex(id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[], skills: SkillId[], opts: Partial<Exercise> = {}): Exercise {
  return { id, title, objective, clef, mode, events, skills, tempo: 72, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], ...opts };
}
function drill(id: string, title: string, objective: string, spec: DrillSpec): Exercise {
  return ex(id, title, objective, 'treble', 'wait', [], ['pitchAccuracy'], { drill: spec, passScore: 80 });
}

/**
 * Four-part chords. Each token is "bass+tenor+alto+soprano[:beats]". Left hand plays bass and tenor, right
 * hand alto and soprano. `hide` lists the voices you must work out yourself (hidden until you play them).
 */
function satb(spec: string, hide: ('S' | 'A' | 'T' | 'B')[] = []): ScoreEvent[] {
  let beat = 0;
  return spec.trim().split(/\s+/).map((tok) => {
    const [ch, b] = tok.split(':');
    const beats = parseFloat(b ?? '4');
    const [B, T, A, S] = ch.split('+').map(nameToMidi);
    const ps = [B, T, A, S];
    const hidden = hide.map((v) => ({ B, T, A, S })[v]);
    const ev: ScoreEvent = { pitches: ps, hands: ['LH', 'LH', 'RH', 'RH'] as Hand[], beat, beats, handBeats: { LH: beats, RH: beats }, ...(hidden.length ? { hidden } : {}) };
    beat += beats;
    return ev;
  });
}

// Common progressions in C, four-part, with smooth voice leading
const I = 'C3+G3+E4+C5', IV = 'F3+A3+F4+C5', V = 'G2+G3+D4+B4', V7 = 'G2+G3+F4+B4', vi = 'A2+A3+E4+C5', ii = 'D3+A3+F4+D5';
const ctxC = C('C3+E4+G4+C5 F3+F4+A4+C5 G2+D4+G4+B4 C3+E4+G4+C5');
const ctxIn = (k: string) => {
  const t = nameToMidi(k);
  return [[t - 12, t + 4, t + 7, t + 12], [t - 7, t + 5, t + 9, t + 12], [t - 5, t + 2, t + 7, t + 11], [t - 12, t + 4, t + 7, t + 12]];
};
const KEYS_EASY = [60, 65, 67, 62, 57];
const KEYS_ALL = [60, 62, 64, 65, 67, 57, 59, 58, 63, 56, 61, 54];

export const ADVANCED_LESSONS: LessonDef[] = [
  // =====================================================================================
  // LEVEL 10 · PLAYING BY EAR
  // =====================================================================================
  {
    id: 'E10-1', level: 10, title: 'How playing by ear works', prerequisites: ['L2-1'],
    summary: 'The method musicians use to work out any song: home note, bass, chords, melody.',
    teach: [
      step('You hear patterns, not letter names', 'Nobody hears "that was an E". Trained ears hear relationships: "that note is the third of the key", "that chord is the four chord". A song is a pattern of numbers sitting on top of a home note.\n\nThis is why the same tune sounds the same in any key, and why ear players can switch keys easily. Learn the patterns once and they work everywhere.', {
        seq: C('C4 E4 G4 E4 C4 F4 A4 C5 A4 F4'), tips: ['Same tune, different start note: same pattern, same song.', 'Your job is to learn what each number sounds like.'],
      }),
      step('The five-step method for any song', 'Work in layers, from the most stable to the most detailed. Each layer makes the next one easier.', {
        tips: [
          '1. Find home: the note (and chord) the song rests on.',
          '2. Find the bass: hum the lowest line and match it on the keys.',
          '3. Name the chords: each bass note usually gives the chord root. Is it major or minor?',
          '4. Find the melody: start on a note you are sure of, then follow up/down and step/leap.',
          '5. Simplify and play: melody in the right hand, chord roots or shapes in the left.',
        ],
      }),
      step('Work in short loops', 'Never try to work out a whole song at once. Take one line (about 4 seconds), loop it, and sing it back before touching the keys. If you cannot sing it, you cannot find it yet.\n\nSlow it down if you need to (most video players and music apps can play at 0.75 speed without changing pitch).', {
        tips: ['Loop 2 to 4 bars.', 'Sing or hum it back first.', 'Only then search on the keys.', 'Wrong keys are useful: they tell you higher or lower.'],
      }),
      step('Train the ear every day', 'Ear skills grow like muscles: little and often. Ten minutes a day of the drills in this level does more than an hour once a week. Each drill trains one of the five steps.', {
        tips: ['Home-note drill (step 1)', 'Scale-degree drill (step 4)', 'Bass and chord drills (steps 2 and 3)', 'Interval drill (step 4, leaps)'],
      }),
    ],
    exercises: [
      drill('E10-1-a', 'Where is home?', 'Hear a short tune in a random key and play its home note.', { kind: 'tonic', pool: [], keys: KEYS_EASY, rounds: 8 }),
      drill('E10-1-b', 'Do, mi, sol', 'Hear the key, then one note: is it 1, 3 or 5?', { kind: 'degree', pool: ['1', '3', '5'], keys: KEYS_EASY, rounds: 10 }),
    ],
  },
  {
    id: 'E10-2', level: 10, title: 'Find the key of any song', prerequisites: ['E10-1'],
    summary: 'Find the home note, decide major or minor, and work out which notes the song uses.',
    teach: [
      step('Home is where the song rests', 'Listen to where lines end, especially the very last note and chord. That resting point is the tonic (home). Hum it. Then find it: play notes on the piano along with the song until one sounds completely settled at the end of a phrase.', {
        seq: C('E4 D4 C4 D4 E4 E4 E4 D4 D4 E4 D4 C4'), tips: ['The last note of the chorus is usually home.', 'Hold your candidate note under the song: home never clashes at phrase ends.'],
      }),
      step('Major or minor?', 'Once you have home, sing up from it: do, re, mi. If the third note sounds bright (4 half steps up), the song is major. If it sounds darker (3 half steps), it is minor. Many sad-sounding pop songs are major songs that sit on the vi chord, so trust the ending, not the mood.', {
        compare: [{ label: 'Major (C E G)', seq: C('C3+C4+E4+G4 C4 D4 E4') }, { label: 'Minor (C Eb G)', seq: C('C3+C4+Eb4+G4 C4 D4 Eb4') }],
      }),
      step('Which notes belong', 'A key gives you 7 notes. Once you know home and major/minor, you know them all: C major is all white keys, G major has F sharp, F major has B flat. Melodies and chords mostly use these 7, so your search shrinks from 12 notes to 7.', {
        tips: ['Major scale pattern: whole whole half, whole whole whole half.', 'Natural minor: whole half whole, whole half whole whole.', 'If a note keeps clashing, try its black-key neighbor.'],
        seq: C('C4 D4 E4 F4 G4 A4 B4 C5'),
      }),
      step('Easy keys for working things out', 'You can always work a song out in an easy key (C, G, F, A minor) and move it later. Singers often do this: find it in C, then transpose to fit the voice. The numbers stay the same.'),
    ],
    exercises: [
      drill('E10-2-a', 'Find home in any key', 'Hear a tune and play its home note. Keys change every round.', { kind: 'tonic', pool: [], keys: KEYS_ALL, rounds: 10 }),
      drill('E10-2-b', 'Major or minor chord', 'Bright or dark? Train the difference that decides the key.', { kind: 'quality', pool: ['maj', 'min'], keys: KEYS_EASY, rounds: 10 }),
      drill('E10-2-c', 'Major or minor third', 'Hear the key, then the third. Is it mi (major) or me (minor)?', { kind: 'degree', pool: ['1', 'b3', '3', '5'], keys: KEYS_EASY, rounds: 10 }),
    ],
  },
  {
    id: 'E10-3', level: 10, title: 'The sound of each scale degree', prerequisites: ['E10-2'],
    summary: 'Functional ear training: every note in a key has its own pull. Learn to feel it.',
    teach: [
      step('Every note has a job', 'In a key, each note feels different because of where it wants to go. 1, 3 and 5 feel stable (they belong to the home chord). The others lean towards them. This pull is what you learn to hear.', {
        tips: ['1 do: home, finished', '2 re: falls to do', '3 mi: bright, calm', '4 fa: leans down to mi', '5 sol: strong, open', '6 la: sweet, leans to sol', '7 ti: tense, pulls up to do'],
        seq: C('C3+E4+G4+C5 C4 D4 E4 F4 G4 A4 B4 C5'), seqBeats: 1,
      }),
      step('Resolve it home', 'When you are unsure, sing from the mystery note back to do by the shortest path. A note that walks home in two steps up (7 to 1, or 6 7 1) is in the top half; one that walks down (4 3 2 1) is in the bottom half. The drill plays this resolution after each answer.', {
        compare: [{ label: '7 resolves up', seq: C('C3+E4+G4+C5 B4 C5') }, { label: '4 resolves down', seq: C('C3+E4+G4+C5 F4 E4 D4 C4') }, { label: '6 to home', seq: C('C3+E4+G4+C5 A4 B4 C5') }],
      }),
      step('Hear the key first', 'A note on its own means nothing. Always set the key in your ear first: play or imagine the I IV V I cadence, then the note. Do this before every song you work out.', { seq: ctxC }),
      step('Map them to songs', 'Anchor degrees with tunes you know. "Do re mi" (1 2 3). The NBC chime (5 3 1, going down... sol mi do). Twinkle starts 1 1 5 5. Silent Night starts on 5. Amazing Grace starts 5 1.'),
    ],
    exercises: [
      drill('E10-3-a', 'Degrees 1 to 5', 'Hear the key, then a note from do to sol.', { kind: 'degree', pool: ['1', '2', '3', '4', '5'], keys: KEYS_EASY, rounds: 10 }),
      drill('E10-3-b', 'All seven degrees', 'The full major scale. Listen for the pull.', { kind: 'degree', pool: ['1', '2', '3', '4', '5', '6', '7'], keys: KEYS_EASY, rounds: 12 }),
      drill('E10-3-c', 'Degrees in any key', 'Same skill, keys all over the keyboard.', { kind: 'degree', pool: ['1', '2', '3', '4', '5', '6', '7'], keys: KEYS_ALL, rounds: 12 }),
    ],
  },
  {
    id: 'E10-4', level: 10, title: 'Melodies: contour and intervals', prerequisites: ['E10-3'],
    summary: 'Follow a tune note to note: direction, step or leap, and how far.',
    teach: [
      step('Draw the shape first', 'Before finding notes, sketch the melody\'s shape in the air with your hand: up, down, same. Most melodies move by step (next scale note) and leap only now and then. A leap is usually followed by a step back.', {
        seq: C('C4 D4 E4 G4 E4 D4 C4'), tips: ['Steps: neighbor notes in the key.', 'Leaps: skip one or more notes.', 'After a big leap, melodies usually turn back.'],
      }),
      step('Name the leap with a song', 'Each interval has a sound you can tie to a famous opening. When you hear a leap, test it against your reference songs.', {
        tips: ['Major 2nd: Happy Birthday', 'Major 3rd: When the Saints', 'Perfect 4th: Here Comes the Bride', 'Perfect 5th: Twinkle Twinkle', 'Major 6th: My Bonnie', 'Octave: Somewhere Over the Rainbow'],
        compare: [{ label: '4th', seq: C('C4 F4') }, { label: '5th', seq: C('C4 G4') }, { label: '6th', seq: C('C4 A4') }, { label: 'Octave', seq: C('C4 C5') }],
      }),
      step('Anchor on a sure note', 'Find one note you are certain of (often the first note or the home note) and work outwards from it. Check each new note against the key: if it is not one of the 7 key notes, it is probably one of its neighbors.'),
      step('Try it: Amazing Grace', 'This tune starts on sol (5) and leaps up a 4th to do (1). Listen, then work out the first line by ear in the exercises. Key of C, in 3/4 time.', { seq: C('G3 C4 E4 C4 E4 D4 C4 A3 G3'), seqBeats: 1 }),
    ],
    exercises: [
      drill('E10-4-a', 'Steps and small leaps', 'Name the interval: 2nds, 3rds and the 5th.', { kind: 'interval', pool: ['M2', 'm3', 'M3', 'P5'], style: 'up', keys: KEYS_EASY, rounds: 10 }),
      drill('E10-4-b', 'Big leaps', '4ths, 5ths, 6ths and the octave, up and down.', { kind: 'interval', pool: ['P4', 'P5', 'M6', 'P8'], style: 'mixed', keys: KEYS_EASY, rounds: 10 }),
      ex('E10-4-c', 'Amazing Grace, line 1', 'Hear the key, then the tune. Find it on the keys. It starts on G.', 'treble', 'wait', seqOf('R:2 G3:1 C4:2 E4:0.5 C4:0.5 E4:2 D4:1 C4:2 A3:1 G3:3', 'RH'), ['pitchAccuracy'], { byEar: true, hideLabels: true, context: ctxC, timeSig: [3, 4] }),
      ex('E10-4-d', 'When the Saints, line 1', 'Hear the key, then the tune. It starts on C.', 'treble', 'wait', seqOf('R:1 C4:1 E4:1 F4:1 G4:4 R:1 C4:1 E4:1 F4:1 G4:4', 'RH'), ['pitchAccuracy'], { byEar: true, hideLabels: true, context: ctxC }),
    ],
  },
  {
    id: 'E10-5', level: 10, title: 'Hear the bass, find the chords', prerequisites: ['E10-4'],
    summary: 'The bass line tells you the chords. Hum it, find it, then decide major or minor.',
    teach: [
      step('The bass is the key to the chords', 'In most songs the bass plays the root of each chord on the first beat. Find the bass note and you know the chord\'s name. Hum the lowest thing you hear, even if it is quiet. Headphones help.', {
        seq: C('C2+C3+E4+G4 F2+F3+A4+C5 G2+G3+B4+D5 C2+C3+E4+G4'),
      }),
      step('The chords that live in a key', 'Build a triad on each scale note and you get the key\'s chords. In a major key: I, IV, V are major; ii, iii, vi are minor; vii° is diminished. So once you have the bass note, you usually already know if the chord is major or minor.', {
        tips: ['C major: C  Dm  Em  F  G  Am  B°', 'G major: G  Am  Bm  C  D  Em  F#°', 'Pop songs live mostly on I, IV, V and vi.'],
        seq: C('C3+E3+G3 D3+F3+A3 E3+G3+B3 F3+A3+C4 G3+B3+D4 A3+C4+E4 B3+D4+F4 C4+E4+G4'), seqBeats: 1,
      }),
      step('How the bass moves', 'Bass lines move in a few typical ways: by step (C D E), by 4th or 5th (C to F, C to G: the strongest pull), or by repeating. A bass that falls a 5th (G to C) almost always means V to I, a cadence.', {
        compare: [{ label: 'Up a 4th (I to IV)', seq: C('C3 F3') }, { label: 'Down a 5th (V to I)', seq: C('G3 C3') }, { label: 'Down a 3rd (I to vi)', seq: C('C3 A2') }],
      }),
      step('When the bass is not the root', 'Sometimes the bass plays another chord note (an inversion), like a descending line C, B, A, G under C, G, Am, Em. If a chord sounds right but the bass sounds odd, try a chord whose 3rd or 5th is the bass note.'),
    ],
    exercises: [
      drill('E10-5-a', 'Bass of I, IV, V', 'Hear the home chord, then four chords. Play each bass note.', { kind: 'bass', pool: ['I-IV-V-I', 'I-V-IV-I', 'I-IV-I-V', 'IV-V-I-I'], keys: [60, 65, 67], rounds: 6 }),
      drill('E10-5-b', 'Bass with the vi chord', 'Now with the minor vi chord in the mix.', { kind: 'bass', pool: ['I-V-vi-IV', 'I-vi-IV-V', 'vi-IV-I-V', 'I-IV-vi-V'], keys: [60, 65, 67, 62], rounds: 6 }),
    ],
  },
  {
    id: 'E10-6', level: 10, title: 'Progressions you hear everywhere', prerequisites: ['E10-5'],
    summary: 'Recognize the handful of chord patterns behind most songs.',
    teach: [
      step('Four chords, thousands of songs', 'A few progressions cover a huge share of popular music. Learn their sound and you will often recognize a song\'s chords after one listen.', {
        tips: ['I – V – vi – IV: the modern pop progression', 'I – vi – IV – V: 1950s doo-wop', 'vi – IV – I – V: the same chords starting on the sad one', 'I – IV – V – I: hymns, folk, country, rock and roll', 'ii – V – I: jazz and gospel'],
        seq: C('C3+E4+G4+C5 G2+D4+G4+B4 A2+E4+A4+C5 F2+F4+A4+C5'),
      }),
      step('Hear each chord\'s character', 'Each chord function has a feeling: I is rest, IV is a lift away from home, V is tension that wants to come home, vi is the sad cousin of I (they share two notes), ii prepares V.', {
        compare: [{ label: 'I - IV - I (lift)', seq: C('C3+E4+G4+C5 F3+F4+A4+C5 C3+E4+G4+C5') }, { label: 'I - V - I (tension)', seq: C('C3+E4+G4+C5 G2+D4+G4+B4 C3+E4+G4+C5') }, { label: 'I - vi (shadow)', seq: C('C3+E4+G4+C5 A2+E4+A4+C5') }],
      }),
      step('Count in numbers, not names', 'Write chords as numbers (the Nashville number system). "1 5 6 4" works in every key: in G it is G D Em C; in D it is D A Bm G. Session players chart whole songs this way.', {
        tips: ['Major chords: plain numbers (1 4 5).', 'Minor chords: add a dash or m (6-, 2m).', 'In G: 1 = G, 4 = C, 5 = D, 6m = Em.'],
      }),
    ],
    exercises: [
      drill('E10-6-a', 'Name the chords', 'Four chords after the home chord. Name each one: I, IV, V or vi.', { kind: 'progression', pool: ['I-V-vi-IV', 'I-vi-IV-V', 'I-IV-V-I', 'vi-IV-I-V'], keys: [60, 67, 65], rounds: 8 }),
      drill('E10-6-b', 'Add the ii chord', 'Now ii joins in (the chord before V).', { kind: 'progression', pool: ['I-vi-ii-V', 'I-ii-V-I', 'I-IV-ii-V', 'ii-V-I-I', 'I-V-vi-IV'], keys: [60, 67, 65, 62], rounds: 8 }),
      drill('E10-6-c', 'Major, minor, diminished', 'The three chord types inside a key.', { kind: 'quality', pool: ['maj', 'min', 'dim'], keys: KEYS_EASY, rounds: 10 }),
    ],
  },
  {
    id: 'E10-7', level: 10, title: 'Work out a whole song', prerequisites: ['E10-6'],
    summary: 'Put the method together on Amazing Grace: key, bass, chords, melody, both hands.',
    teach: [
      step('Step 1: key', 'Amazing Grace (here in C) ends on C with a C major chord. Home is C, major. Time: it sways in threes (3/4).', { seq: C('C3+E4+G4+C5') }),
      step('Step 2: bass', 'Hum the bass: it sits on C, moves to F, back to C, then to G at the end of the second line. Mostly C (I), F (IV) and G (V).', { seq: C('C3 C3 F3 C3 C3 C3 G3 G3'), seqBeats: 3 }),
      step('Step 3: chords', 'Bass C = C major (I), F = F major (IV), G = G major (V). A typical chart: | C | C | F | C | C | C | G | G | C | C | F | C | C | G | C | C |', {
        seq: C('C3+E4+G4+C5 F3+F4+A4+C5 C3+E4+G4+C5 G2+D4+G4+B4'), seqBeats: 3,
      }),
      step('Step 4: melody', 'It starts on G (sol) and leaps a 4th up to C. Then it climbs to E, steps down through D to C, dips to A and lands on G. Check each note against the chord under it: long notes are usually chord notes.', { seq: C('G3 C4 E4 C4 E4 D4 C4 A3 G3'), seqBeats: 1 }),
      step('Step 5: play it', 'Right hand plays the melody, left hand plays the root (or the chord) on the first beat of each bar. That is a complete arrangement you worked out by ear.'),
    ],
    exercises: [
      ex('E10-7-a', 'Find the bass by ear', 'Hear the key, then the bass line of the first two lines. Play it back.', 'bass', 'wait', seqOf('C3:3 C3:3 F3:3 C3:3 C3:3 C3:3 G2:3 G2:3', 'LH'), ['pitchAccuracy', 'noteReadingBass'], { byEar: true, hideLabels: true, context: ctxC, timeSig: [3, 4] }),
      ex('E10-7-b', 'Find line 2 by ear', 'The second line ends higher, on D. Starts on G.', 'treble', 'wait', seqOf('R:2 G3:1 C4:2 E4:0.5 C4:0.5 E4:2 D4:1 G4:3 R:2 E4:1', 'RH'), ['pitchAccuracy'], { byEar: true, hideLabels: true, context: ctxC, timeSig: [3, 4] }),
      ex('E10-7-c', 'Both hands', 'Melody plus the roots you found.', 'treble', 'wait', hands('R:2 G3:1 C4:2 E4:0.5 C4:0.5 E4:2 D4:1 C4:2 A3:1 G3:3', 'R:3 C3:3 C3:3 F3:3 C3:3'), ['pitchAccuracy', 'fingerTechnique'], { grand: true, timeSig: [3, 4] }),
    ],
  },
  {
    id: 'E10-8', level: 10, title: 'Any song, any key', prerequisites: ['E10-7'],
    summary: 'Because you think in numbers, you can play what you hear in any key.',
    teach: [
      step('Numbers travel', 'You heard When the Saints as 1 3 4 5. In F that is F A Bb C; in G it is G B C D. Find the new home, then follow the same numbers.', {
        compare: [{ label: 'In C', seq: C('C4 E4 F4 G4') }, { label: 'In F', seq: C('F4 A4 Bb4 C5') }, { label: 'In G', seq: C('G4 B4 C5 D5') }],
      }),
      step('Find the singer\'s key', 'To accompany someone, ask them to sing the first line. Find the last note of the line (often home) on the piano, check it with a chord, and you are in their key. Then use your numbers.'),
      step('Ear-player habits', 'Play along with recordings every day, even just the bass notes. Start with songs that have few chords. Keep a notebook of progressions you discover in numbers. Over time you will recognize patterns instantly.'),
    ],
    exercises: [
      ex('E10-8-a', 'Saints in F', 'Hear the key of F, then the tune. Find it starting on F.', 'treble', 'wait', seqOf('R:1 F4:1 A4:1 Bb4:1 C5:4 R:1 F4:1 A4:1 Bb4:1 C5:4', 'RH'), ['pitchAccuracy'], { byEar: true, hideLabels: true, context: ctxIn('F4'), flats: true }),
      ex('E10-8-b', 'Saints in G', 'Same tune in G. Starts on G.', 'treble', 'wait', seqOf('R:1 G4:1 B4:1 C5:1 D5:4 R:1 G4:1 B4:1 C5:1 D5:4', 'RH'), ['pitchAccuracy'], { byEar: true, hideLabels: true, context: ctxIn('G4') }),
      drill('E10-8-c', 'Chords in any key', 'Name the progression wherever it is played.', { kind: 'progression', pool: ['I-V-vi-IV', 'I-vi-IV-V', 'I-IV-V-I', 'vi-IV-I-V', 'I-vi-ii-V'], keys: KEYS_ALL, rounds: 8 }),
    ],
  },

  // =====================================================================================
  // LEVEL 11 · JAZZ
  // =====================================================================================
  {
    id: 'J11-1', level: 11, title: 'Jazz harmony: seventh chords', prerequisites: ['L9-3'],
    summary: 'Jazz is built on four-note chords. Learn the five types and the 7th chords of a key.',
    teach: [
      step('Add one more third', 'Stack another third on a triad and you get a 7th chord. Jazz uses 7th chords almost everywhere: they sound richer and they want to move, which keeps the music flowing.', {
        compare: [{ label: 'C triad', seq: C('C4+E4+G4') }, { label: 'Cmaj7', seq: C('C4+E4+G4+B4') }],
      }),
      step('The five types', 'Same root, five colors. Learn them by sound and by shape.', {
        tips: ['Cmaj7 (C E G B): soft, lush. Home chord.', 'C7 (C E G Bb): dominant, bluesy, wants to resolve.', 'Cm7 (C Eb G Bb): mellow minor. The ii chord.', 'Cm7b5 (C Eb Gb Bb): half-diminished. The ii of minor keys.', 'Cdim7 (C Eb Gb A): fully diminished, tense and symmetrical.'],
        seq: C('C4+E4+G4+B4 C4+E4+G4+Bb4 C4+Eb4+G4+Bb4 C4+Eb4+Gb4+Bb4 C4+Eb4+Gb4+A4'),
      }),
      step('The 7th chords of a key', 'Build 7th chords on each note of C major using only white keys: Cmaj7, Dm7, Em7, Fmaj7, G7, Am7, Bm7b5. Notice there is only one dominant 7th: G7, the V chord. That is why it pulls so strongly to C.', {
        seq: C('C3+E3+G3+B3 D3+F3+A3+C4 E3+G3+B3+D4 F3+A3+C4+E4 G3+B3+D4+F4 A3+C4+E4+G4 B3+D4+F4+A4 C4+E4+G4+B4'), seqBeats: 1,
      }),
      step('Reading chord symbols', 'Lead sheets write chords as symbols: maj7 or Δ for major 7, 7 for dominant, m7 or - for minor 7, ø or m7b5 for half-diminished, ° for diminished. Add 9, 11, 13 for extra color on top.'),
    ],
    exercises: [
      ex('J11-1-a', 'Five 7th chords on C', 'Play each type. Feel how one note changes the color.', 'treble', 'wait', seqOf('C4+E4+G4+B4:4 C4+E4+G4+Bb4:4 C4+Eb4+G4+Bb4:4 C4+Eb4+Gb4+Bb4:4 C4+Eb4+Gb4+A4:4', 'RH'), ['fingerTechnique', 'noteReadingTreble'], { flats: true }),
      ex('J11-1-b', '7th chords of C major', 'Climb the key in 7th chords, RH.', 'treble', 'wait', seqOf('C4+E4+G4+B4:2 D4+F4+A4+C5:2 E4+G4+B4+D5:2 F4+A4+C5+E5:2 G4+B4+D5+F5:2 A4+C5+E5+G5:2 B4+D5+F5+A5:2 C5+E5+G5+B5:2', 'RH'), ['fingerTechnique']),
      drill('J11-1-c', 'Hear the 7th chord type', 'maj7, m7, dominant 7 or half-diminished?', { kind: 'quality', pool: ['maj7', 'm7', '7', 'm7b5'], keys: KEYS_EASY, rounds: 12 }),
    ],
  },
  {
    id: 'J11-2', level: 11, title: 'Swing feel and jazz rhythm', prerequisites: ['J11-1'],
    summary: 'Long-short eighths, accents off the beat, and the Charleston rhythm for comping.',
    teach: [
      step('Swing eighths', 'Jazz writes plain eighths but plays them long-short, like the first and last notes of a triplet. Say "doo-ba doo-ba". Slow tempos swing harder; very fast tempos get nearly straight.', {
        compare: [{ label: 'Straight', seq: C('C4 D4 E4 F4 G4 F4 E4 D4') }, { label: 'Swung (listen in the drills)', seq: C('C4 D4 E4 F4 G4 F4 E4 D4') }], seqBeats: 0.5,
      }),
      step('Accent the off-beats', 'In swing the weight is on beats 2 and 4 (the hi-hat) and on off-beat notes (the "and"s). Ghost (play softly) some downbeats and accent the upbeat that follows. That is what makes a line bounce.', {
        tips: ['Tap your foot on 1 and 3, snap on 2 and 4.', 'Accent "and" notes, especially before a long note.', 'End phrases on an off-beat for a jazzier sound.'],
      }),
      step('The Charleston: your first comping rhythm', 'Comping (accompanying) means playing chords in short rhythmic stabs, not long blocks. The Charleston rhythm hits beat 1 and the "and" of 2. It is the most common comping pattern in early and swing jazz.', {
        seq: C('C3+E3+A3 R C3+E3+A3 R'), seqBeats: 0.75,
      }),
      step('The push (anticipation)', 'Jazz musicians often play the next chord an eighth note early, on the "and" of 4. This push makes the music lean forward. You will see it written as a tied note across the bar line.'),
    ],
    exercises: [
      ex('J11-2-a', 'Swing eighths', 'Play the line long-short. The scoring expects swung timing.', 'treble', 'timed', seqOf('C4:0.5 D4:0.5 E4:0.5 G4:0.5 A4:0.5 G4:0.5 E4:1 D4:0.5 E4:0.5 D4:0.5 C4:0.5 A3:0.5 C4:0.5 C4:1', 'RH'), ['rhythm', 'pulse'], { swing: true, tempo: 100 }),
      ex('J11-2-b', 'Charleston comping', 'C6 shell on beat 1 and the "and" of 2, every bar.', 'bass', 'timed', seqOf('C3+E3+A3:1.5 C3+E3+A3:2.5 C3+E3+A3:1.5 C3+E3+A3:2.5 F3+A3+D4:1.5 F3+A3+D4:2.5 C3+E3+A3:1.5 C3+E3+A3:2.5', 'LH'), ['rhythm'], { tempo: 92, swing: true }),
      ex('J11-2-c', 'Off-beat phrase', 'A swing phrase that starts and ends off the beat.', 'treble', 'timed', seqOf('R:0.5 E4:0.5 G4:0.5 A4:0.5 C5:1 A4:0.5 G4:0.5 R:0.5 E4:0.5 D4:0.5 C4:0.5 D4:0.5 E4:1.5', 'RH'), ['rhythm'], { swing: true, tempo: 96 }),
    ],
  },
  {
    id: 'J11-3', level: 11, title: 'The ii–V–I and guide tones', prerequisites: ['J11-2'],
    summary: 'The most important progression in jazz, played with shells and smooth guide-tone lines.',
    teach: [
      step('Prepare, tension, release', 'ii–V–I is jazz\'s basic sentence: ii prepares, V creates tension, I resolves. In C: Dm7 – G7 – Cmaj7. Most jazz standards are chains of ii–V–Is moving through different keys.', {
        seq: C('D3+F3+A3+C4 G2+F3+B3+D4 C3+E3+G3+B3'),
      }),
      step('Shell voicings', 'Jazz pianists often play just the root plus the 3rd or 7th in the left hand: the "shell". The 3rd and 7th carry the chord\'s color; the 5th adds little. Dm7 = D + C (root, 7th), G7 = G + B (root, 3rd), Cmaj7 = C + B (root, 7th).', {
        seq: C('D3+C4 G2+B3 C3+B3'),
        tips: ['Alternate root-7 and root-3 shells so the top note moves by step.', 'Shells leave room for the melody and the bass player.'],
      }),
      step('Guide tones move by half step', 'Watch the 3rds and 7ths: Dm7 has F and C. G7 has B and F. Cmaj7 has E and B. C falls to B, F stays, then F falls to E and B stays. These are guide tones. Play them and the harmony is clear even without roots.', {
        compare: [{ label: 'Guide tones alone', seq: C('F3+C4 F3+B3 E3+B3') }, { label: 'With roots', seq: C('D2+F3+C4 G2+F3+B3 C2+E3+B3') }],
      }),
      step('In every key', 'Learn ii–V–I in C, F and Bb first (the most common jazz keys). The shapes are the same; only the starting note moves.', {
        tips: ['F: Gm7 – C7 – Fmaj7', 'Bb: Cm7 – F7 – Bbmaj7', 'Eb: Fm7 – Bb7 – Ebmaj7'],
      }),
    ],
    exercises: [
      ex('J11-3-a', 'Shells in C', 'LH shells: Dm7, G7, Cmaj7.', 'bass', 'wait', seqOf('D3+C4:4 G2+B3:4 C3+B3:4', 'LH'), ['fingerTechnique']),
      ex('J11-3-b', 'Guide-tone line', 'LH roots, RH guide tones (3rds and 7ths) moving by half step.', 'treble', 'wait', hands('C5+F5:4 B4+F5:4 B4+E5:4 B4+E5:4', 'D3:4 G2:4 C3:4 C3:4'), ['fingerTechnique'], { grand: true }),
      ex('J11-3-c', 'ii–V–I in F and Bb', 'Shells in two more keys.', 'bass', 'wait', seqOf('G2+F3:4 C3+E3:4 F2+E3:4 C3+Bb3:4 F2+A3:4 Bb2+A3:4', 'LH'), ['fingerTechnique', 'noteReadingBass'], { flats: true }),
      drill('J11-3-d', 'Hear ii–V–I', 'Name the jazz progression after the home chord.', { kind: 'progression', pool: ['ii7-V7-Imaj7-Imaj7', 'Imaj7-vi7-ii7-V7', 'iii7-vi7-ii7-V7', 'Imaj7-IVmaj7-iii7-vi7'], keys: [60, 65, 58], rounds: 6 }),
    ],
  },
  {
    id: 'J11-4', level: 11, title: 'Rootless voicings', prerequisites: ['J11-3'],
    summary: 'The modern jazz piano sound: 3rd, 7th and colors (9th, 13th) in the left hand, no root.',
    teach: [
      step('Leave the root to the bass', 'In a band, the bass player plays roots. Pianists then play rootless voicings: 3rd, 5th, 7th and 9th. They sound rich and modern and leave room for everyone.', {
        compare: [{ label: 'Root position Dm7', seq: C('D3+F3+A3+C4') }, { label: 'Rootless Dm9', seq: C('F3+A3+C4+E4') }],
      }),
      step('A form: 3 5 7 9', 'Start with the 3rd on the bottom. ii–V–I in C: Dm9 = F A C E, G13 = F A B E (7, 9, 3, 13), Cmaj9 = E G B D. Each voice moves a step or stays.', {
        seq: C('F3+A3+C4+E4 F3+A3+B3+E4 E3+G3+B3+D4'),
      }),
      step('B form: 7 9 3 5', 'Start with the 7th on the bottom: Dm9 = C E F A, G13 = B E F A, Cmaj9 = B D E G. Use B form when the A form would sit too high or too low.', {
        seq: C('C4+E4+F4+A4 B3+E4+F4+A4 B3+D4+E4+G4'),
      }),
      step('Where to put them', 'Keep left-hand voicings roughly between the C below middle C and the G above it. Lower than that and they turn muddy.'),
    ],
    exercises: [
      ex('J11-4-a', 'A-form ii–V–I', 'LH rootless voicings, RH plays the roots for now.', 'treble', 'wait', hands('D4:4 G4:4 C4:4', 'F3+A3+C4+E4:4 F3+A3+B3+E4:4 E3+G3+B3+D4:4'), ['fingerTechnique'], { grand: true }),
      ex('J11-4-b', 'B-form ii–V–I', 'The other shape.', 'bass', 'wait', seqOf('C4+E4+F4+A4:4 B3+E4+F4+A4:4 B3+D4+E4+G4:4', 'LH'), ['fingerTechnique']),
      ex('J11-4-c', 'Comp in swing', 'A-form voicings, Charleston rhythm.', 'bass', 'timed', seqOf('F3+A3+C4+E4:1.5 F3+A3+C4+E4:2.5 F3+A3+B3+E4:1.5 F3+A3+B3+E4:2.5 E3+G3+B3+D4:4 E3+G3+B3+D4:4', 'LH'), ['rhythm', 'fingerTechnique'], { tempo: 88, swing: true }),
    ],
  },
  {
    id: 'J11-5', level: 11, title: 'The blues: form, scale and phrasing', prerequisites: ['J11-3'],
    summary: 'The 12-bar jazz blues, the blues scale, crushed notes and call and response.',
    teach: [
      step('The jazz blues in F', 'Twelve bars, all dominant chords plus a ii–V at the end: | F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 | C7 |. The quick change to Bb7 in bar 2 and the D7 in bar 8 are what make it jazz rather than rock.', {
        seq: C('F2+A3+Eb4 Bb2+Ab3+D4 F2+A3+Eb4 F2+A3+Eb4 Bb2+Ab3+D4 Bb2+Ab3+D4 F2+A3+Eb4 D3+C4+F#4 G2+F3+Bb3 C3+E3+Bb3 F2+A3+Eb4 C3+E3+Bb3'),
      }),
      step('The blues scale', 'F blues scale: F Ab Bb B C Eb F. The B (the flat 5) is a passing color: slide through it. Blues melodies happily use Ab against the major chord. That rub is the blues.', {
        seq: C('F4 Ab4 Bb4 B4 C5 Eb5 F5'), seqBeats: 1,
      }),
      step('Crushed notes', 'Pianists cannot bend strings, so they "crush" a note: strike the minor 3rd and slide off it to the major 3rd at once (Ab to A in F). It imitates a singer\'s bluesy slide.', {
        compare: [{ label: 'Plain A', seq: C('A4+F5') }, { label: 'Crushed Ab to A', seq: C('Ab4 A4+F5') }], seqBeats: 0.25,
      }),
      step('Call and response', 'Blues phrases talk to each other: play a short idea (call), leave space, then answer it. Repeat an idea when the chord changes and let the new chord change its meaning. Space is as important as notes.'),
    ],
    exercises: [
      ex('J11-5-a', 'F blues shells', 'LH root and 7th (or 3rd) through the whole form.', 'bass', 'timed', seqOf('F2+Eb3:4 Bb2+Ab3:4 F2+Eb3:4 F2+Eb3:4 Bb2+Ab3:4 Bb2+Ab3:4 F2+Eb3:4 D3+C4:4 G2+F3:4 C3+Bb3:4 F2+Eb3:4 C3+Bb3:4', 'LH'), ['rhythm', 'fingerTechnique'], { tempo: 92, flats: true }),
      ex('J11-5-b', 'Blues scale and crush', 'Up the F blues scale, then a crushed-note phrase.', 'treble', 'wait', seqOf('F4 Ab4 Bb4 B4 C5 Eb5 F5:2 Ab4:0.5 A4:0.5 F4:1 C5:2', 'RH'), ['fingerTechnique'], { flats: true }),
      ex('J11-5-c', 'Call and response', 'A two-bar call, the same answer moved to the Bb7 chord.', 'treble', 'timed', hands('C5:0.5 Eb5:0.5 F5:1 C5:1 R:1 R:4 D5:0.5 F5:0.5 Ab5:1 F5:1 R:1 R:4', 'F2+Eb3:4 F2+Eb3:4 Bb2+Ab3:4 Bb2+Ab3:4'), ['rhythm'], { grand: true, swing: true, tempo: 96, flats: true }),
    ],
  },
  {
    id: 'J11-6', level: 11, title: 'Improvising: chord tones and approach notes', prerequisites: ['J11-4', 'J11-5'],
    summary: 'Make lines that outline the chords: target chord tones, approach them, enclose them.',
    teach: [
      step('Chord tones on strong beats', 'The simplest way to sound like you know the changes: land on a chord tone (1, 3, 5, 7) on beats 1 and 3. The 3rd and 7th sound the most "inside" because they define the chord.', {
        seq: C('D4 F4 A4 C5 B4 G4 F4 D4 E4 G4 B4 D5'), seqBeats: 0.5,
      }),
      step('Approach from a half step below', 'Play the note a half step below a chord tone just before it. It creates a tiny moment of tension that resolves straight away. Jazz lines are full of these.', {
        compare: [{ label: 'Plain', seq: C('E4 G4') }, { label: 'Approached', seq: C('D#4 E4 F#4 G4') }], seqBeats: 0.5,
      }),
      step('Enclosures', 'Surround the target: play the note above it, then the note below it, then the target. Charlie Parker\'s lines are full of enclosures. Aim them at the 3rd of each new chord.', {
        seq: C('F4 D#4 E4'), seqBeats: 0.5,
      }),
      step('Build a phrase', 'Start with a short motif (3 to 5 notes), repeat it, then vary it: move it to fit the next chord, change its rhythm, or answer it. Good solos tell a story from a small idea.'),
    ],
    exercises: [
      ex('J11-6-a', 'Arpeggiate the changes', 'Chord tones up through Dm7, G7, Cmaj7 in swing eighths.', 'treble', 'timed', hands('D4:0.5 F4:0.5 A4:0.5 C5:0.5 B4:0.5 G4:0.5 F4:0.5 D4:0.5 E4:0.5 G4:0.5 B4:0.5 D5:0.5 C5:2', 'D3+C4:2 G2+B3:2 C3+B3:4'), ['rhythm', 'fingerTechnique'], { grand: true, swing: true, tempo: 88 }),
      ex('J11-6-b', 'Approach the 3rds', 'Hit the 3rd of each chord on beat 1, approached from below.', 'treble', 'timed', seqOf('R:3.5 E4:0.5 F4:3.5 A#4:0.5 B4:3.5 D#4:0.5 E4:4', 'RH'), ['rhythm'], { swing: true, tempo: 92 }),
      ex('J11-6-c', 'Enclosures', 'Above, below, target: into F, B and E.', 'treble', 'timed', seqOf('R:3 G4:0.5 E4:0.5 F4:3 C5:0.5 A#4:0.5 B4:3 F4:0.5 D#4:0.5 E4:4', 'RH'), ['rhythm'], { swing: true, tempo: 88 }),
    ],
  },
  {
    id: 'J11-7', level: 11, title: 'Walking bass and two-hand comping', prerequisites: ['J11-6'],
    summary: 'Walk a bass line in the left hand while the right hand comps.',
    teach: [
      step('The rules of walking', 'Quarter notes, one per beat. Beat 1: the root. Beats 2 and 3: chord tones or scale steps. Beat 4: an approach note (a half step or whole step) into the next root.', {
        seq: C('D3 F3 A3 Ab3 G2 B2 D3 Db3 C3 E3 G3 B2'), seqBeats: 1,
      }),
      step('Approach notes', 'Approaching from a half step above or below makes the next chord sound inevitable. Ab into G, Db into C: chromatic approaches are the walking bassist\'s secret.'),
      step('Right hand comps lightly', 'While the left hand walks, the right hand plays short shell or rootless voicings: on the "and" of 2, or on 2 and 4. Keep it light and short so the bass line can breathe.'),
    ],
    exercises: [
      ex('J11-7-a', 'Walk a ii–V–I', 'LH quarter notes, root on beat 1, approach on beat 4.', 'bass', 'timed', seqOf('D3 F3 A3 Ab3 G2 B2 D3 Db3 C3 E3 G3 B2 C3:4', 'LH'), ['rhythm', 'noteReadingBass'], { tempo: 100, swing: true, flats: true }),
      ex('J11-7-b', 'Walk and comp', 'LH walks, RH comps guide tones on beat 2.', 'treble', 'timed', hands('R:1 F4+C5:1 R:2 R:1 F4+B4:1 R:2 R:1 E4+B4:1 R:2', 'D3 F3 A3 Ab3 G2 B2 D3 Db3 C3 E3 G3 E3'), ['rhythm', 'fingerTechnique'], { grand: true, tempo: 92, swing: true, flats: true }),
    ],
  },
  {
    id: 'J11-8', level: 11, title: 'Reharmonization: turnarounds and substitutes', prerequisites: ['J11-6'],
    summary: 'Secondary dominants, the tritone substitute, and the turnarounds that link phrases.',
    teach: [
      step('Secondary dominants', 'Any chord can be approached by its own V7. Turn Am7 into A7 and it pulls to Dm7 (A7 is "V of ii"). This adds color and forward motion.', {
        compare: [{ label: 'C - Am7 - Dm7 - G7', seq: C('C3+E4+G4+B4 A2+C4+E4+G4 D3+C4+F4+A4 G2+B3+F4+A4') }, { label: 'C - A7 - Dm7 - G7', seq: C('C3+E4+G4+B4 A2+C#4+E4+G4 D3+C4+F4+A4 G2+B3+F4+A4') }],
      }),
      step('The tritone substitute', 'G7 and Db7 share the same guide tones (B and F, spelled Cb and F in Db7). So Db7 can replace G7. The bass then slides down by half steps: Dm7 – Db7 – Cmaj7. Smooth and very jazzy.', {
        compare: [{ label: 'ii – V – I', seq: C('D3+F3+C4 G2+F3+B3 C3+E3+B3') }, { label: 'ii – bII7 – I', seq: C('D3+F3+C4 Db3+F3+B3 C3+E3+B3') }],
      }),
      step('Turnarounds', 'A turnaround fills the last two bars of a section and leads back to the top: I – vi – ii – V (Cmaj7 Am7 Dm7 G7), or with secondary dominants: I – VI7 – ii – V (Cmaj7 A7 Dm7 G7), or iii – VI7 – ii – V.', {
        seq: C('C3+E4+G4+B4 A2+C#4+E4+G4 D3+C4+F4+A4 G2+B3+F4+A4'),
      }),
    ],
    exercises: [
      ex('J11-8-a', 'Turnaround I–VI7–ii–V', 'Shells through the classic turnaround.', 'bass', 'wait', seqOf('C3+B3:2 A2+G3:2 D3+C4:2 G2+F3:2 C3+B3:4', 'LH'), ['fingerTechnique']),
      ex('J11-8-b', 'Tritone substitute', 'Dm7 – Db7 – Cmaj7: the bass slides down.', 'bass', 'wait', seqOf('D3+C4:4 Db3+B3:4 C3+B3:4', 'LH'), ['fingerTechnique'], { flats: true }),
      drill('J11-8-c', 'Hear the turnarounds', 'Which version is it?', { kind: 'progression', pool: ['Imaj7-vi7-ii7-V7', 'Imaj7-VI7-ii7-V7', 'iii7-VI7-ii7-V7', 'ii7-bII7-Imaj7-Imaj7'], keys: [60, 65], rounds: 6 }),
    ],
  },
  {
    id: 'J11-9', level: 11, title: 'Play from a lead sheet', prerequisites: ['J11-7', 'J11-8'],
    summary: 'Melody in the right hand, shells in the left, swing feel: a real jazz performance.',
    teach: [
      step('What a lead sheet gives you', 'A lead sheet shows only the melody and chord symbols. You make the arrangement: left-hand voicings, rhythm, fills between phrases. This is how jazz musicians read standards.'),
      step('Simplest version first', 'Right hand: the melody, swung. Left hand: a shell on beat 1 of each chord. When that is comfortable, try Charleston comping, then rootless voicings, then add fills where the melody rests.'),
      step('When the Saints in F', 'A traditional tune, perfect for practice: | F | F | F | C7 | F | F7 Bb | F C7 | F |. Melody starts on F, A, Bb, C.', {
        seq: C('F4 A4 Bb4 C5'), seqBeats: 1,
      }),
    ],
    exercises: [
      ex('J11-9-a', 'Saints: melody and shells', 'RH melody, LH shells on beat 1. Swing it.', 'treble', 'timed', hands('R:1 F4:1 A4:1 Bb4:1 C5:4 R:1 F4:1 A4:1 Bb4:1 C5:4 R:1 F4:1 A4:1 Bb4:1 C5:2 A4:2 F4:2 A4:2 G4:4', 'F2+Eb3:4 F2+Eb3:4 F2+Eb3:4 F2+Eb3:4 F2+Eb3:4 F2+Eb3:4 F2+Eb3:4 C3+Bb3:4'), ['rhythm', 'fingerTechnique'], { grand: true, swing: true, tempo: 104, flats: true }),
    ],
  },

  // =====================================================================================
  // LEVEL 12 · FOUR-PART WRITING AND ARRANGING
  // =====================================================================================
  {
    id: 'A12-1', level: 12, title: 'Four voices, ranges and spacing', prerequisites: ['L6-3'],
    summary: 'Soprano, alto, tenor, bass: where each one sings, how far apart, and which note to double.',
    teach: [
      step('Four lines, not just chords', 'Choirs, hymns, string quartets and horn sections all think in four voices. Each voice is its own singable line. Soprano and alto are written on the treble staff, tenor and bass on the bass staff.', { seq: C(I) }),
      step('Ranges', 'Keep each voice where it sounds good. Going outside these makes singers strain.', {
        tips: ['Soprano: C4 to G5', 'Alto: G3 to D5', 'Tenor: C3 to G4', 'Bass: E2 to C4'],
        seq: C('C4+G5 G3+D5 C3+G4 E2+C4'),
      }),
      step('Spacing', 'Neighbor upper voices stay within an octave: soprano to alto, alto to tenor. Tenor and bass can be further apart. Voices do not cross (alto never above soprano).', {
        compare: [{ label: 'Gap too wide (thin)', seq: C('C3+E3+G3+C5') }, { label: 'Good spacing', seq: C(I) }],
      }),
      step('Doubling', 'A triad has 3 notes but you have 4 voices, so one note is doubled. In a root-position chord, double the root. Never leave out the 3rd (it decides major or minor). The 5th can be left out if needed.', {
        compare: [{ label: 'No 3rd (empty)', seq: C('C3+G3+C4+G4') }, { label: 'Root doubled', seq: C(I) }],
      }),
    ],
    exercises: [
      ex('A12-1-a', 'Play I, IV, V in four parts', 'LH bass and tenor, RH alto and soprano.', 'treble', 'wait', satb(`${I} ${IV} ${V} ${I}`), ['noteReadingTreble', 'noteReadingBass'], { grand: true }),
      ex('A12-1-b', 'Complete the chord: find the alto', 'The alto is hidden. Which chord note is missing? Play all four.', 'treble', 'wait', satb(`${I} ${IV} ${V} ${I}`, ['A']), ['noteReadingTreble'], { grand: true, hideLabels: true }),
      ex('A12-1-c', 'Complete the chord: find the tenor', 'The tenor is hidden. Remember: double the root, keep the 3rd.', 'treble', 'wait', satb(`${I} ${vi} ${IV} ${V} ${I}`, ['T']), ['noteReadingBass'], { grand: true, hideLabels: true }),
    ],
  },
  {
    id: 'A12-2', level: 12, title: 'Voice leading: the rules', prerequisites: ['A12-1'],
    summary: 'Common tones, step-wise motion, contrary motion, and no parallel 5ths or octaves.',
    teach: [
      step('Keep common tones', 'If two chords share a note, keep it in the same voice. C major to F major share C: the soprano holds it while the others move.', { seq: C(`${I} ${IV}`) }),
      step('Move by the smallest step', 'Upper voices go to the nearest note of the next chord. Leaps belong to the bass. Smooth inner voices are what make a chorale sound effortless to sing.', {
        compare: [{ label: 'Jumpy', seq: C('C3+E3+C4+G4 F3+C4+A4+F5') }, { label: 'Smooth', seq: C(`${I} ${IV}`) }],
      }),
      step('Contrary motion against the bass', 'When the bass goes up, move the upper voices down (and vice versa). This keeps voices independent and avoids parallels.', { seq: C(`${IV} ${V}`) }),
      step('No parallel 5ths or octaves', 'Two voices a 5th (or an octave) apart must not move together to another 5th (or octave). It makes two voices sound like one and the texture goes hollow. Compare:', {
        compare: [{ label: 'Parallel 5ths (wrong)', seq: C('C3+G3+E4+C5 D3+A3+F4+D5') }, { label: 'Fixed by contrary motion', seq: C('C3+G3+E4+C5 D3+A3+F4+A4') }],
      }),
      step('Tendency tones', 'The leading tone (B in C major) rises to C. The 7th of a chord (F in G7) falls to E. Follow these and cadences sound strong.', { seq: C(`${V7} ${I}`) }),
    ],
    exercises: [
      ex('A12-2-a', 'Smooth I–vi–ii–V–I', 'Watch common tones held and voices moving by step.', 'treble', 'wait', satb(`${I} ${vi} ${ii} ${V} ${I}`), ['noteReadingTreble', 'noteReadingBass'], { grand: true }),
      ex('A12-2-b', 'Find the alto by voice leading', 'Hidden alto: keep common tones, move by step.', 'treble', 'wait', satb(`${I} ${vi} ${ii} ${V} ${I}`, ['A']), ['noteReadingTreble'], { grand: true, hideLabels: true }),
      ex('A12-2-c', 'Resolve the tendency tones', 'V7 to I: the 7th falls, the leading tone rises. Alto and soprano hidden.', 'treble', 'wait', satb(`${IV} ${V7} ${I}`, ['A', 'S']), ['noteReadingTreble'], { grand: true, hideLabels: true }),
    ],
  },
  {
    id: 'A12-3', level: 12, title: 'Cadences: how phrases end', prerequisites: ['A12-2'],
    summary: 'Perfect, plagal, half and deceptive cadences: punctuation for music.',
    teach: [
      step('Perfect cadence (V–I)', 'The full stop. Bass falls G to C, the leading tone rises to C, soprano ends on the home note.', { seq: C(`${V} ${I}`) }),
      step('Plagal cadence (IV–I)', 'The "Amen". Softer, often after a perfect cadence at the end of hymns.', { seq: C(`${IV} ${I}`) }),
      step('Half cadence (ends on V)', 'A comma: the phrase stops on V and leaves you waiting. Common in the middle of a song.', { seq: C(`${I} ${ii} ${V}`) }),
      step('Deceptive cadence (V–vi)', 'You expect I and get vi instead: a surprise that keeps the music going. Double the 3rd (C) in the vi chord to avoid parallels.', {
        compare: [{ label: 'V – I', seq: C(`${V} ${I}`) }, { label: 'V – vi', seq: C(`${V} A2+E3+C4+C5`) }],
      }),
      step('Planning a phrase', 'A typical 8-bar tune: first phrase ends with a half cadence (question), second with a perfect cadence (answer). Plan your cadences first, then fill in the chords before them.'),
    ],
    exercises: [
      ex('A12-3-a', 'The four cadences', 'Perfect, plagal, half, deceptive.', 'treble', 'wait', satb(`${V}:2 ${I}:2 ${IV}:2 ${I}:2 ${I}:2 ${V}:2 ${V}:2 A2+E3+C4+C5:2`), ['noteReadingTreble', 'noteReadingBass'], { grand: true }),
      ex('A12-3-b', 'Find the bass of each cadence', 'Bass hidden: which root makes each cadence?', 'treble', 'wait', satb(`${V}:2 ${I}:2 ${IV}:2 ${I}:2 ${V}:2 A2+E3+C4+C5:2`, ['B']), ['noteReadingBass'], { grand: true, hideLabels: true }),
      drill('A12-3-c', 'Hear the ending', 'Which chords end the phrase?', { kind: 'progression', pool: ['I-ii-V-I', 'I-IV-V-vi', 'I-vi-IV-I', 'I-IV-ii-V'], keys: [60, 65, 67], rounds: 6 }),
    ],
  },
  {
    id: 'A12-4', level: 12, title: 'Inversions and a singable bass line', prerequisites: ['A12-3'],
    summary: 'Put the 3rd or 5th in the bass to make the bass line move smoothly.',
    teach: [
      step('First inversion', 'Put the 3rd in the bass: C major with E in the bass (C/E). It sounds lighter and lets the bass move by step instead of leaping. In first inversion, double the root or 5th, not the bass note.', {
        compare: [{ label: 'C (root)', seq: C(I) }, { label: 'C/E (1st inversion)', seq: C('E3+G3+C4+C5') }],
      }),
      step('Stepwise bass lines', 'Inversions turn a jumpy bass into a melody: C – G/B – Am – Am/G – F – C/E – Dm – G. This descending line is behind countless songs and wedding pieces.', {
        seq: C('C3+G3+E4+C5 B2+G3+D4+G4 A2+A3+E4+C5 G2+A3+E4+C5 F2+A3+F4+C5 E2+G3+C4+C5 D3+A3+F4+A4 G2+G3+D4+B4'), seqBeats: 2,
      }),
      step('Second inversion, carefully', 'The 5th in the bass (C/G) sounds unstable. Use it in set places: the cadential 6/4 (C/G before G at a cadence) or as a passing chord between two positions of the same chord.', { seq: C('F3+A3+F4+C5 G2+G3+E4+C5 G2+G3+D4+B4 C3+G3+E4+C5') }),
    ],
    exercises: [
      ex('A12-4-a', 'The descending bass line', 'C – G/B – Am – Am/G – F – C/E – Dm – G – C.', 'treble', 'wait', satb('C3+G3+E4+C5:2 B2+G3+D4+G4:2 A2+A3+E4+C5:2 G2+A3+E4+C5:2 F2+A3+F4+C5:2 E2+G3+C4+C5:2 D3+A3+F4+A4:2 G2+G3+D4+B4:2 C3+G3+E4+C5:4'), ['noteReadingBass'], { grand: true }),
      ex('A12-4-b', 'Write the bass: find it', 'Upper voices given, bass hidden. Make the line step down.', 'treble', 'wait', satb('C3+G3+E4+C5:2 B2+G3+D4+G4:2 A2+A3+E4+C5:2 G2+A3+E4+C5:2 F2+A3+F4+C5:2 E2+G3+C4+C5:2 D3+A3+F4+A4:2 G2+G3+D4+B4:2', ['B']), ['noteReadingBass'], { grand: true, hideLabels: true }),
      ex('A12-4-c', 'Cadential 6/4', 'IV – I6/4 – V – I: the classic strong ending.', 'treble', 'wait', satb('F3+A3+F4+C5 G2+G3+E4+C5 G2+G3+D4+B4 C3+G3+E4+C5'), ['noteReadingBass'], { grand: true }),
    ],
  },
  {
    id: 'A12-5', level: 12, title: 'Harmonize a melody, step by step', prerequisites: ['A12-4'],
    summary: 'From a bare tune to four parts: cadences, chord choice, bass line, inner voices.',
    teach: [
      step('1. Find the key and the cadences', 'Look at phrase endings first. A phrase ending on 2 or 7 suggests a half cadence (V); ending on 1 suggests a perfect cadence (V–I).'),
      step('2. Choose chords for strong beats', 'Each melody note belongs to three triads. E is in C (I), Am (vi) and Em (iii). Pick chords on the strong beats; weak-beat notes can be passing notes.', {
        compare: [{ label: 'E over C', seq: C('C3+G3+C4+E4') }, { label: 'E over Am', seq: C('A2+A3+C4+E4') }, { label: 'E over Em', seq: C('E3+G3+B3+E4') }],
      }),
      step('3. Follow chord functions', 'Move tonic (I, vi) → subdominant (IV, ii) → dominant (V) → tonic. Going backwards (V to IV) is weaker. Change chord once or twice a bar (harmonic rhythm) and keep it steady.', {
        tips: ['Tonic: I, vi (iii)', 'Subdominant: IV, ii', 'Dominant: V, V7, vii°'],
      }),
      step('4. Write the bass against the melody', 'Make the bass a second melody: contrary motion to the soprano, stepping where it can, roots at cadences.'),
      step('5. Fill the alto and tenor', 'Complete each chord with the nearest notes, keeping common tones and checking for parallels. Then sing or play each line alone: it should be easy to sing.'),
      step('Let Sing to score help', 'In Voice, sing any tune into Sing to score and choose Four parts. Maestro follows these same rules. Compare its choices with your own, then change what you prefer.'),
    ],
    exercises: [
      ex('A12-5-a', 'Twinkle: choose the bass', 'The tune in half notes, inner voices given. Find the bass for I – I – IV – I – IV – I – V – I.', 'treble', 'wait', satb('C3+E3+G3+C4:2 C3+E3+C4+G4:2 F2+F3+C4+A4:2 C3+E3+C4+G4:2 F2+C3+A3+F4:2 C3+G3+C4+E4:2 G2+G3+B3+D4:2 C3+E3+G3+C4:2', ['B']), ['noteReadingBass'], { grand: true, hideLabels: true }),
      ex('A12-5-b', 'Twinkle: fill the inner voices', 'Soprano and bass given. Find alto and tenor.', 'treble', 'wait', satb('C3+E3+G3+C4:2 C3+E3+C4+G4:2 F2+F3+C4+A4:2 C3+E3+C4+G4:2 F2+C3+A3+F4:2 C3+G3+C4+E4:2 G2+G3+B3+D4:2 C3+E3+G3+C4:2', ['A', 'T']), ['noteReadingTreble', 'noteReadingBass'], { grand: true, hideLabels: true }),
    ],
  },
  {
    id: 'A12-6', level: 12, title: 'Non-chord tones: passing, neighbor, suspension', prerequisites: ['A12-5'],
    summary: 'Notes outside the chord that add motion and expression.',
    teach: [
      step('Passing tones', 'A note that fills a gap between two chord tones by step: E – D – C over a C chord. It moves the line without changing the harmony.', {
        compare: [{ label: 'Block', seq: C('C3+G3+E4+C5 G2+G3+D4+B4 C3+G3+C4+C5') }, { label: 'With passing tone', seq: C('C3+G3+E4+C5 C3+G3+D4+C5 G2+G3+D4+B4 C3+G3+C4+C5') }], seqBeats: 1,
      }),
      step('Neighbor tones', 'Step away from a chord tone and back: C – D – C. Adds a little ornament to an inner voice.'),
      step('The 4–3 suspension', 'Hold a note from the previous chord over the new bass, then resolve it down by step. Over a G chord, hold C (the 4th) then fall to B (the 3rd). It is the most expressive device in choral writing.', {
        compare: [{ label: 'Plain V – I', seq: C(`${IV} ${V} ${I}`) }, { label: 'With 4–3 suspension', seq: C(`${IV} G2+G3+D4+C5 ${V} ${I}`) }],
      }),
    ],
    exercises: [
      ex('A12-6-a', 'Passing tone in the alto', 'The alto steps E – D – C while the chord holds.', 'treble', 'wait', satb('C3+G3+E4+C5:2 C3+G3+D4+C5:2 G2+G3+D4+B4:4 C3+G3+C4+C5:4'), ['noteReadingTreble'], { grand: true }),
      ex('A12-6-b', 'A 4–3 suspension cadence', 'Hold C over the G bass, then fall to B, then resolve home.', 'treble', 'wait', satb(`${IV}:4 G2+G3+D4+C5:2 ${V}:2 ${I}:4`), ['noteReadingTreble'], { grand: true }),
    ],
  },
  {
    id: 'A12-7', level: 12, title: 'Piano accompaniment styles', prerequisites: ['A12-4'],
    summary: 'One progression, many textures: block, broken, Alberti, ballad, stride.',
    teach: [
      step('Same chords, new texture', 'Arranging for piano means choosing a texture that fits the style. Keep the harmony and change how it is played.', {
        compare: [{ label: 'Block', seq: C('C3+E3+G3 C3+E3+G3') }, { label: 'Broken', seq: C('C3 G3 E4 G3') }, { label: 'Alberti', seq: C('C3 G3 E3 G3') }], seqBeats: 1,
      }),
      step('Ballad arpeggios', 'Root low, then spread the chord upwards in eighths (1 – 5 – 8 – 10). Use the sustain pedal and change it with each chord. Great for slow songs.', { seq: C('C2 G2 C3 E3 G3 E3 C3 G2'), seqBeats: 0.5 }),
      step('Stride', 'Low bass note on beats 1 and 3, chord in the middle on 2 and 4. The left hand jumps: it is the sound of ragtime and early jazz piano.', { seq: C('C2 E3+G3+C4 G2 E3+G3+C4'), seqBeats: 1 }),
      step('Pop syncopation', 'Left hand plays root and 5th, right hand plays chords on the off-beats, or with the rhythm 1 – and-of-2 – 4. Leave space: the singer and drums carry the rest.'),
    ],
    exercises: [
      ex('A12-7-a', 'Broken chords', 'C – Am – F – G, broken in eighths.', 'bass', 'timed', seqOf('C3:0.5 G3:0.5 E4:0.5 G3:0.5 C3:0.5 G3:0.5 E4:0.5 G3:0.5 A2:0.5 E3:0.5 C4:0.5 E3:0.5 A2:0.5 E3:0.5 C4:0.5 E3:0.5 F2:0.5 C3:0.5 A3:0.5 C3:0.5 F2:0.5 C3:0.5 A3:0.5 C3:0.5 G2:0.5 D3:0.5 B3:0.5 D3:0.5 G2:0.5 D3:0.5 B3:0.5 D3:0.5', 'LH'), ['rhythm', 'fingerTechnique'], { tempo: 76 }),
      ex('A12-7-b', 'Stride', 'Bass on 1 and 3, chord on 2 and 4.', 'bass', 'timed', seqOf('C2 E3+G3+C4 G2 E3+G3+C4 F2 F3+A3+C4 C2 F3+A3+C4 G2 F3+G3+B3 D2 F3+G3+B3 C2 E3+G3+C4 G2 E3+G3+C4', 'LH'), ['rhythm', 'fingerTechnique'], { tempo: 84 }),
      ex('A12-7-c', 'Ballad arpeggios with melody', 'RH melody, LH arpeggio under it.', 'treble', 'timed', hands('E5:2 D5:2 C5:2 B4:2', 'C3:0.5 G3:0.5 C4:0.5 E4:0.5 G3:0.5 C4:0.5 E4:0.5 C4:0.5 A2:0.5 E3:0.5 A3:0.5 C4:0.5 G2:0.5 D3:0.5 G3:0.5 B3:0.5'), ['rhythm'], { grand: true, tempo: 66 }),
    ],
  },
  {
    id: 'A12-8', level: 12, title: 'Arrange a song for choir', prerequisites: ['A12-5', 'A12-6'],
    summary: 'From a tune to a full SATB arrangement: key, texture, harmony parts, intro and ending.',
    teach: [
      step('Start from a lead sheet', 'You need the melody and a chord chart. Work it out by ear (Level 10) or sing it into Sing to score.'),
      step('Choose the key for the voices', 'Put the melody where the soprano is comfortable (roughly C4 to E5 for most choirs). If the tune is low, move the melody to the tenor instead and harmonize above and below it.'),
      step('Plan the texture', 'Do not use four parts all the way through. Build it up:', {
        tips: ['Verse 1: melody in unison (everyone) or solo', 'Verse 2: melody plus a second part in 3rds or 6ths', 'Chorus: full four parts', 'Last chorus: key change up a step, or a descant above the melody', 'Ending: slow down, a sustained chord, maybe a plagal "Amen"'],
      }),
      step('Write the parts', 'Soprano: melody. Bass: roots and inversions forming a good line. Alto and tenor: nearest chord tones, smooth, a little rhythmic interest where the melody holds long notes. Check each line by singing it alone.'),
      step('Amazing Grace in four parts', 'Hear a simple SATB setting of the first line in 3/4. Then learn each part on its own: that is how choir singers rehearse.', {
        seq: C('C3+G3+E4+G4 C3+G3+E4+C5 C3+G3+G4+E5 F3+A3+F4+C5 C3+G3+E4+C5'), seqBeats: 3,
      }),
    ],
    exercises: [
      ex('A12-8-a', 'Amazing Grace, SATB', 'Play the four-part setting, line 1.', 'treble', 'wait', satb('C3+G3+E4+G4:1 C3+G3+E4+C5:2 C3+G3+G4+E5:1 F3+A3+F4+C5:2 G2+B3+D4+D5:3 C3+G3+E4+C5:3'), ['noteReadingTreble', 'noteReadingBass'], { grand: true, timeSig: [3, 4] }),
      ex('A12-8-b', 'Learn the alto part', 'Alto line alone, as a choir alto would rehearse it.', 'treble', 'wait', seqOf('E4:1 E4:2 G4:1 F4:2 D4:3 E4:3', 'RH'), ['noteReadingTreble'], { timeSig: [3, 4] }),
      ex('A12-8-c', 'Learn the tenor part', 'Tenor line alone (written an octave lower than it sounds).', 'bass', 'wait', seqOf('G3:1 G3:2 G3:1 A3:2 B3:3 G3:3', 'LH'), ['noteReadingBass'], { timeSig: [3, 4] }),
    ],
  },
];
