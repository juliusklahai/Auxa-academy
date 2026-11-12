// Level 13: the church musician. Play hymns in two, three and four parts, make a hard hymn playable,
// introduce and lead a hymn, play from chord symbols, and get around an electronic keyboard or organ.
// Hymn settings come from hymns.ts (public-domain tunes, our own arranger's harmony).
import type { Clef, Exercise, Hand, ScoreEvent, SkillId } from '../core/types';
import { HYMNS, type HymnSetting } from './hymns';
import { seqOf, type LessonDef } from './levels';

function ex(id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[], skills: SkillId[], opts: Partial<Exercise> = {}): Exercise {
  return { id, title, objective, clef, mode, events, skills, tempo: 72, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], grand: true, ...opts };
}
const t = (title: string, body: string, show?: number[], play?: number[], sequential = true) => ({ title, body, show, play, sequential });

/** Any number of single lines (each with its hand) merged into one event list: notes that start together become one chord. */
export function parts(...lines: [string, Hand][]): ScoreEvent[] {
  const all = lines.flatMap(([spec, hand]) => seqOf(spec, hand)).filter((e) => e.pitches.length);
  const by = new Map<number, ScoreEvent>();
  for (const e of all) {
    const k = Math.round(e.beat * 1000);
    const cur = by.get(k);
    if (!cur) { by.set(k, { ...e, pitches: [...e.pitches], hands: e.pitches.map(() => e.hand!), hand: undefined, handBeats: { [e.hand!]: e.beats } }); continue; }
    cur.pitches.push(...e.pitches);
    cur.hands!.push(...e.pitches.map(() => e.hand!));
    cur.beats = Math.min(cur.beats, e.beats);
    cur.handBeats![e.hand!] = Math.min(cur.handBeats![e.hand!] ?? Infinity, e.beats);
  }
  const evs = [...by.values()].sort((a, b) => a.beat - b.beat);
  for (const e of evs) {
    const o = e.pitches.map((p, i) => [p, e.hands![i]] as const).sort((a, b) => a[0] - b[0]);
    // the same key in two voices (a unison) is pressed once
    const seen = new Set<number>(); const keep = o.filter(([p]) => (seen.has(p) ? false : (seen.add(p), true)));
    e.pitches = keep.map((x) => x[0]); e.hands = keep.map((x) => x[1]);
    if (new Set(e.hands).size === 1) { e.hand = e.hands[0]; e.hands = undefined; e.handBeats = undefined; }
  }
  return evs;
}

/** The tokens of a line between two beats (both on note boundaries), with the leading silence kept so bars line up. */
export function cut(spec: string, from: number, to: number): string {
  let beat = 0; const out: string[] = [];
  for (const tok of spec.trim().split(/\s+/)) {
    const len = parseFloat(tok.split(':')[1] ?? '1');
    if (beat >= from - 1e-6 && beat + len <= to + 1e-6) out.push(tok);
    beat += len;
  }
  return out.join(' ');
}
const lead = (beats: number) => (beats > 0 ? `R:${beats} ` : '');

type Mix = 'SB' | 'SAB' | 'SATB';
/** A hymn (or a slice of it) in two, three or four parts: soprano and alto in the right hand, tenor and bass in the left. */
function hymn(h: HymnSetting, mix: Mix, from = 0, to = Infinity, pad = 0): ScoreEvent[] {
  const pick = (v: 'S' | 'A' | 'T' | 'B') => lead(pad) + (Number.isFinite(to) || from > 0 ? cut(h[v], from, to) : h[v]);
  const lines: [string, Hand][] = [[pick('S'), 'RH'], [pick('B'), 'LH']];
  if (mix !== 'SB') lines.push([pick('A'), 'RH']);
  if (mix === 'SATB') lines.push([pick('T'), 'LH']);
  const evs = parts(...lines);
  // a slice that stops mid-bar holds its last chord to the bar line
  const bar = h.timeSig[0] * (4 / h.timeSig[1]), last = evs[evs.length - 1];
  const end = last.beat + last.beats, gap = Math.ceil(end / bar - 1e-9) * bar - end;
  if (gap > 1e-6) { last.beats += gap; if (last.handBeats) for (const k of Object.keys(last.handBeats) as Hand[]) last.handBeats[k] = (last.handBeats[k] ?? 0) + gap; }
  return evs;
}
const O = HYMNS.old100, G = HYMNS.amazing, J = HYMNS.joy;
const FIFTHS: Record<string, number> = { 'C major': 0, 'G major': 1, 'D major': 2, 'F major': -1 };
const hymnOpts = (h: HymnSetting): Partial<Exercise> => ({ timeSig: h.timeSig, tempo: h.tempo, maxConsecutiveMistakes: 4, fifths: FIFTHS[h.key] ?? 0 });

