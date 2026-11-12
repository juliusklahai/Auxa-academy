// Levels 3 to 9: from hands together to advanced technique. Same lesson shape as Levels 0 to 2:
// SEE IT -> HEAR IT -> UNDERSTAND IT -> PLAY IT -> FEEDBACK -> CORRECT -> MASTER, and every lesson
// ends with play-along pieces (see playalong.ts) where the band plays and you play what you learned.

import { nameToMidi } from '../core/music';
import type { Clef, Exercise, Hand, Lesson, ScoreEvent, SkillId, TeachStep } from '../core/types';
import type { PlayAlongSpec } from './playalong';

/** "2", "0.5" or "1/3" (triplet eighth) as beats */
export const frac = (x: string) => (x.includes('/') ? Number(x.split('/')[0]) / Number(x.split('/')[1]) : parseFloat(x));

/** "C4:1 D4:1 E4:2 R:1 C4+E4+G4:4" -> events (name:beats, R = rest, + = chord). */
export function seqOf(spec: string, hand: Hand, fingers?: (number | number[])[]): ScoreEvent[] {
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

/** Both hands: right-hand and left-hand lines merged into one event list (chords across hands). */
export function hands(rh: string, lh: string): ScoreEvent[] {
  const all = [...seqOf(rh, 'RH'), ...seqOf(lh, 'LH')].filter((e) => e.pitches.length);
  const by = new Map<number, ScoreEvent>();
  for (const e of all) {
    const k = Math.round(e.beat * 1000);
    const cur = by.get(k);
    if (!cur) { by.set(k, { ...e, hands: e.pitches.map(() => e.hand!), hand: undefined, handBeats: { [e.hand!]: e.beats } }); continue; }
    cur.pitches.push(...e.pitches);
    cur.hands!.push(...e.pitches.map(() => e.hand!));
    cur.beats = Math.min(cur.beats, e.beats);
    cur.handBeats![e.hand!] = Math.min(cur.handBeats![e.hand!] ?? Infinity, e.beats);
  }
  const evs = [...by.values()].sort((a, b) => a.beat - b.beat);
  for (const e of evs) {
    const o = e.pitches.map((p, i) => [p, e.hands![i]] as const).sort((a, b) => a[0] - b[0]);
    e.pitches = o.map((x) => x[0]); e.hands = o.map((x) => x[1]);
    if (new Set(e.hands).size === 1) { e.hand = e.hands[0]; e.hands = undefined; e.handBeats = undefined; }
  }
  return evs;
}

function ex(id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[], skills: SkillId[], opts: Partial<Exercise> = {}): Exercise {
  return { id, title, objective, clef, mode, events, skills, tempo: 72, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], ...opts };
}

export interface LessonDef extends Lesson { playAlong?: PlayAlongSpec }

const t = (title: string, body: string, show?: number[], play?: number[], sequential = true): TeachStep => ({ title, body, show, play, sequential });
const N = (s: string) => s.split(' ').map(nameToMidi);
const C_POS_RH = N('C4 D4 E4 F4 G4');
const C_POS_LH = N('C3 D3 E3 F3 G3');
const RH_OCT = N('C4 D4 E4 F4 G4 A4 B4 C5');

export const LEVEL_NAMES: Record<number, string> = {
  0: 'Foundations', 1: 'First notes and melodies', 2: 'Right and left hand technique', 3: 'Grand staff and both hands',
  4: 'Rhythm', 5: 'Keys and scales', 6: 'Chords and accompaniment', 7: 'Expression and touch', 8: 'Sight-reading and intervals', 9: 'Advanced technique',
  10: 'Playing by ear', 11: 'Jazz piano', 12: 'Four-part writing and arranging', 13: 'Church musician',
};
export const LEVEL_GROUP: Record<number, string> = { 0: 'Beginner', 1: 'Beginner', 2: 'Beginner', 3: 'Elementary', 4: 'Elementary', 5: 'Intermediate', 6: 'Intermediate', 7: 'Intermediate', 8: 'Advanced', 9: 'Advanced', 10: 'Play by ear', 11: 'Jazz', 12: 'Arranging', 13: 'Church' };

