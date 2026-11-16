// Phase 1 curriculum: Level 0 (Absolute Beginner Foundations) and Level 1 (First Notes and Simple Melodies).
// Every lesson follows SEE IT -> HEAR IT -> UNDERSTAND IT -> PLAY IT -> FEEDBACK -> CORRECT -> MASTER.

import { nameToMidi } from '../core/music';
import type { Clef, Exercise, Hand, Lesson, ScoreEvent, SkillId } from '../core/types';
import { frac, MORE_LESSONS, type LessonDef } from './levels';
import { ADVANCED_LESSONS } from './advanced';
import { COUNT_LESSON, KEYSIG_LESSON, LANDMARK_LESSON, RHYTHM_LESSONS, SETUP_LESSON, STAFF_LESSON, VALUES_LESSON } from './basics';
import { hands } from './levels';
import { CHURCH_LESSONS } from './church';
import { CRAFT_LESSONS, STYLE_LESSONS } from './styles';
import { playAlongs, type PlayAlongSpec } from './playalong';
import { conceptsTaught } from './coverage';
import { R } from './rhythmCards';

/** Build events from "C4:1 D4:1 E4:2 R:1 C4+E4+G4:4" (name:beats, R = rest, + = chord). */
export function seq(spec: string, hand: Hand = 'RH', fingers?: (number | number[])[]): ScoreEvent[] {
  let beat = 0;
  return spec.trim().split(/\s+/).map((tok, i) => {
    const [n, b] = tok.split(':');
    const beats = frac(b ?? '1');
    const pitches = n === 'R' ? [] : n.split('+').map(nameToMidi);
    const f = fingers?.[i];
    const ev: ScoreEvent = { pitches, beat, beats, hand, fingers: f === undefined ? undefined : Array.isArray(f) ? f : [f] };
    beat += beats;
    return ev;
  });
}

function ex(
  id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[],
  skills: SkillId[], opts: Partial<Exercise> = {}
): Exercise {
  return {
    id, title, objective, clef, mode, events, skills,
    tempo: 60, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 3,
    requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], ...opts,
  };
}

const C4 = nameToMidi('C4');
const ODE_FINGERS = [3, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3, 3, 2, 2, 3, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3, 2, 1, 1];