export const CHURCH_LESSONS: LessonDef[] = [
  {
    id: 'C13-1', level: 13, title: 'Hymns in two parts: tune and bass', prerequisites: ['L3-1'],
    summary: 'Read a hymn score and play its two outside voices: the melody and the bass line.',
    teach: [
      t('How a hymn is written', 'A hymn is four voices on two staves. On the top staff: soprano (stems up, the tune) and alto (stems down). On the bottom staff: tenor (stems up) and bass (stems down). Pianists play all four: right hand takes soprano and alto, left hand takes tenor and bass.'),
      t('Start from the outside', 'The tune and the bass are the frame of the harmony. Played alone they already sound complete enough to lead singing. Learn these two first, hands separately, then together.', [67, 43], [43, 67]),
      t('Old Hundredth', 'This tune is over 450 years old and sung around the world as the Doxology, "Praise God, from whom all blessings flow". Every note is one beat, and the last note of each line is a breath point.'),
    ],
    exercises: [
      ex('C13-1-a', 'Lines 1 and 2: tune and bass', 'Soprano in the right hand, bass in the left, Old Hundredth.', 'treble', 'wait', hymn(O, 'SB', 0, 19), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(O)),
      ex('C13-1-b', 'Whole hymn: tune and bass', 'All four lines, tune and bass.', 'treble', 'wait', hymn(O, 'SB'), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(O)),
    ],
  },
  {
    id: 'C13-2', level: 13, title: 'Three parts: alto joins the right hand', prerequisites: ['C13-1'],
    summary: 'Soprano and alto together in the right hand over the bass.',
    teach: [
      t('Two voices in one hand', 'The alto sits just under the tune, usually a third or sixth below. Use fingers 4 and 5 (or 3 and 4) for the soprano and 1 and 2 for the alto, so the tune is on the strong outside of the hand and can sing out.', [67, 71], [67, 71]),
      t('Hold your part', 'When the soprano moves and the alto holds, keep the alto key down for its full value. Hymns sound thin when inner notes are let go early.'),
      t('Amazing Grace in three-four', 'A waltz-like three beats in a bar, starting on beat 3. Count "3 | 1 2 3 | 1 2 3" and lean gently on each 1.'),
    ],
    exercises: [
      ex('C13-2-a', 'Old Hundredth in three parts', 'Lines 1 and 2: soprano and alto in the right hand, bass in the left.', 'treble', 'wait', hymn(O, 'SAB', 0, 19), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(O)),
      ex('C13-2-b', 'Amazing Grace in three parts', 'The first half of the hymn: tune, alto and bass.', 'treble', 'wait', hymn(G, 'SAB', 0, 24), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(G)),
    ],
  },
  {
    id: 'C13-3', level: 13, title: 'Four parts: the full hymn', prerequisites: ['C13-2'],
    summary: 'Tenor joins the left hand and you play the hymn as written.',
    teach: [
      t('The tenor', 'The tenor is the highest note of the left hand, written stems up on the bass staff. It often holds or steps while the bass moves more. Read the bass first, then add the tenor above it.'),
      t('Read in chords', 'Read each beat as one chord shape from the bottom up: bass, tenor, alto, soprano. Your eyes take in the shape; your hands place it in one move. Hands separately first, then together, slowly.'),
      t('When a hand cannot reach', 'If the alto and tenor are more than an octave from the outside voices, pass a note to the other hand: a left-hand thumb can take the alto, or the right thumb the tenor. The sound matters, not which hand plays it.'),
    ],
    exercises: [
      ex('C13-3-a', 'Old Hundredth, lines 1 and 2', 'All four voices.', 'treble', 'wait', hymn(O, 'SATB', 0, 19), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(O)),
      ex('C13-3-b', 'Old Hundredth, the whole hymn', 'All four voices, all four lines.', 'treble', 'wait', hymn(O, 'SATB'), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(O)),
      ex('C13-3-c', 'Joyful, joyful in four parts', 'The Hymn to Joy, first half, all four voices.', 'treble', 'wait', hymn(J, 'SATB', 0, 16), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(J)),
    ],
  },
  {
    id: 'C13-4', level: 13, title: 'Make a hard hymn playable', prerequisites: ['C13-2'],
    summary: 'Three honest ways to simplify, so you can play for singing this Sunday.',
    teach: [
      t('Keep what the singers need', 'Singers need three things from you: the tune, a steady beat, and the right harmony underneath. Inner voices are a bonus. Simplify in this order and stop as soon as it is playable.'),
      t('Way 1: tune and bass', 'Play only soprano and bass, as you learned in two parts. It is honest, clear and always correct.'),
      t('Way 2: tune over roots', 'Right hand plays the tune. Left hand holds the root and fifth of each chord for the whole bar. Find the chord from the bass note on beat 1 or from the chord symbols above the music.', [43, 50], [43, 50]),
      t('Way 3: chords and bass', 'Right hand plays the full chord on each beat (alto and soprano plus a filler), left hand plays the bass in octaves. Good for a big congregation or a weak piano.'),
    ],
    exercises: [
      ex('C13-4-a', 'Amazing Grace: tune over roots', 'Tune in the right hand, root and fifth held in the left.', 'treble', 'wait',
        parts([G.S, 'RH'], ['R:3 G2+D3:3 G2+D3:3 C3+G3:3 G2+D3:3 G2+D3:3 G2+D3:3 D3+A3:3 G2+D3:3 G2+D3:3 D3+A3:3 C3+G3:3 G2+D3:3 G2+D3:3 D3+A3:3 G2+D3:3', 'LH']),
        ['noteReadingTreble', 'noteReadingBass'], hymnOpts(G)),
      ex('C13-4-b', 'Joyful, joyful: tune and bass', 'The whole tune with its bass line only.', 'treble', 'wait', hymn(J, 'SB'), ['noteReadingTreble', 'noteReadingBass'], hymnOpts(J)),
    ],
  },
  {
    id: 'C13-5', level: 13, title: 'Introductions, tempo, fermatas and Amen', prerequisites: ['C13-3'],
    summary: 'Give the congregation the tune, the speed and the starting note, and end with an Amen.',
    teach: [
      t('The introduction', 'Before people sing, play the last line of the hymn (or the first and last lines) at the speed you want them to sing. End it clearly, take a breath with them, and start verse 1 together. The introduction tells them the tune, the key and the tempo.'),
      t('A singable tempo', 'Choose a speed where one breath lasts a whole line. Too slow and people run out of air; too fast and the words tumble. Sing the words quietly to yourself as you play, and the right tempo will appear.'),
      t('Fermatas and breaths', 'A fermata at the end of a line means "hold and breathe". Hold the chord a little longer, lift your hands together, and come back in on time for the next line. Everybody breathes with you.'),
      t('The Amen', 'Many hymns end with "Amen" sung to two chords: IV then I. It is called the plagal or church cadence. Play it slowly and warmly.', [60, 65, 69, 60, 64, 67], [53, 60, 65, 69, 48, 60, 64, 67]),
    ],
    exercises: [
      ex('C13-5-a', 'Amen in four keys', 'IV to I in C, G, F and D.', 'treble', 'wait',
        parts(['C4+F4+A4:2 C4+E4+G4:2 C4+E4+G4:2 B3+D4+G4:2 D4+F4+Bb4:2 C4+F4+A4:2 D4+G4+B4:2 D4+F#4+A4:2', 'RH'], ['F2:2 C3:2 C3:2 G2:2 Bb2:2 F2:2 G2:2 D3:2', 'LH']),
        ['noteReadingTreble', 'noteReadingBass']),
      ex('C13-5-b', 'Play the introduction', 'The last line of Old Hundredth in four parts, in time, at singing speed.', 'treble', 'timed', hymn(O, 'SATB', 27, 36, 3), ['rhythm', 'noteReadingTreble', 'noteReadingBass'], { ...hymnOpts(O), tempo: 76 }),
    ],
  },
  {
    id: 'C13-6', level: 13, title: 'Leading the singing', prerequisites: ['C13-5'],
    summary: 'Keep a steady beat for a room full of people, breathe with them, and shape the verses.',
    teach: [
      t('You are the leader', 'A congregation follows the piano, so your beat must be steady even when the singing drags. Play the bass and the tune a little stronger than the inner voices, and never wait for the slowest singer.'),
      t('Breathe between lines', 'At the end of each line, shorten the last chord just slightly so everyone can breathe, then come back in exactly on the beat. The lift is small, the beat does not stop.'),
      t('Shape the verses', 'Play a quieter verse when the words are gentle and a fuller one when they rejoice. For the last verse, add the bass an octave lower. Between verses, keep the beat going: one bar of rest, then the next verse.'),
    ],
    exercises: [
      ex('C13-6-a', 'Tune and bass, in time', 'Old Hundredth, tune and bass, steady at singing speed.', 'treble', 'timed', hymn(O, 'SB'), ['rhythm', 'pulse'], { ...hymnOpts(O), tempo: 72 }),
      ex('C13-6-b', 'Amazing Grace, in time', 'Tune, alto and bass in three-four, a steady lilt.', 'treble', 'timed', hymn(G, 'SAB'), ['rhythm', 'pulse'], { ...hymnOpts(G), tempo: 66 }),
    ],
  },
  {
    id: 'C13-7', level: 13, title: 'Play from chord symbols', prerequisites: ['L6-1'],
    summary: 'Read letters like G, C, D7 and Em above a tune and turn them into chords at once.',
    teach: [
      t('Reading a chord symbol', 'A capital letter alone is a major chord (G = G B D). A small m means minor (Em = E G B). A 7 adds the note a whole step below the root an octave up (D7 = D F# A C). A slash gives the bass note: C/E means a C chord with E in the bass.'),
      t('The chord chart', 'In every major key, the same family: I, IV and V are major; ii, iii and vi are minor. In G: G, Am, Bm, C, D, Em. In C: C, Dm, Em, F, G, Am. Learn the family of a key and most hymns and songs are covered.'),
      t('Stay close', 'Do not jump to every chord in root position. Keep the right hand near middle C and move each finger to the nearest chord note (inversions). The left hand plays the root. This is how pianists and keyboardists accompany from a song sheet.', [60, 64, 67, 60, 65, 69, 59, 62, 67], [60, 64, 67, 60, 65, 69, 59, 62, 67], false),
    ],
    exercises: [
      ex('C13-7-a', 'C  F  G  C', 'Close right-hand chords over left-hand roots, two beats each.', 'treble', 'wait',
        parts(['C4+E4+G4:2 C4+F4+A4:2 B3+D4+G4:2 C4+E4+G4:2', 'RH'], ['C3:2 F2:2 G2:2 C3:2', 'LH']), ['noteReadingBass']),
      ex('C13-7-b', 'G  Em  C  D7  G', 'The chord family of G, staying close.', 'treble', 'wait',
        parts(['B3+D4+G4:2 B3+E4+G4:2 C4+E4+G4:2 C4+D4+F#4:2 B3+D4+G4:4', 'RH'], ['G2:2 E2:2 C3:2 D3:2 G2:4', 'LH']), ['noteReadingBass']),
      ex('C13-7-c', 'Am  Dm  G  C', 'Minor chords and a close voice-leading circle.', 'treble', 'timed',
        parts(['C4+E4+A4:2 D4+F4+A4:2 B3+D4+G4:2 C4+E4+G4:2', 'RH'], ['A2:2 D3:2 G2:2 C3:2', 'LH']), ['rhythm', 'noteReadingBass'], { tempo: 72 }),
    ],
  },
  {
    id: 'C13-8', level: 13, title: 'Electronic keyboard and organ', prerequisites: ['C13-3'],
    summary: 'Use a keyboard\'s voices, styles and split well, and play legato the way organists do.',
    teach: [
      t('Your keyboard\'s buttons', 'Voice: the sound (choose piano or organ for hymns, strings for quiet songs). Style or rhythm: a drum and band pattern; keep it simple and soft in church. Split: the left part of the keys plays a different sound (bass), the right part the tune. Tempo: set it before you start.'),
      t('Transpose with care', 'The transpose button moves everything up or down so you can play in an easy key while the sound comes out in another. It is handy for singers, but learn the real keys too: when the keyboard is switched off, the knowledge stays.'),
      t('Single-finger chords', 'Many keyboards can play a whole chord from one left-hand key. It helps on day one, but it guesses the harmony. Move on to playing the chords yourself as soon as you can (the lesson on chord symbols shows how).'),
      t('Organ legato', 'An organ note stops the moment you let go, and there is usually no sustain pedal. So play every note for its full value and connect the next one exactly as you leave it. When a note is shared by two chords (a common tone), hold it instead of playing it again.'),
      t('Registration and pedals', 'Start with a gentle 8-foot flute or principal (the normal pitch). Add a 4-foot stop for brightness on joyful verses. Feet play the bass line on the pedals, usually with a 16-foot stop, so your left hand keeps only the tenor.'),
    ],
    exercises: [
      ex('C13-8-a', 'Organ-style hymn line', 'Old Hundredth lines 1 and 2 in four parts: play every note its full value, perfectly connected.', 'treble', 'timed', hymn(O, 'SATB', 0, 19), ['rhythm', 'noteReadingTreble', 'noteReadingBass'], { ...hymnOpts(O), tempo: 66 }),
      ex('C13-8-b', 'The pedal line', 'The bass line alone, as your feet would play it on an organ, steady and connected.', 'bass', 'timed', seqOf(O.B, 'LH'), ['rhythm', 'noteReadingBass'], { ...hymnOpts(O), tempo: 72, grand: false }),
    ],
  },
];