export const MORE_LESSONS: LessonDef[] = [
  // ---------------- Level 3: grand staff and both hands ----------------
  {
    id: 'L3-1', level: 3, title: 'The grand staff', prerequisites: ['L1-3', 'L2-4'],
    summary: 'Read treble and bass together and pass a melody between the hands.',
    teach: [
      t('Two staves, one piano', 'Piano music joins a treble staff (right hand, usually) and a bass staff (left hand) with a brace. Middle C sits between them: one ledger line below the treble or one above the bass. It is the same key.', [60], [48, 60, 72]),
      t('Who plays what', 'Notes on the top staff are for the right hand, notes on the bottom staff for the left. Look at which staff a note is on before you think about its name.', [48, 52, 55, 60, 64, 67]),
    ],
    exercises: [
      ex('L3-1-a', 'Middle C from both sides', 'Alternate RH C4 (finger 1) and LH C4 (finger 1) reading the grand staff.', 'treble', 'wait', hands('C4:2 R:2 C4:2 R:2', 'R:2 C4:2 R:2 C4:2'), ['noteReadingTreble', 'noteReadingBass'], { grand: true }),
      ex('L3-1-b', 'Treble or bass?', 'Notes jump between the staves: play each with the hand of its staff.', 'treble', 'wait', hands('E4:1 R:1 G4:1 R:1 D4:1 R:1 F4:1 R:1', 'R:1 C3:1 R:1 G3:1 R:1 E3:1 R:1 D3:1'), ['noteReadingTreble', 'noteReadingBass'], { grand: true, hideLabels: true }),
    ],
    playAlong: { keys: [...C_POS_RH.slice(0, 3), ...C_POS_LH.slice(0, 3)], hand: 'both', styles: ['call', 'melody'], skills: ['noteReadingTreble', 'noteReadingBass'] },
  },
  {
    id: 'L3-2', level: 3, title: 'Melody over a held bass', prerequisites: ['L3-1'],
    summary: 'Right hand moves while the left hand holds long notes.',
    teach: [
      t('One hand moves, one holds', 'The left hand plays one long note and keeps it down while the right hand plays the tune. Press the left key, then forget about it: the right hand leads.', [48, 60, 62, 64], [48, 60, 62, 64, 65]),
      t('Count the long note', 'A whole note lasts four beats. Count "1 2 3 4" while the right hand moves, and release the left hand exactly when the next bass note comes.'),
    ],
    exercises: [
      ex('L3-2-a', 'C position with a bass C', 'RH C D E F G over a held LH C3.', 'treble', 'wait', hands('C4 D4 E4 F4 G4:4', 'C3:4 G2:4'), ['fingerTechnique'], { grand: true }),
      ex('L3-2-b', 'Ode to Joy with bass', 'First phrase of Ode to Joy over whole-note C and G.', 'treble', 'timed', hands('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2', 'C3:4 G2:4 C3:4 G2:4'), ['rhythm', 'fingerTechnique'], { grand: true, tempo: 66 }),
    ],
    playAlong: { keys: [...C_POS_RH, 48], hand: 'both', styles: ['melody', 'call', 'tempo'] },
  },
  {
    id: 'L3-3', level: 3, title: 'Parallel and contrary motion', prerequisites: ['L3-2'],
    summary: 'Both hands play together, moving the same way and in opposite directions.',
    teach: [
      t('Parallel motion', 'Both hands go the same direction. RH starts on C4 with finger 1, LH on C3 with finger 5. Moving up, the right hand uses 1 2 3 4 5 and the left 5 4 3 2 1: different numbers, same direction.', [48, 60], [48, 60, 50, 62, 52, 64]),
      t('Contrary motion', 'Now mirror image: both thumbs start on middle C and the hands move away from each other. The finger numbers match (1 2 3 4 5 in both), which feels natural to the brain.', [60], [60, 62, 59, 64, 57]),
    ],
    exercises: [
      ex('L3-3-a', 'Parallel five-finger', 'C D E F G in both hands together, an octave apart.', 'treble', 'wait', hands('C4 D4 E4 F4 G4 F4 E4 D4 C4', 'C3 D3 E3 F3 G3 F3 E3 D3 C3'), ['fingerTechnique'], { grand: true }),
      ex('L3-3-b', 'Contrary from middle C', 'RH goes up, LH goes down, both start with the thumb.', 'treble', 'wait', hands('C4 D4 E4 F4 G4 F4 E4 D4 C4', 'C4 B3 A3 G3 F3 G3 A3 B3 C4'), ['fingerTechnique'], { grand: true }),
    ],
    playAlong: { keys: [...C_POS_RH, ...C_POS_LH], hand: 'both', styles: ['melody', 'tempo'] },
  },
  {
    id: 'L3-4', level: 3, title: 'Hands together: chords under a tune', prerequisites: ['L3-3', 'L1-5'],
    summary: 'Left hand plays C, F and G chords while the right hand plays a melody.',
    teach: [
      t('Left-hand chords', 'C chord (C E G), F chord (C F A) and G chord (B D G) with fingers 5 3 1, 5 2 1 and 5 3 1. These shapes move very little, so the left hand can work without looking.', [48, 52, 55], [48, 52, 55]),
      t('Play on the downbeat', 'Change the chord on beat 1 of the bar, exactly with the melody note. Practice the left hand alone first, then add the right hand slowly.'),
    ],
    exercises: [
      ex('L3-4-a', 'Chord changes', 'LH C - F - G - C chords, one bar each.', 'bass', 'wait', seqOf('C3+E3+G3:4 C3+F3+A3:4 B2+D3+G3:4 C3+E3+G3:4', 'LH', [[5, 3, 1], [5, 2, 1], [5, 3, 1], [5, 3, 1]]), ['fingerTechnique']),
      ex('L3-4-b', 'Melody with chords', 'RH melody over the LH chords.', 'treble', 'wait', hands('E4 D4 C4 E4 F4 A4 G4 F4 G4 F4 E4 D4 C4:4', 'C3+E3+G3:4 C3+F3+A3:4 B2+D3+G3:4 C3+E3+G3:4'), ['fingerTechnique'], { grand: true }),
    ],
    playAlong: { keys: [], hand: 'LH', styles: ['chords', 'chords'], voicings: { 1: N('C3 E3 G3'), 4: N('C3 F3 A3'), 5: N('B2 D3 G3'), 6: N('C3 E3 A3'), 2: N('D3 F3 A3') } },
  },
  // ---------------- Level 4: rhythm ----------------
  {
    id: 'L4-1', level: 4, title: 'Eighth notes', prerequisites: ['L3-1'],
    summary: 'Two notes per beat: count "1 and 2 and".',
    teach: [
      t('Half a beat', 'An eighth note lasts half a beat. Two eighths share one beat and are joined by a beam. Count "1 and 2 and 3 and 4 and": the number is the beat, the "and" is the second eighth.', [60, 62], [60, 60, 62, 62, 64, 64, 65, 65]),
      t('Steady, not rushed', 'The beat stays the same speed; eighths simply fill it with two notes. Most people rush them, so count out loud and let the metronome lead.'),
    ],
    exercises: [
      ex('L4-1-a', 'Quarters and eighths', 'Mix quarters and eighths on C D E.', 'treble', 'timed', seqOf('C4:1 C4:0.5 C4:0.5 D4:1 D4:0.5 D4:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:2', 'RH'), ['rhythm', 'pulse'], { tempo: 66 }),
      ex('L4-1-b', 'Running eighths', 'C position up and down in eighths.', 'treble', 'timed', seqOf('C4:0.5 D4:0.5 E4:0.5 F4:0.5 G4:0.5 F4:0.5 E4:0.5 D4:0.5 C4:2', 'RH', [1, 2, 3, 4, 5, 4, 3, 2, 1]), ['rhythm'], { tempo: 60 }),
    ],
    playAlong: { keys: C_POS_RH, hand: 'RH', styles: ['tempo', 'melody'], skills: ['rhythm', 'pulse'] },
  },
  {
    id: 'L4-2', level: 4, title: 'Dotted rhythms', prerequisites: ['L4-1'],
    summary: 'A dot adds half the value: dotted half, dotted quarter.',
    teach: [
      t('The dot', 'A dot after a note adds half of its value. Dotted half = 2 + 1 = 3 beats. Dotted quarter = 1 + 1/2 = 1 and a half beats, usually followed by an eighth: "long ... short".', [60], [60, 62, 64]),
      t('Feel it', 'Dotted quarter + eighth sounds like "Ta-a ti". You know it from "Auld Lang Syne" and Ode to Joy (bar 4). Count "1 (2) and" for the long note and play the eighth on the "and".'),
    ],
    exercises: [
      ex('L4-2-a', 'Dotted quarter and eighth', 'Long-short patterns on C D E.', 'treble', 'timed', seqOf('C4:1.5 D4:0.5 E4:2 E4:1.5 D4:0.5 C4:2', 'RH'), ['rhythm'], { tempo: 66 }),
      ex('L4-2-b', 'Dotted half', 'Three-beat notes in 3/4.', 'treble', 'timed', seqOf('C4:3 E4:3 G4:2 E4:1 C4:3', 'RH'), ['rhythm'], { tempo: 80, timeSig: [3, 4] }),
    ],
    playAlong: { keys: C_POS_RH, hand: 'RH', styles: ['melody', 'tempo'], skills: ['rhythm'] },
  },
  {
    id: 'L4-3', level: 4, title: 'Rests and silence', prerequisites: ['L4-1'],
    summary: 'Silence is counted exactly like sound.',
    teach: [
      t('Rests', 'Every note value has a rest of the same length: quarter rest, half rest (a hat sitting on the line), whole rest (a hole hanging under the line). During a rest, lift the hand and keep counting.'),
      t('Count through it', 'The most common mistake is coming in early after a rest. Say the rest beats out loud: "1 2 (3) (4)".'),
    ],
    exercises: [
      ex('L4-3-a', 'Play and wait', 'Notes and quarter rests.', 'treble', 'timed', seqOf('C4:1 R:1 E4:1 R:1 G4:1 R:1 E4:1 R:1 C4:2 R:2', 'RH'), ['rhythm', 'pulse'], { tempo: 72 }),
    ],
    playAlong: { keys: [60, 64, 67], hand: 'RH', styles: ['echo', 'tempo'], skills: ['rhythm'] },
  },
  {
    id: 'L4-4', level: 4, title: 'Three-four time: the waltz', prerequisites: ['L4-2'],
    summary: 'Three beats in a bar, strong first beat.',
    teach: [
      t('ONE two three', 'In 3/4 there are three quarter beats per bar and the first is the strongest. Waltzes, many hymns and lullabies live in 3/4.'),
      t('Oom-pah-pah', 'Left hand: a low note on beat 1, a light chord on 2 and 3. Right hand: the tune on top.', [48, 52, 55], [48, 52, 55, 52, 55]),
    ],
    exercises: [
      ex('L4-4-a', 'Waltz bass', 'LH oom-pah-pah on C and G.', 'bass', 'timed', seqOf('C3 E3+G3 E3+G3 G2 D3+F3 D3+F3 C3 E3+G3 E3+G3 C3:3', 'LH'), ['rhythm', 'pulse'], { tempo: 84, timeSig: [3, 4] }),
    ],
    playAlong: { keys: C_POS_RH, hand: 'RH', styles: ['melody', 'tempo'], beats: 3, skills: ['rhythm'] },
  },
  {
    id: 'L4-5', level: 4, title: 'Ties and syncopation', prerequisites: ['L4-3'],
    summary: 'Notes that start off the beat and hold across it.',
    teach: [
      t('Ties', 'A curved line joining two notes of the same pitch makes one long note: play the first, hold through the second.'),
      t('Off-beat accents', 'Syncopation puts a note on the "and" and holds it over the next beat. It is the heartbeat of pop, gospel, jazz and Latin music. Count the eighths: "1 and 2 and".'),
    ],
    exercises: [
      ex('L4-5-a', 'On the "and"', 'Notes start on the off-beat.', 'treble', 'timed', seqOf('C4:1 E4:0.5 G4:1.5 E4:1 C4:0.5 D4:1.5 E4:1 C4:3', 'RH'), ['rhythm'], { tempo: 66 }),
    ],
    playAlong: { keys: [60, 62, 64, 67], hand: 'RH', styles: ['tempo', 'melody'], skills: ['rhythm'] },
  },
  // ---------------- Level 5: keys and scales ----------------
  {
    id: 'L5-1', level: 5, title: 'G major: meet F sharp', prerequisites: ['L2-2', 'L4-1'],
    summary: 'The G major scale and its one sharp.',
    teach: [
      t('Key signature', 'G major has one sharp: F#. The sharp at the start of every line means every F is played as F#, unless a natural sign cancels it.', [66], N('G4 A4 B4 C5 D5 E5 F#5 G5')),
      t('Fingering', 'Same as C major: RH 1 2 3 1 2 3 4 5, LH 5 4 3 2 1 3 2 1. F# is played by finger 4 in the right hand.', N('G4 A4 B4 C5 D5 E5 F#5 G5')),
    ],
    exercises: [
      ex('L5-1-a', 'G major scale RH', 'One octave up and down.', 'treble', 'wait', seqOf('G4 A4 B4 C5 D5 E5 F#5 G5 F#5 E5 D5 C5 B4 A4 G4', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique', 'keyboardGeography']),
      ex('L5-1-b', 'G major scale LH', 'One octave, left hand.', 'bass', 'wait', seqOf('G2 A2 B2 C3 D3 E3 F#3 G3 F#3 E3 D3 C3 B2 A2 G2', 'LH', [5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]), ['fingerTechnique']),
    ],
    playAlong: { keys: N('G4 A4 B4 C5 D5'), hand: 'RH', styles: ['melody', 'call', 'tempo'] },
  },
  {
    id: 'L5-2', level: 5, title: 'F major: meet B flat', prerequisites: ['L5-1'],
    summary: 'The F major scale, one flat and a special fingering.',
    teach: [
      t('A flat lowers', 'A flat (b) means the very next key to the LEFT. F major has one flat: Bb, the black key between A and B.', [70], N('F4 G4 A4 Bb4 C5 D5 E5 F5')),
      t('Fingering changes', 'The right hand crosses after the 4th finger: 1 2 3 4 1 2 3 4, so the thumb never lands on Bb.', N('F4 G4 A4 Bb4 C5 D5 E5 F5')),
    ],
    exercises: [
      ex('L5-2-a', 'F major scale RH', 'One octave with 1 2 3 4 1 2 3 4.', 'treble', 'wait', seqOf('F4 G4 A4 Bb4 C5 D5 E5 F5 E5 D5 C5 Bb4 A4 G4 F4', 'RH', [1, 2, 3, 4, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1]), ['fingerTechnique', 'keyboardGeography']),
    ],
    playAlong: { keys: N('F4 G4 A4 Bb4 C5'), hand: 'RH', styles: ['melody', 'call'] },
  },
  {
    id: 'L5-3', level: 5, title: 'D major and two sharps', prerequisites: ['L5-1'],
    summary: 'F# and C#: the key of many violin and gospel songs.',
    teach: [
      t('Two sharps', 'D major: D E F# G A B C# D. The sharps always appear in the same order (F C G D A E B), so a signature of two sharps means F# and C#.', [66, 73], N('D4 E4 F#4 G4 A4 B4 C#5 D5')),
    ],
    exercises: [
      ex('L5-3-a', 'D major scale RH', 'One octave, 1 2 3 1 2 3 4 5.', 'treble', 'wait', seqOf('D4 E4 F#4 G4 A4 B4 C#5 D5 C#5 B4 A4 G4 F#4 E4 D4', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique']),
    ],
    playAlong: { keys: N('D4 E4 F#4 G4 A4'), hand: 'RH', styles: ['melody', 'tempo'] },
  },
  {
    id: 'L5-4', level: 5, title: 'A minor', prerequisites: ['L5-1'],
    summary: 'The relative minor of C: natural and harmonic forms.',
    teach: [
      t('Same notes, new home', 'A natural minor uses the white keys from A to A. It shares C major\'s signature (no sharps or flats), so it is C\'s "relative minor". It sounds darker because the home note is A.', [57], N('A3 B3 C4 D4 E4 F4 G4 A4')),
      t('Harmonic minor', 'Raise the 7th note: G becomes G#. That gives a strong pull back to A, the sound of many folk, classical and film themes.', [68], N('A3 B3 C4 D4 E4 F4 G#4 A4')),
    ],
    exercises: [
      ex('L5-4-a', 'A natural minor', 'RH one octave from A3.', 'treble', 'wait', seqOf('A3 B3 C4 D4 E4 F4 G4 A4 G4 F4 E4 D4 C4 B3 A3', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique']),
      ex('L5-4-b', 'A harmonic minor', 'With G sharp.', 'treble', 'wait', seqOf('A3 B3 C4 D4 E4 F4 G#4 A4 G#4 F4 E4 D4 C4 B3 A3', 'RH', [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique']),
    ],
    playAlong: { keys: N('A3 B3 C4 D4 E4'), hand: 'RH', styles: ['melody', 'call'] },
  },
  {
    id: 'L5-5', level: 5, title: 'The chromatic scale', prerequisites: ['L5-2'],
    summary: 'Every key, black and white, in order.',
    teach: [
      t('All twelve', 'The chromatic scale moves by half steps: every key. RH fingering: 3 on every black key, 1 on white keys, and 2 only between E-F and B-C.', undefined, N('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5')),
    ],
    exercises: [
      ex('L5-5-a', 'Chromatic octave', 'C to C, every key.', 'treble', 'wait', seqOf('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5', 'RH', [1, 3, 1, 3, 1, 2, 3, 1, 3, 1, 3, 1, 2]), ['fingerTechnique', 'keyboardGeography']),
    ],
  },
  // ---------------- Level 6: chords and accompaniment ----------------
  {
    id: 'L6-1', level: 6, title: 'Primary chords: I, IV and V', prerequisites: ['L5-1', 'L3-4'],
    summary: 'The three chords that harmonize most songs.',
    teach: [
      t('Built on scale steps', 'Stack every other note of the scale to make a triad. On steps 1, 4 and 5 of C major you get C (I), F (IV) and G (V). Thousands of songs use only these three.', N('C4 E4 G4'), N('C4 E4 G4')),
      t('Hear the pull', 'I is home, IV moves away gently, V creates tension that wants to return to I.', undefined, N('C4 E4 G4 F4 A4 C5 G4 B4 D5 C4 E4 G4')),
    ],
    exercises: [
      ex('L6-1-a', 'I - IV - V - I in C', 'Root-position triads, RH 1 3 5.', 'treble', 'wait', seqOf('C4+E4+G4:2 F4+A4+C5:2 G4+B4+D5:2 C4+E4+G4:2', 'RH', [[1, 3, 5], [1, 3, 5], [1, 3, 5], [1, 3, 5]]), ['fingerTechnique']),
      ex('L6-1-b', 'I - IV - V - I in G', 'The same progression in G major.', 'treble', 'wait', seqOf('G4+B4+D5:2 C5+E5+G5:2 D5+F#5+A5:2 G4+B4+D5:2', 'RH'), ['fingerTechnique']),
    ],
    playAlong: { keys: [], hand: 'RH', styles: ['chords', 'chords', 'chords'], voicings: { 1: N('C4 E4 G4'), 4: N('C4 F4 A4'), 5: N('B3 D4 G4'), 6: N('C4 E4 A4'), 2: N('D4 F4 A4') } },
  },
  {
    id: 'L6-2', level: 6, title: 'Inversions', prerequisites: ['L6-1'],
    summary: 'Rearrange chord notes for smooth, close movement.',
    teach: [
      t('Same chord, different bottom', 'C E G is root position. E G C is 1st inversion, G C E is 2nd inversion. All are C major. Inversions let the hand move only a key or two between chords.', N('C4 E4 G4'), N('C4 E4 G4 E4 G4 C5 G4 C5 E5')),
    ],
    exercises: [
      ex('L6-2-a', 'C chord inversions', 'Root, 1st, 2nd and back.', 'treble', 'wait', seqOf('C4+E4+G4:2 E4+G4+C5:2 G4+C5+E5:2 E4+G4+C5:2 C4+E4+G4:4', 'RH', [[1, 3, 5], [1, 2, 5], [1, 3, 5], [1, 2, 5], [1, 3, 5]]), ['fingerTechnique']),
      ex('L6-2-b', 'Smooth I-IV-V-I', 'C, F/C and G/B: the hand barely moves.', 'treble', 'wait', seqOf('C4+E4+G4:2 C4+F4+A4:2 B3+D4+G4:2 C4+E4+G4:2', 'RH', [[1, 3, 5], [1, 2, 4], [1, 2, 5], [1, 3, 5]]), ['fingerTechnique']),
    ],
    playAlong: { keys: [], hand: 'RH', styles: ['chords', 'chords'], voicings: { 1: N('E4 G4 C5'), 4: N('F4 A4 C5'), 5: N('D4 G4 B4'), 6: N('E4 A4 C5'), 2: N('D4 F4 A4') } },
  },
  {
    id: 'L6-3', level: 6, title: 'Minor chords and the pop progression', prerequisites: ['L6-2'],
    summary: 'I - V - vi - IV: the chords behind countless songs.',
    teach: [
      t('Minor triads', 'Lower the middle note of a major chord by a half step and it becomes minor: C E G -> C Eb G. In C major the minor chords are Dm, Em and Am.', N('A3 C4 E4'), N('A3 C4 E4')),
      t('I - V - vi - IV', 'C, G, Am, F. Play it slowly and you will recognize many songs. The left hand plays the roots, the right hand the chords.', undefined, N('C4 E4 G4 B3 D4 G4 A3 C4 E4 A3 C4 F4')),
    ],
    exercises: [
      ex('L6-3-a', 'Pop progression, both hands', 'LH roots, RH close chords.', 'treble', 'wait', hands('C4+E4+G4:4 B3+D4+G4:4 A3+C4+E4:4 A3+C4+F4:4', 'C3:4 G2:4 A2:4 F2:4'), ['fingerTechnique'], { grand: true }),
    ],
    playAlong: { keys: [], hand: 'RH', styles: ['chords', 'chords'], voicings: { 1: N('C4 E4 G4'), 5: N('B3 D4 G4'), 6: N('A3 C4 E4'), 4: N('A3 C4 F4'), 2: N('A3 D4 F4') } },
  },
  {
    id: 'L6-4', level: 6, title: 'Broken chords and arpeggiated accompaniment', prerequisites: ['L6-3', 'L2-6'],
    summary: 'Turn block chords into flowing patterns.',
    teach: [
      t('Spread it out', 'Instead of pressing C E G together, play them one by one: C G E G, or C G C E. The pedal (or your fingers holding keys) keeps the harmony ringing.', N('C3 G3 E4'), N('C3 G3 C4 E4 C4 G3')),
    ],
    exercises: [
      ex('L6-4-a', 'LH pattern 1-5-8', 'Root, fifth, octave for C, F, G, C.', 'bass', 'timed', seqOf('C3:1 G3:1 C4:2 F2:1 C3:1 F3:2 G2:1 D3:1 G3:2 C3:1 G3:1 C4:2', 'LH', [5, 2, 1, 5, 2, 1, 5, 2, 1, 5, 2, 1]), ['fingerTechnique', 'rhythm'], { tempo: 72 }),
    ],
    playAlong: { keys: N('C3 G3 F2 G2 D3 A2 E3'), hand: 'LH', styles: ['call', 'tempo'] },
  },
  // ---------------- Level 7: expression and touch ----------------
  {
    id: 'L7-1', level: 7, title: 'Dynamics: soft and loud', prerequisites: ['L4-4'],
    summary: 'p, mf, f, crescendo and diminuendo.',
    teach: [
      t('Volume is touch', 'p (piano) = soft, mf = medium, f (forte) = loud. On the piano, loudness comes from the speed of the key, not from pushing harder after it is down. With a MIDI keyboard the app measures how hard you play.'),
      t('Shape a phrase', 'Crescendo (<) grows louder, diminuendo (>) grows softer. Most phrases rise toward their highest note and relax at the end, like a sentence.'),
    ],
    exercises: [
      ex('L7-1-a', 'Echo soft and loud', 'Play the phrase loud, then echo it softly.', 'treble', 'timed', seqOf('C4 E4 G4 E4 C4:2 R:2 C4 E4 G4 E4 C4:2 R:2', 'RH'), ['rhythm'], { tempo: 72 }),
    ],
    playAlong: { keys: C_POS_RH, hand: 'RH', styles: ['melody'] },
  },
  {
    id: 'L7-2', level: 7, title: 'Legato and staccato', prerequisites: ['L7-1'],
    summary: 'Connected and detached touch.',
    teach: [
      t('Legato', 'Connect each note to the next: the next key goes down exactly as the previous one comes up. No gaps, no overlaps.'),
      t('Staccato', 'Short and light: let the key bounce back immediately. With MIDI the app measures how long you hold each key and reports it.'),
    ],
    exercises: [
      ex('L7-2-a', 'Legato line', 'Smooth C major up and down.', 'treble', 'timed', seqOf('C4 D4 E4 F4 G4:2 F4 E4 D4 C4:3', 'RH', [1, 2, 3, 4, 5, 4, 3, 2, 1]), ['fingerTechnique'], { tempo: 66 }),
      ex('L7-2-b', 'Staccato bounce', 'Short notes with rests between.', 'treble', 'timed', seqOf('C4:0.5 R:0.5 E4:0.5 R:0.5 G4:0.5 R:0.5 E4:0.5 R:0.5 C4:1 R:1', 'RH'), ['rhythm'], { tempo: 80 }),
    ],
    playAlong: { keys: RH_OCT, hand: 'RH', styles: ['melody', 'tempo'] },
  },
  {
    id: 'L7-3', level: 7, title: 'Pedal and phrasing', prerequisites: ['L7-2', 'L6-4'],
    summary: 'The sustain pedal and breathing in music.',
    teach: [
      t('The sustain pedal', 'The right pedal lets strings keep ringing. Change it with each chord: lift as you play the new chord, press again just after. (The app does not score pedal from the microphone yet; listen for blur.)'),
      t('Phrases breathe', 'A phrase is a musical sentence, often 2 or 4 bars. Shape it, and make a tiny breath between phrases.'),
    ],
    exercises: [
      ex('L7-3-a', 'Chords with a breath', 'Four chords, slight lift before each new one.', 'treble', 'timed', hands('C4+E4+G4:4 A3+C4+F4:4 B3+D4+G4:4 C4+E4+G4:4', 'C3:4 F2:4 G2:4 C3:4'), ['fingerTechnique'], { grand: true, tempo: 60 }),
    ],
    playAlong: { keys: [], hand: 'RH', styles: ['chords'], voicings: { 1: N('C4 E4 G4'), 4: N('A3 C4 F4'), 5: N('B3 D4 G4'), 6: N('A3 C4 E4'), 2: N('A3 D4 F4') } },
  },
  // ---------------- Level 8: sight-reading and intervals ----------------
  {
    id: 'L8-1', level: 8, title: 'Intervals: 2nds to 5ths', prerequisites: ['L5-1'],
    summary: 'Read by distance, not letter by letter.',
    teach: [
      t('Count the steps', 'A 2nd is line to space (neighbors). A 3rd is line to line or space to space. A 4th and 5th are bigger skips. Good readers see the shape and jump straight there.', N('C4 E4'), N('C4 D4 C4 E4 C4 F4 C4 G4')),
    ],
    exercises: [
      ex('L8-1-a', 'Interval reading', 'Name-free: play by distance.', 'treble', 'wait', seqOf('C4 E4 D4 G4 E4 A4 F4 C5 G4 C4', 'RH'), ['noteReadingTreble'], { hideLabels: true }),
    ],
    playAlong: { keys: RH_OCT, hand: 'RH', styles: ['melody', 'call'], hideLabels: true, skills: ['noteReadingTreble'] },
  },
  {
    id: 'L8-2', level: 8, title: 'Ledger lines and wide range', prerequisites: ['L8-1'],
    summary: 'Read above and below the staff.',
    teach: [
      t('Little extra lines', 'Ledger lines extend the staff. Count them from the staff outward, or use landmarks: middle C (one ledger below treble), high C (two above), low C (two below bass).', [84, 36], [36, 60, 84]),
    ],
    exercises: [
      ex('L8-2-a', 'High and low', 'Notes on ledger lines.', 'treble', 'wait', seqOf('C6 A5 B5 G5 C5 D6 E5 C6', 'RH'), ['noteReadingTreble'], { hideLabels: true }),
      ex('L8-2-b', 'Low bass', 'Ledger lines below the bass staff.', 'bass', 'wait', seqOf('C2 E2 D2 G2 F2 C2', 'LH'), ['noteReadingBass'], { hideLabels: true }),
    ],
  },
  {
    id: 'L8-3', level: 8, title: 'Sight-reading drills', prerequisites: ['L8-1', 'L3-3'],
    summary: 'New music at first sight, hands together.',
    teach: [
      t('Before you play', 'Look for the key signature, time signature, lowest and highest notes, and repeated patterns. Set a slow tempo you can keep without stopping. Keep going even after a mistake: in sight-reading, rhythm beats perfection.'),
    ],
    exercises: [
      ex('L8-3-a', 'First sight: hands together', 'Eight bars you have not seen.', 'treble', 'timed', hands('E4 G4 F4 D4 C4 E4 D4:2 E4 F4 G4 A4 G4 F4 E4:2', 'C3:2 G2:2 C3:2 G2:2 C3:2 F2:2 C3:4'), ['noteReadingTreble', 'noteReadingBass', 'rhythm'], { grand: true, tempo: 60, hideLabels: true }),
    ],
    playAlong: { keys: [...C_POS_RH, ...C_POS_LH], hand: 'both', styles: ['melody', 'tempo', 'call'], hideLabels: true },
  },
  // ---------------- Level 9: advanced technique ----------------
  {
    id: 'L9-1', level: 9, title: 'Two-octave scales, hands together', prerequisites: ['L5-3', 'L3-3'],
    summary: 'C major two octaves, both hands, with crossings in time.',
    teach: [
      t('Crossings at different moments', 'Hands together, the thumbs cross at different places: RH after E and B (fingers 3 and 4), LH after G and A. Practice hands separately until each is automatic, then together very slowly.'),
    ],
    exercises: [
      ex('L9-1-a', 'C major 2 octaves', 'Hands together, ascending and descending.', 'treble', 'wait',
        hands('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 B5 A5 G5 F5 E5 D5 C5 B4 A4 G4 F4 E4 D4 C4', 'C3 D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4 B3 A3 G3 F3 E3 D3 C3'),
        ['fingerTechnique'], { grand: true }),
    ],
    playAlong: { keys: [...N('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5'), ...N('C3 D3 E3 F3 G3 A3 B3')], hand: 'both', styles: ['tempo', 'melody'] },
  },
  {
    id: 'L9-2', level: 9, title: 'Arpeggios', prerequisites: ['L9-1'],
    summary: 'Broken chords across the keyboard.',
    teach: [
      t('Thumb under, wider', 'An arpeggio plays the chord notes one after another over two octaves: C E G C E G C. RH fingering 1 2 3 1 2 3 5. The thumb passes under with a wider stretch; let the wrist glide sideways.', undefined, N('C4 E4 G4 C5 E5 G5 C6')),
    ],
    exercises: [
      ex('L9-2-a', 'C major arpeggio RH', 'Two octaves up and down.', 'treble', 'wait', seqOf('C4 E4 G4 C5 E5 G5 C6 G5 E5 C5 G4 E4 C4', 'RH', [1, 2, 3, 1, 2, 3, 5, 3, 2, 1, 3, 2, 1]), ['fingerTechnique']),
      ex('L9-2-b', 'A minor arpeggio RH', 'Two octaves.', 'treble', 'wait', seqOf('A3 C4 E4 A4 C5 E5 A5 E5 C5 A4 E4 C4 A3', 'RH', [1, 2, 3, 1, 2, 3, 5, 3, 2, 1, 3, 2, 1]), ['fingerTechnique']),
    ],
    playAlong: { keys: N('C4 E4 G4 C5 E5 G5'), hand: 'RH', styles: ['melody', 'tempo'] },
  },
  {
    id: 'L9-3', level: 9, title: 'Seventh chords', prerequisites: ['L6-3'],
    summary: 'Maj7, dominant 7 and minor 7: the color of jazz, gospel and soul.',
    teach: [
      t('Add the 7th', 'Stack one more third on a triad. Cmaj7 = C E G B (dreamy), G7 = G B D F (wants to resolve), Am7 = A C E G (soft and warm).', N('C4 E4 G4 B4'), N('C4 E4 G4 B4')),
      t('ii - V - I', 'Dm7 - G7 - Cmaj7 is the most important progression in jazz. With smooth voicings the hand moves only a key at a time.', undefined, N('D4 F4 A4 C5 B3 D4 F4 G4 C4 E4 G4 B4')),
    ],
    exercises: [
      ex('L9-3-a', 'ii - V - I in C', 'Dm7, G7, Cmaj7 with LH roots.', 'treble', 'wait', hands('F4+A4+C5:4 F4+G4+B4:4 E4+G4+B4:4', 'D3:4 G2:4 C3:4'), ['fingerTechnique'], { grand: true }),
    ],
    playAlong: { keys: [], hand: 'RH', styles: ['chords', 'chords'], voicings: { 2: N('F4 A4 C5'), 5: N('F4 G4 B4'), 1: N('E4 G4 B4'), 6: N('E4 G4 C5'), 4: N('E4 A4 C5') } },
  },
  {
    id: 'L9-4', level: 9, title: 'Octaves and jumps', prerequisites: ['L9-2'],
    summary: 'Hand stretches and leaps with accuracy.',
    teach: [
      t('Octave shape', 'Thumb and 5th finger span eight white keys. Keep the hand arched and the wrist loose; drop from the wrist rather than pushing from the shoulder.', N('C4 C5'), N('C4 C5')),
      t('Look ahead', 'For a leap, move the eyes and hand to the next position before you need it. Accuracy comes from preparation, not speed.'),
    ],
    exercises: [
      ex('L9-4-a', 'Melody in octaves', 'RH octaves 1 and 5.', 'treble', 'wait', seqOf('C4+C5 D4+D5 E4+E5 C4+C5 G4+G5:2 E4+E5:2', 'RH', [[1, 5], [1, 5], [1, 5], [1, 5], [1, 5], [1, 5]]), ['fingerTechnique']),
      ex('L9-4-b', 'LH stride', 'Bass note, jump, chord.', 'bass', 'timed', seqOf('C2:1 E3+G3+C4:1 G2:1 D3+F3+B3:1 C2:1 E3+G3+C4:1 G2:1 E3+G3+C4:1', 'LH'), ['fingerTechnique', 'rhythm'], { tempo: 66 }),
    ],
  },
];