const BASE_LESSONS: Lesson[] = [
  {
    id: 'L0-1', level: 0, title: 'Meet the keyboard and middle C', prerequisites: [],
    summary: 'Find the black-key groups, then locate and play middle C with right-hand thumb.',
    teach: [
      { title: 'Sit well first', body: 'Sit facing the middle of the keyboard, forearms level with the keys, shoulders loose. Curve your fingers as if holding a small ball. Tension is the enemy: if your wrist feels tight, drop your hands to your lap, shake them out, and start again.' },
      { title: 'The black keys come in groups of 2 and 3', body: 'Look at the highlighted keys. The black keys always repeat in a pattern: a group of two, then a group of three. This pattern is your map of the whole piano.', show: [61, 63, 66, 68, 70] },
      { title: 'Middle C', body: 'C is the white key just LEFT of any group of two black keys. The C closest to the middle of the piano is "middle C", written C4. On the staff it sits on its own short line (a ledger line) below the treble staff.', show: [C4], play: [C4] },
      { title: 'Middle C on the staff', body: 'You met middle C on its ledger line between the two staves. Here it is four times as quarter notes, one beat each. Find it on the keyboard as it sounds: the white key left of the two black keys, in the middle.', rhythm: R('C4=ta C4=ta C4=ta C4=ta', { bpm: 66 }) },
      { title: 'Finger numbers', body: 'Each hand numbers its fingers the same way: thumb = 1, index = 2, middle = 3, ring = 4, little finger = 5. Play middle C with right-hand finger 1 (your thumb), letting the weight of your arm sink into the key.' },
      { title: 'High and low', body: 'Moving right on the keyboard makes pitch go UP (higher). Moving left makes it go DOWN (lower). Listen: low C, middle C, high C.', show: [48, 60, 72], play: [48, 60, 72], sequential: true },
    ],
    exercises: [
      ex('L0-1-a', 'Play middle C four times', 'Locate middle C reliably and play it with RH finger 1.', 'treble', 'wait', seq('C4:1 C4:1 C4:1 C4:1', 'RH', [1, 1, 1, 1]), ['keyboardGeography', 'pitchAccuracy'], { requiredPasses: 2 }),
      ex('L0-1-b', 'Low, middle, high C', 'Find C in three octaves.', 'treble', 'wait', seq('C4:1 C5:1 C4:1 C3:1 C4:1', 'RH'), ['keyboardGeography']),
    ],
  },
  {
    id: 'L0-2', level: 0, title: 'Every white key: A B C D E F G', prerequisites: ['L0-1'],
    summary: 'Name every white key from the black-key landmarks, in every octave, and match it to the staff.',
    teach: [
      { title: 'Only seven letters', body: 'Music uses seven letter names, A B C D E F G, then repeats. From C going right: C D E F G A B, then C again one octave higher.', show: [60, 62, 64, 65, 67, 69, 71, 72] },
      { title: 'Landmarks', body: 'D is between the two black keys. E is just right of them. F is just left of the group of three black keys. G is the first gap inside that group.', show: [62, 64, 65, 67] },
      { title: 'A and B', body: 'A is the next gap inside the group of three black keys, after G. B is just right of the group of three. Then comes C again, left of the next group of two.', show: [69, 71, 72], play: [67, 69, 71, 72], sequential: true },
      { title: 'Every octave is the same', body: 'The pattern repeats all the way up and down the piano, and so do the names: every key just left of two black keys is a C, every key between them is a D, and so on. From one C to the next is an octave. Listen to the Ds, low to high.', show: [50, 62, 74], play: [50, 62, 74], sequential: true },
      { title: 'C position', body: 'Put RH finger 1 on middle C, then let fingers 2, 3, 4 and 5 rest on D, E, F and G. This is "C position". Listen to it played up and down.', show: [60, 62, 64, 65, 67], play: [60, 62, 64, 65, 67, 65, 64, 62, 60], sequential: true },
    ],
    exercises: [
      ex('L0-2-a', 'C position up and down', 'Play C D E F G F E D C with fingers 1-2-3-4-5-4-3-2-1.', 'treble', 'wait', seq('C4 D4 E4 F4 G4 F4 E4 D4 C4', 'RH', [1, 2, 3, 4, 5, 4, 3, 2, 1]), ['keyboardGeography', 'fingerTechnique'], { requiredPasses: 2 }),
      ex('L0-2-b', 'Find the letters', 'Play named notes in mixed order without key labels.', 'treble', 'wait', seq('E4 C4 G4 D4 F4 E4 G4 C4', 'RH'), ['keyboardGeography'], { hideLabels: true }),
      ex('L0-2-c', 'Every D, every F, every A', 'The same letter in different octaves: low with the left hand, higher with the right.', 'treble', 'wait', hands('R:1 D4:1 D5:1 R:1 F4:1 F5:1 R:1 A4:1 A5:1', 'D3:1 R:2 F3:1 R:2 A3:1 R:2'), ['keyboardGeography'], { grand: true }),
      ex('L0-2-d', 'All seven, A to A', 'Read each note from the staff and play A B C D E F G A. No letters on the keys.', 'treble', 'wait', seq('A4 B4 C5 D5 E5 F5 G5 A5', 'RH', [1, 2, 3, 1, 2, 3, 4, 5]), ['keyboardGeography', 'noteReadingTreble'], { hideLabels: true }),
    ],
  },
  {
    id: 'L0-3', level: 0, title: 'Black keys: sharps and flats', prerequisites: ['L0-2'],
    summary: 'Every black key has two names: a sharp of the key below, a flat of the key above.',
    teach: [
      { title: 'Sharp means one key higher', body: 'A sharp (#) raises a note to the very next key on the right. The black key right of C is C#. The black key right of F is F#.', show: [61, 66], play: [60, 61, 65, 66], sequential: true },
      { title: 'Two and three', body: 'In the group of two: C# and D#. In the group of three: F#, G# and A#.', show: [61, 63, 66, 68, 70], play: [61, 63, 66, 68, 70], sequential: true },
      { title: 'Flat means one key lower', body: 'A flat (♭) lowers a note to the very next key on the left. The black key left of E is E♭; the one left of B is B♭. So every black key has two names: C# and D♭ are the same key. Which name is used depends on the music.', show: [63, 70], play: [64, 63, 71, 70], sequential: true },
    ],
    exercises: [
      ex('L0-3-a', 'Two-group and three-group', 'Play C# D# then F# G# A#.', 'treble', 'wait', seq('C#4 D#4 F#4 G#4 A#4', 'RH', [2, 3, 2, 3, 4]), ['keyboardGeography']),
      ex('L0-3-b', 'The same keys as flats', 'Play D♭ E♭ then G♭ A♭ B♭.', 'treble', 'wait', seq('Db4 Eb4 Gb4 Ab4 Bb4', 'RH', [2, 3, 2, 3, 4]), ['keyboardGeography']),
    ],
  },
  {
    id: 'L0-4', level: 0, title: 'One key, every note value', prerequisites: ['L0-2'],
    summary: 'Middle C in whole, half, quarter and eighth notes, then mixed, always with the click.',
    teach: [
      { title: 'The beat', body: 'Music has a steady pulse, like a heartbeat. The metronome clicks each beat. You will hear 4 count-in clicks, then play middle C exactly WITH each click.' },
      { title: 'Quarter notes on middle C', body: 'A quarter note lasts one beat: one note on every click. Count "1, 2, 3, 4" aloud while you play, and watch each note appear right on its click.', show: [C4], rhythm: R('C4=ta C4=ta C4=ta C4=ta C4=ta C4=ta C4=ta C4=ta', { bpm: 60 }) },
      { title: 'Every value on one key', body: 'Staying on one key lets you think only about length. Here is middle C as a whole note, then half notes, quarter notes and eighth notes, one bar each. Hold every note for its full value: press on the count, and lift exactly when the next note (or the end of its beats) arrives.', show: [C4], rhythm: R('C4=ta-a-a-a C4=ta-a C4=ta-a C4=ta C4=ta C4=ta C4=ta C4=ti C4=ti C4=ti C4=ti C4=ti C4=ti C4=ti C4=ti', { bpm: 66 }) },
      { title: 'Mix them', body: 'Now the values change inside the bar. Keep counting the beat underneath and let each note last exactly as long as its shape says.', show: [C4], rhythm: R('C4=ta-a C4=ta C4=ta C4=ti C4=ti C4=ta C4=ta-a C4=ta-a-a-a', { bpm: 66 }) },
    ],
    exercises: [
      ex('L0-4-w', 'All whole notes', 'Middle C, four beats each: play on 1 and hold through 4.', 'treble', 'timed', seq('C4:4 C4:4 C4:4', 'RH', [1, 1, 1]), ['pulse', 'rhythm']),
      ex('L0-4-h', 'All half notes', 'Two beats each: play on 1 and on 3.', 'treble', 'timed', seq('C4:2 C4:2 C4:2 C4:2 C4:2 C4:2', 'RH', [1, 1, 1, 1, 1, 1]), ['pulse', 'rhythm']),
      ex('L0-4-a', 'All quarter notes', 'One note on every click at 60 BPM.', 'treble', 'timed', seq('C4 C4 C4 C4 C4 C4 C4 C4'), ['pulse', 'rhythm'], { requiredPasses: 2 }),
      ex('L0-4-e', 'All eighth notes', 'Two even notes in every beat: "1 and 2 and".', 'treble', 'timed', seq('C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:0.5'), ['pulse', 'rhythm'], { tempo: 56 }),
      ex('L0-4-m', 'Mix: whole, half and quarter', 'The value changes; the beat does not.', 'treble', 'timed', seq('C4:2 C4:1 C4:1 C4:4 C4:1 C4:1 C4:2 C4:4'), ['rhythm']),
      ex('L0-4-n', 'Mix with eighth notes', 'All four values in three bars.', 'treble', 'timed', seq('C4:1 C4:0.5 C4:0.5 C4:2 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:1 C4:1 C4:4'), ['rhythm'], { tempo: 56 }),
    ],
  },
  {
    id: 'L1-1', level: 1, title: 'Reading the treble staff', prerequisites: ['L0-2', 'L0-4'],
    summary: 'Read C to G on the treble staff without labels.',
    teach: [
      { title: 'The staff', body: 'Five lines and four spaces. Higher on the staff = higher pitch. The treble clef (G clef) curls around the second line from the bottom: that line is G.', show: [67] },
      { title: 'Line, space, line', body: 'Middle C sits on a ledger line below the staff. D hangs just under the bottom line. E is ON the bottom line, F is in the first space, G is on the second line. Each step up the staff is one white key to the right.', show: [60, 62, 64, 65, 67], play: [60, 62, 64, 65, 67], sequential: true },
    ],
    exercises: [
      ex('L1-1-a', 'Read and play', 'Read notes from the staff and play them. Key labels are hidden.', 'treble', 'wait', seq('E4 G4 D4 F4 C4 E4 F4 D4 G4 C4'), ['noteReadingTreble'], { hideLabels: true, requiredPasses: 2 }),
    ],
  },
  {
    id: 'L1-2', level: 1, title: 'Note values: half and whole notes', prerequisites: ['L1-1'],
    summary: 'Hold notes for 1, 2 and 4 beats.',
    teach: [
      { title: 'The half note: two beats', body: 'A half note has a hollow head and a stem. It lasts two beats: play it on beat 1 and keep the key down through beat 2. Compare it with the quarter notes before it.', rhythm: R('C4=ta C4=ta D4=ta-a', { bpm: 66 }) },
      { title: 'The whole note: four beats', body: 'A whole note is a hollow head with no stem. It lasts four beats, a whole bar. Play it and keep holding while you count "1 2 3 4".', rhythm: R('E4=ta-a-a-a', { bpm: 66 }) },
      { title: 'All three together', body: 'Quarter (1 beat), half (2) and whole (4) in one tune: exactly what you will play next. Watch how long each note stays lit.', rhythm: R('C4=ta C4=ta D4=ta-a E4=ta-a D4=ta-a C4=ta-a-a-a', { bpm: 66 }) },
    ],
    exercises: [
      ex('L1-2-a', 'Quarter, half, whole', 'Play with correct onsets and hold each note for its full value.', 'treble', 'timed', seq('C4:1 C4:1 D4:2 E4:2 D4:2 C4:4'), ['rhythm', 'noteReadingTreble']),
    ],
  },
  {
    id: 'L1-3', level: 1, title: 'Bass clef and the left hand', prerequisites: ['L1-1'],
    summary: 'Left-hand C position: C3 to G3 in bass clef.',
    teach: [
      { title: 'Bass clef (F clef)', body: 'The two dots of the bass clef surround the 4th line: that line is F. Low notes are written here, usually for the left hand.', show: [53] },
      { title: 'LH C position', body: 'Put LH finger 5 (little finger) on the C below middle C (C3). Fingers 4, 3, 2, 1 rest on D, E, F, G. Notice the fingering runs the opposite way to the right hand.', show: [48, 50, 52, 53, 55], play: [48, 50, 52, 53, 55], sequential: true },
    ],
    exercises: [
      ex('L1-3-a', 'LH C position', 'Play C D E F G F E D C with LH fingers 5-4-3-2-1-2-3-4-5.', 'bass', 'wait', seq('C3 D3 E3 F3 G3 F3 E3 D3 C3', 'LH', [5, 4, 3, 2, 1, 2, 3, 4, 5]), ['noteReadingBass', 'fingerTechnique'], { requiredPasses: 2 }),
      ex('L1-3-b', 'Read the bass staff', 'Mixed bass notes, labels hidden.', 'bass', 'wait', seq('G3 E3 C3 F3 D3 G3 C3', 'LH'), ['noteReadingBass'], { hideLabels: true }),
    ],
  },
  {
    id: 'L1-4', level: 1, title: 'First melody: Ode to Joy', prerequisites: ['L1-2'],
    summary: 'Beethoven\'s theme in C position, first slowly, then in time.',
    teach: [
      { title: 'Two notes in one beat: eighth notes', body: 'Ode to Joy has one new rhythm, so here it is first. An eighth note lasts half a beat; two of them share one beat and are joined by a beam. Say "ti-ti" for the pair.', rhythm: R('C4=ta D4=ta E4=ti F4=ti E4=ta', { bpm: 66 }) },
      { title: 'The dotted quarter: "ta-i ti"', body: 'A dot adds half a note\'s value: a dotted quarter lasts one and a half beats, and an eighth note fills the last half. It sounds long-short: "ta-i ti". Ode to Joy ends each phrase this way (E... D D). Watch the long note stay lit.', rhythm: R('E4=ta E4=ta E4=ta-i D4=ti D4=ta-a', { bpm: 72 }) },
      { title: 'A real melody', body: 'This theme by Beethoven (public domain) uses only C position. Notice it moves mostly by step: neighboring keys. The two phrases are almost the same; only the ending changes (D D, then C C). Listen and follow the notes.', play: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62], sequential: true },
    ],
    exercises: [
      ex('L1-4-a', 'Notes first (wait mode)', 'Learn both phrases without time pressure.', 'treble', 'wait', seq('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2', 'RH', ODE_FINGERS), ['noteReadingTreble', 'pitchAccuracy']),
      ex('L1-4-b', 'Performance in time', 'Perform both phrases in time at 72 BPM. 80% to pass.', 'treble', 'timed', seq('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2', 'RH', ODE_FINGERS), ['rhythm', 'pitchAccuracy', 'noteReadingTreble'], { tempo: 72 }),
    ],
  },
  {
    id: 'L1-5', level: 1, title: 'Two notes at once and your first chords', prerequisites: ['L1-4'],
    summary: 'Play intervals and the C, F and G major chords. The app hears every note of the chord.',
    teach: [
      { title: 'Two keys, one moment', body: 'Press both keys at exactly the same time, like one sound. Start with C and E (fingers 1 and 3), then C and G (fingers 1 and 5).', show: [60, 64], play: [60, 64] },
      { title: 'The C major chord', body: 'Add the middle: C, E and G together is the C major chord, the home chord of the key of C. Fingers 1, 3 and 5. Keep the hand round and drop into the keys with relaxed arm weight.', show: [60, 64, 67], play: [60, 64, 67] },
      { title: 'F and G chords', body: 'Same shape, different place. F major is F-A-C. G major (with B on the bottom) is B-D-G here, a comfortable inversion for small hands. Hear C, then F, then G, then C.', show: [65, 69, 72], play: [60, 64, 67] },
      { title: 'Every note counts', body: 'The app listens for every note of the chord, through MIDI or your microphone. If one is missing or wrong it tells you which one. Coming next in Level 2: the left hand adds low C (C3) under the chord. Listen to how full that sounds.', show: [48, 60, 64, 67], play: [48, 60, 64, 67] },
    ],
    exercises: [
      ex('L1-5-a', 'Intervals: two notes at once', 'Play each pair together.', 'treble', 'wait', seq('C4+E4:2 C4+G4:2 D4+F4:2 E4+G4:2 C4+E4:4', 'RH', [[1, 3], [1, 5], [2, 4], [3, 5], [1, 3]]), ['pitchAccuracy', 'keyboardGeography'], { requiredPasses: 2 }),
      ex('L1-5-b', 'C, F and G chords', 'Play every note of each chord together.', 'treble', 'wait', seq('C4+E4+G4:4 C4+F4+A4:4 B3+D4+G4:4 C4+E4+G4:4', 'RH', [[1, 3, 5], [1, 2, 4], [1, 2, 5], [1, 3, 5]]), ['pitchAccuracy', 'keyboardGeography'], { requiredPasses: 2 }),
      ex('L1-5-c', 'Chords in time', 'Change chords on the beat at 60 BPM.', 'treble', 'timed', seq('C4+E4+G4:2 C4+E4+G4:2 C4+F4+A4:2 C4+F4+A4:2 B3+D4+G4:2 B3+D4+G4:2 C4+E4+G4:4', 'RH', [[1, 3, 5], [1, 3, 5], [1, 2, 4], [1, 2, 4], [1, 2, 5], [1, 2, 5], [1, 3, 5]]), ['rhythm', 'pitchAccuracy']),
    ],
  },
  // ---------------- Level 2: right-hand and left-hand technique ----------------
  {
    id: 'L2-1', level: 2, title: 'Right hand: finger independence', prerequisites: ['L1-4'],
    summary: 'Skip and step patterns that train each finger to move on its own while the others stay relaxed.',
    teach: [
      { title: 'Quiet hand, active fingers', body: 'Keep the wrist level and loose, fingers curved like holding a ball. Only the playing finger moves; the others rest lightly on their keys without pressing. If your 4th finger pulls the 5th along, slow down: that is exactly what this exercise trains.' },
      { title: 'Play from the knuckle', body: 'Lift each finger from the big knuckle, not by tensing the forearm. The fingertip stays firm (no collapsing first joint). Listen for every note being equally loud.', play: [60, 64, 62, 65, 64, 67], show: [60, 62, 64, 65, 67], sequential: true },
    ],
    exercises: [
      ex('L2-1-a', 'Skips: 1-3, 2-4, 3-5', 'Play the pattern evenly, fingers 1-3-2-4-3-5 and back.', 'treble', 'wait', seq('C4 E4 D4 F4 E4 G4 F4 D4 E4 C4', 'RH', [1, 3, 2, 4, 3, 5, 4, 2, 3, 1]), ['fingerTechnique', 'keyboardGeography'], { requiredPasses: 2 }),
      ex('L2-1-b', 'Even fingers in time', 'Same pattern as steady eighth notes at 72 BPM.', 'treble', 'timed', seq('C4:0.5 E4:0.5 D4:0.5 F4:0.5 E4:0.5 G4:0.5 F4:0.5 D4:0.5 E4:0.5 C4:0.5 D4:0.5 B3:0.5 C4:2', 'RH', [1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 1, 1]), ['fingerTechnique', 'rhythm'], { tempo: 72 }),
    ],
  },
  {
    id: 'L2-2', level: 2, title: 'Right hand: thumb under (C major scale)', prerequisites: ['L2-1'],
    summary: 'Pass the thumb under the 3rd finger to play a full octave smoothly.',
    teach: [
      { title: 'The thumb travels', body: 'Play C D E with fingers 1 2 3. While the 3rd finger holds E, slide the thumb under the hand to F. The hand then moves over smoothly: G A B C with 2 3 4 5. The elbow stays relaxed and the wrist does not twist.', play: [60, 62, 64, 65, 67, 69, 71, 72], show: [60, 62, 64, 65, 67, 69, 71, 72], sequential: true },
      { title: 'Coming down', body: 'Descending, the 3rd finger crosses over the thumb: C B A G F (5 4 3 2 1), then E D C with 3 2 1. Prepare the thumb early so there is no gap in the sound.' },
    ],
    exercises: [
      ex('L2-2-a', 'C scale up and down', 'Fingering 1-2-3-1-2-3-4-5, then 5-4-3-2-1-3-2-1.', 'treble', 'wait', seq('C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique', 'keyboardGeography'], { requiredPasses: 2 }),
      ex('L2-2-b', 'Scale in time, legato', 'Connected quarter notes at 66 BPM. Hold each key until the next sounds.', 'treble', 'timed', seq('C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4:2', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique', 'rhythm'], { tempo: 66 }),
    ],
  },
  {
    id: 'L2-3', level: 2, title: 'Right hand: staccato and broken chords', prerequisites: ['L2-2'],
    summary: 'Short bouncy notes, then chord notes played one after another.',
    teach: [
      { title: 'Staccato', body: 'A dot above or below a note means short and detached. Let the key spring back up right away with a light bounce from the wrist, like touching a hot surface. With a MIDI keyboard the app measures how long you hold each key.', play: [60, 64, 67, 64, 60], sequential: true },
      { title: 'Short note, short silence', body: 'Staccato notes are written here as an eighth note (half a beat) followed by an eighth rest (half a beat of silence, a little 7 with a dot). Say "ti" for the note and whisper "sh" for the rest.', rhythm: R('C4=ti s E4=ti s G4=ti s E4=ti s C4=ta-a', { bpm: 72 }) },
      { title: 'Broken chords', body: 'C-E-G played one after another is a broken C chord. Keep the hand shaped over all three keys so the fingers are already in place.' },
    ],
    exercises: [
      ex('L2-3-a', 'Staccato C-E-G', 'Short notes (eighth note + rest) in time at 72 BPM.', 'treble', 'timed', seq('C4:0.5 R:0.5 E4:0.5 R:0.5 G4:0.5 R:0.5 E4:0.5 R:0.5 C4:0.5 R:0.5 E4:0.5 R:0.5 G4:2', 'RH', [1, 0, 3, 0, 5, 0, 3, 0, 1, 0, 3, 0, 5]), ['fingerTechnique', 'rhythm'], { tempo: 72 }),
      ex('L2-3-b', 'Broken chords C, F, G, C', 'Keep the chord shape while playing the notes one at a time.', 'treble', 'wait', seq('C4 E4 G4 E4 C4 F4 A4 F4 B3 D4 G4 D4 C4 E4 G4:2', 'RH', [1, 3, 5, 3, 1, 2, 4, 2, 1, 2, 5, 2, 1, 3, 5]), ['fingerTechnique', 'pitchAccuracy']),
    ],
  },
  {
    id: 'L2-4', level: 2, title: 'Left hand: five-finger patterns', prerequisites: ['L1-3'],
    summary: 'Strengthen the left hand with step and skip patterns in C position.',
    teach: [
      { title: 'The left hand is a mirror', body: 'In the left hand the little finger (5) plays the lowest note. C position: 5 on C3, then 4 3 2 1 on D E F G. The weaker 4th and 5th fingers need the most care: keep them curved and let arm weight help.', play: [48, 50, 52, 53, 55], show: [48, 50, 52, 53, 55], sequential: true },
    ],
    exercises: [
      ex('L2-4-a', 'Skips 5-3, 4-2, 3-1', 'Play C E D F E G and back with 5-3-4-2-3-1.', 'bass', 'wait', seq('C3 E3 D3 F3 E3 G3 F3 D3 E3 C3', 'LH', [5, 3, 4, 2, 3, 1, 2, 4, 3, 5]), ['fingerTechnique', 'noteReadingBass'], { requiredPasses: 2 }),
      ex('L2-4-b', 'Left hand in time', 'Eighth notes at 66 BPM, every note equally loud.', 'bass', 'timed', seq('C3:0.5 D3:0.5 E3:0.5 F3:0.5 G3:0.5 F3:0.5 E3:0.5 D3:0.5 C3:2', 'LH', [5, 4, 3, 2, 1, 2, 3, 4, 5]), ['fingerTechnique', 'rhythm'], { tempo: 66 }),
    ],
  },
  {
    id: 'L2-5', level: 2, title: 'Left hand: cross over (C major scale)', prerequisites: ['L2-4'],
    summary: 'Cross the 3rd finger over the thumb to play a full octave in the left hand.',
    teach: [
      { title: 'Crossing over', body: 'Going up, play C D E F G with 5 4 3 2 1, then bring the 3rd finger over the thumb to A, and finish B C with 2 1. Going down, the thumb passes under the 3rd finger. Keep the wrist smooth and level.', play: [48, 50, 52, 53, 55, 57, 59, 60], show: [48, 50, 52, 53, 55, 57, 59, 60], sequential: true },
    ],
    exercises: [
      ex('L2-5-a', 'Left-hand C scale', 'Fingering 5-4-3-2-1-3-2-1 up, 1-2-3-1-2-3-4-5 down.', 'bass', 'wait', seq('C3 D3 E3 F3 G3 A3 B3 C4 B3 A3 G3 F3 E3 D3 C3', 'LH', [5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]), ['fingerTechnique', 'noteReadingBass'], { requiredPasses: 2 }),
    ],
  },
  {
    id: 'L2-6', level: 2, title: 'Left hand: accompaniment patterns', prerequisites: ['L2-5'],
    summary: 'Alberti bass and the waltz "oom-pah-pah": the left-hand patterns behind countless songs.',
    teach: [
      { title: 'Alberti bass', body: 'Low-high-middle-high: C G E G with fingers 5 1 3 1. The thumb is light, the bass note slightly stronger. This pattern accompanies melodies by Mozart, Haydn and many pop ballads.', play: [48, 55, 52, 55, 48, 55, 52, 55], show: [48, 52, 55], sequential: true },
      { title: 'Waltz bass', body: 'In 3/4: a low bass note on beat 1 ("oom"), then a soft chord on beats 2 and 3 ("pah pah"). Lean on beat 1 and keep the chords light.' },
    ],
    exercises: [
      ex('L2-6-a', 'Alberti bass C, G, C', 'Eighth notes at 63 BPM, fingers 5-1-3-1.', 'bass', 'timed', seq('C3:0.5 G3:0.5 E3:0.5 G3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 B2:0.5 G3:0.5 D3:0.5 G3:0.5 B2:0.5 G3:0.5 D3:0.5 G3:0.5 C3:2', 'LH', [5, 1, 3, 1, 5, 1, 3, 1, 5, 1, 3, 1, 5, 1, 3, 1, 5]), ['fingerTechnique', 'rhythm', 'noteReadingBass'], { tempo: 63 }),
      { ...ex('L2-6-b', 'Waltz bass (oom-pah-pah)', 'Low note, then two light chords, in 3/4 at 80 BPM.', 'bass', 'timed', seq('C3 E3+G3 E3+G3 C3 E3+G3 E3+G3 G2 F3+G3 F3+G3 C3 E3+G3 E3+G3', 'LH', [5, [3, 1], [3, 1], 5, [3, 1], [3, 1], 5, [2, 1], [2, 1], 5, [3, 1], [3, 1]]), ['fingerTechnique', 'rhythm'], { tempo: 80 }), timeSig: [3, 4] as [number, number] },
    ],
  },
  // ---------------- Vocal and sight-singing academy ----------------
  {
    id: 'V0-1', level: 0, track: 'voice', title: 'Find your voice: match one note', prerequisites: [],
    summary: 'Hear a note, sing it back, watch your pitch line land on the target.',
    teach: [
      { title: 'Stand or sit tall', body: 'Feet flat, shoulders loose, head balanced. Breathe in low and quietly through the nose, as if smelling a flower, so your belly and lower ribs widen. Never push or strain: singing in this app should always feel comfortable.' },
      { title: 'Listen first', body: 'Listen to the note, hum it quietly inside your head, then sing it on "loo" or "ah". Men can sing it an octave lower: the app accepts any octave of the right note.', play: [60], show: [60] },
      { title: 'One note, one beat', body: 'Each note you sing is written as a quarter note: one beat, "ta". You can take your time on each one; the app waits for you.', rhythm: R('C4=ta E4=ta G4=ta D4=ta', { bpm: 60 }) },
      { title: 'Watch your pitch line', body: 'While you sing, a line shows your pitch. Green means in tune, amber means close, red means off. If you are flat (below), think "up" and add a little more breath; if sharp, relax.' },
    ],
    exercises: [
      ex('V0-1-a', 'Match C, E, G, D', 'Sing each note back and hold it steady.', 'treble', 'wait', seq('C4 E4 G4 D4 C4'), ['pitchAccuracy'], { voice: true, octaveFree: true, inputs: ['mic'], requiredPasses: 2 }),
    ],
  },
  {
    id: 'V0-2', level: 0, track: 'voice', title: 'Do Re Mi: the first five notes', prerequisites: ['V0-1'],
    summary: 'Sing up and down the first five notes of the major scale with solfège.',
    teach: [
      { title: 'Solfège', body: 'Do Re Mi Fa Sol are names for the steps of the scale. Do is home. Each name has its own feeling: Mi is bright, Sol is strong, Re wants to fall back to Do.', play: [60, 62, 64, 65, 67, 65, 64, 62, 60], show: [60, 62, 64, 65, 67], sequential: true },
      { title: 'Short and long notes', body: 'Quarter notes last one beat ("ta"); the half note at the end of each run lasts two ("ta-a"). Hold it until the word ends.', rhythm: R('C4=ta D4=ta E4=ta F4=ta G4=ta-a-a-a', { bpm: 72 }) },
      { title: 'Small steps', body: 'Every step here is a small one (a whole step, except Mi to Fa, a half step). Keep the sound connected, one breath for each direction.' },
    ],
    exercises: [
      ex('V0-2-a', 'Do to Sol and back (no rush)', 'Sing each step in turn.', 'treble', 'wait', seq('C4 D4 E4 F4 G4 F4 E4 D4 C4'), ['pitchAccuracy'], { voice: true, octaveFree: true, inputs: ['mic'] }),
      ex('V0-2-b', 'Do to Sol in time', 'Sing with the beat at 60 BPM.', 'treble', 'timed', seq('C4 D4 E4 F4 G4:2 G4 F4 E4 D4 C4:2'), ['pitchAccuracy', 'rhythm'], { voice: true, octaveFree: true, inputs: ['mic'], timingToleranceMs: 450 }),
    ],
  },
  {
    id: 'V0-3', level: 0, track: 'voice', title: 'Leaps: thirds and fifths', prerequisites: ['V0-2'],
    summary: 'Jump between Do, Mi and Sol accurately: the notes of the major chord.',
    teach: [
      { title: 'Hear the jump before you sing it', body: 'Do-Mi is a third, Do-Sol is a fifth. Before each leap, imagine the target note silently, then sing it directly without sliding.', play: [60, 64, 67, 64, 60], show: [60, 64, 67], sequential: true },
    ],
    exercises: [
      ex('V0-3-a', 'Do Mi Sol Mi Do', 'Leap cleanly to each note.', 'treble', 'wait', seq('C4 E4 G4 E4 C4 G4 C4'), ['pitchAccuracy'], { voice: true, octaveFree: true, inputs: ['mic'], requiredPasses: 2 }),
    ],
  },
  {
    id: 'V0-4', level: 0, track: 'voice', title: 'Sight-sing a phrase', prerequisites: ['V0-3'],
    summary: 'Read a short melody from the staff and sing it in time.',
    teach: [
      { title: 'The rhythm first', body: 'This phrase mixes quarter notes ("ta"), a dotted quarter with an eighth ("ta-i ti", long-short) and a half note at the end ("ta-a"). Clap or say it before you sing.', rhythm: R('C4=ta E4=ta G4=ta-i E4=ti C4=ta-a', { bpm: 72 }) },
      { title: 'Read, then sing', body: 'Find Do (C) first. Look at the shape: steps or leaps, up or down. Tap the beat, then sing. You can press Demo to hear it, but try once without help first.' },
    ],
    exercises: [
      ex('V0-4-a', 'Phrase in time', 'Sing the phrase from the notation at 66 BPM.', 'treble', 'timed', seq('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2'), ['pitchAccuracy', 'rhythm', 'noteReadingTreble'], { voice: true, octaveFree: true, inputs: ['mic'], tempo: 66, timingToleranceMs: 450 }),
    ],
  },
];

const N = (s: string) => s.split(' ').map(nameToMidi);
/** Play-along mastery pieces for the first levels: you play only what the lesson taught. */
const BASE_PLAYALONG: Record<string, PlayAlongSpec> = {
  'L0-1': { keys: [C4], hand: 'RH', styles: ['echo', 'call', 'echo', 'tempo'], tempo: 80, values: [1, 2, 4] },
  'L0-2': { keys: N('C4 D4 E4 F4 G4'), hand: 'RH', styles: ['call', 'melody', 'melody'], values: [1, 2, 4] },
  'L0-3': { keys: N('C#4 D#4 F#4 G#4 A#4'), hand: 'RH', styles: ['echo', 'call'], values: [1, 2, 4] },
  'L0-4': { keys: [C4], hand: 'RH', styles: ['tempo', 'tempo'], tempo: 72, skills: ['pulse', 'rhythm'] },
  'L1-1': { keys: N('C4 D4 E4 F4 G4'), hand: 'RH', styles: ['melody', 'call'], hideLabels: true, skills: ['noteReadingTreble'] },
  'L1-2': { keys: N('C4 D4 E4 F4 G4'), hand: 'RH', styles: ['tempo', 'melody'], skills: ['rhythm'] },
  'L1-3': { keys: N('C3 D3 E3 F3 G3'), hand: 'LH', styles: ['call', 'melody', 'tempo'], skills: ['noteReadingBass'] },
  'L1-4': { keys: N('C4 D4 E4 F4 G4'), hand: 'RH', styles: ['melody', 'tempo'] },
  'L1-5': { keys: [], hand: 'RH', styles: ['chords', 'chords'], voicings: { 1: N('C4 E4 G4'), 4: N('C4 F4 A4'), 5: N('B3 D4 G4'), 6: N('C4 E4 A4'), 2: N('D4 F4 A4') } },
  'L2-1': { keys: N('C4 D4 E4 F4 G4'), hand: 'RH', styles: ['melody', 'tempo'], skills: ['fingerTechnique'] },
  'L2-2': { keys: N('C4 D4 E4 F4 G4 A4 B4 C5'), hand: 'RH', styles: ['melody', 'tempo'], skills: ['fingerTechnique'] },
  'L2-3': { keys: N('C4 E4 G4 C5'), hand: 'RH', styles: ['call', 'tempo'], skills: ['fingerTechnique'] },
  'L2-4': { keys: N('C3 D3 E3 F3 G3'), hand: 'LH', styles: ['melody', 'call'], skills: ['fingerTechnique'] },
  'L2-5': { keys: N('C3 D3 E3 F3 G3 A3 B3 C4'), hand: 'LH', styles: ['melody', 'tempo'], skills: ['fingerTechnique'] },
  'L2-6': { keys: N('C3 E3 G3 F3 A3 B2 D3'), hand: 'LH', styles: ['call', 'tempo'], skills: ['fingerTechnique'] },
};

// Play-alongs are written after the course is in teaching order, so each one uses only the note values
// taught by then (no eighths in lesson 0).
const PA = new Map<string, PlayAlongSpec>();
const withPlayAlong = (l: Lesson, spec?: PlayAlongSpec): Lesson => { if (spec) PA.set(l.id, spec); return l; };
const pianoBase = BASE_LESSONS.filter((l) => (l.track ?? 'piano') === 'piano').map((l) => withPlayAlong(l, BASE_PLAYALONG[l.id]));
const more = [...MORE_LESSONS, ...ADVANCED_LESSONS].map((l: LessonDef) => withPlayAlong(l, l.playAlong));
const pa = (l: LessonDef) => withPlayAlong(l, l.playAlong);
/** put new lessons right after the lesson they build on, so the path reads in teaching order */
function after(list: Lesson[], id: string, add: Lesson[]): Lesson[] {
  const i = list.findIndex((l) => l.id === id);
  return i < 0 ? [...list, ...add] : [...list.slice(0, i + 1), ...add, ...list.slice(i + 1)];
}
// the foundation, in order: sit well, note values, the staff, the keys, then one key in every value
let piano: Lesson[] = [pa(SETUP_LESSON), pa(VALUES_LESSON), pa(STAFF_LESSON), ...pianoBase, ...more, ...CHURCH_LESSONS.map(pa), ...STYLE_LESSONS.map(pa)];
piano = after(piano, 'L1-2', [pa(COUNT_LESSON)]);
piano = after(piano, 'L1-3', [pa(LANDMARK_LESSON)]);
piano = after(piano, 'L5-2', [pa(KEYSIG_LESSON)]);
piano = after(piano, 'L9-4', CRAFT_LESSONS.map(pa));
piano = after(piano, 'L4-5', RHYTHM_LESSONS.map(pa));
// teaching order: level by level (lessons added later to an earlier level slot in at the end of that level)
piano = piano.map((l, i) => [l, i] as const).sort((a, b) => a[0].level - b[0].level || a[1] - b[1]).map(([l]) => l);
{
  const taught = new Set<string>();
  const BEATS: Record<string, number> = { whole: 4, dottedHalf: 3, half: 2, dottedQuarter: 1.5, quarter: 1, dottedEighth: 0.75, eighth: 0.5, sixteenth: 0.25 };
  piano = piano.map((l) => {
    for (const s of l.teach) conceptsTaught(s).forEach((c) => taught.add(c));
    const spec = PA.get(l.id);
    if (!spec) return l;
    const known = Object.entries(BEATS).filter(([k]) => taught.has(`value:${k}`)).map(([, b]) => b);
    // a lesson can keep its piece simpler than everything taught so far
    const values = spec.values ? spec.values.filter((v) => known.includes(v)) : known;
    return { ...l, exercises: [...l.exercises, ...playAlongs(l.id, { ...spec, values: values.length ? values : [1] })] };
  });
}
// from here on, key lessons show their key signature
for (const l of piano) if (l.id === 'L5-3') l.exercises.forEach((e) => { if (!e.drill && e.fifths === undefined) e.fifths = 2; });
export const LESSONS: Lesson[] = [...piano, ...BASE_LESSONS.filter((l) => l.track === 'voice')];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const PIANO_LESSONS = LESSONS.filter((l) => (l.track ?? 'piano') === 'piano');
export const VOICE_LESSONS = LESSONS.filter((l) => l.track === 'voice');
export const ALL_EXERCISES = LESSONS.flatMap((l) => l.exercises);
