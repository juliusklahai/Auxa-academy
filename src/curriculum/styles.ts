// Level 14: Styles. Pop chords and left-hand patterns, colour chords, blues and boogie-woogie, ragtime and
// stride, Latin, gospel, highlife and Afrobeat (our own material), and accompanying a singer.
// Level 9 additions: fingering, pedaling, minor scales, ornaments. All patterns written for Auxa.
import type { BackNote, Clef, Exercise, Hand, ScoreEvent, SkillId } from '../core/types';
import { parts } from './church';
import { seqOf, type LessonDef } from './levels';

function ex(id: string, title: string, objective: string, clef: Clef, mode: 'wait' | 'timed', events: ScoreEvent[], skills: SkillId[], opts: Partial<Exercise> = {}): Exercise {
  return { id, title, objective, clef, mode, events, skills, tempo: 76, timeSig: [4, 4], passScore: 80, maxConsecutiveMistakes: 4, requiredPasses: 1, inputs: ['midi', 'mic', 'screen', 'computer-keyboard'], grand: true, ...opts };
}
const t = (title: string, body: string, show?: number[], play?: number[], sequential = true) => ({ title, body, show, play, sequential });
/** a supporting part the app plays while you practise the other one */
function back(spec: string, hand: Hand, vel = 0.34, line: 'accomp' | 'melody' = 'accomp'): BackNote[] {
  return seqOf(spec, hand).filter((e) => e.pitches.length).flatMap((e) => e.pitches.map((midi) => ({ midi, beat: e.beat, beats: e.beats, hand, line, vel })));
}
const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' ');
const each = (chords: string[], f: (c: string) => string) => chords.map(f).join(' ');

// common chord shapes (close voicings near middle C)
const C = 'C4+E4+G4', G = 'B3+D4+G4', Am = 'C4+E4+A4', F = 'C4+F4+A4';

export const STYLE_LESSONS: LessonDef[] = [
  {
    id: 'S14-1', level: 14, title: 'Four chords, a thousand songs', prerequisites: ['L6-3'],
    summary: 'I, V, vi and IV: the progression under countless pop, worship and Afrobeats songs, with a real groove.',
    teach: [
      t('The four chords', 'In C major: C (I), G (V), A minor (vi) and F (IV). Play them in that order and you will hear the backbone of thousands of songs. Keep the right hand close: C E G, then B D G, then C E A, then C F A. The left hand plays the root.', [60, 64, 67, 59, 62, 67, 60, 64, 69, 60, 65, 69], [48, 60, 64, 67, 43, 59, 62, 67, 45, 60, 64, 69, 41, 60, 65, 69]),
      t('Give it a groove', 'Instead of one chord per bar, play the "1, and-of-2, 4" pattern: long, long, short (1½ + 1½ + 1 beats). Count "1 2 & 3 4" and play on 1, the "&" of 2, and 4. It is the heartbeat of pop.'),
      t('Drive with the left hand', 'For energy, play the root in octaves on every beat while the right hand holds the chord. For a gentle song, hold the root for the whole bar.'),
    ],
    exercises: [
      ex('S14-1-a', 'C  G  Am  F', 'Close chords over roots, a bar each.', 'treble', 'wait', parts([`${C}:4 ${G}:4 ${Am}:4 ${F}:4`, 'RH'], ['C3:4 G2:4 A2:4 F2:4', 'LH']), ['rhythm']),
      ex('S14-1-b', 'The pop groove', 'Long, long, short in the right hand: 1, and-of-2, 4.', 'treble', 'timed',
        parts([each([C, G, Am, F], (c) => `${c}:1.5 ${c}:1.5 ${c}:1`), 'RH'], ['C3:4 G2:4 A2:4 F2:4', 'LH']), ['rhythm'], { tempo: 84 }),
      ex('S14-1-c', 'Octave drive', 'Left hand roots in octaves on every beat; the band holds the chords.', 'bass', 'timed',
        seqOf(['C2+C3', 'G1+G2', 'A1+A2', 'F1+F2'].map((o) => rep(`${o}:1`, 4)).join(' '), 'LH'), ['rhythm'], { tempo: 88, grand: false, backing: back(`${C}:4 ${G}:4 ${Am}:4 ${F}:4`, 'RH', 0.3) }),
    ],
  },
  {
    id: 'S14-2', level: 14, title: 'Left-hand patterns', prerequisites: ['S14-1'],
    summary: 'Alternating bass, broken chords and open arpeggios: three ways to make a left hand move.',
    teach: [
      t('Alternating bass', 'Root on beat 1, the fifth of the chord on beat 3. It is the bounce of country, highlife and many hymns. For C that is C then G; for A minor, A then E.', [48, 43], [48, 43, 48, 43]),
      t('Broken chords', 'Root, fifth, octave, fifth in even eighth notes: "1 5 8 5". It keeps a ballad moving without getting in the way of the tune.', [48, 55, 60], [48, 55, 60, 55, 48, 55, 60, 55]),
      t('Open arpeggios', 'Root, fifth, then the third an octave higher (a tenth): "1 5 10 5". Wider and richer than a closed chord, and it leaves room for the right hand.', [48, 55, 64], [48, 55, 64, 55, 48, 55, 64, 55]),
    ],
    exercises: [
      ex('S14-2-a', 'Alternating bass', 'Root and fifth under C, A minor, F and G.', 'bass', 'timed', seqOf('C3:2 G2:2 A2:2 E2:2 F2:2 C3:2 G2:2 D3:2', 'LH'), ['rhythm'], { tempo: 84, grand: false, backing: back(`${C}:4 ${Am}:4 ${F}:4 ${G}:4`, 'RH', 0.3) }),
      ex('S14-2-b', 'Broken chords: 1 5 8 5', 'Even eighths under the same chords.', 'bass', 'timed',
        seqOf(['C3 G3 C4 G3', 'A2 E3 A3 E3', 'F2 C3 F3 C3', 'G2 D3 G3 D3'].map((p) => rep(p.split(' ').map((n) => `${n}:0.5`).join(' '), 2)).join(' '), 'LH'), ['rhythm'], { tempo: 72, grand: false, backing: back(`${C}:4 ${Am}:4 ${F}:4 ${G}:4`, 'RH', 0.28) }),
      ex('S14-2-c', 'Open arpeggios: 1 5 10 5', 'A wide, rich left hand.', 'bass', 'timed',
        seqOf(['C3 G3 E4 G3', 'A2 E3 C4 E3', 'F2 C3 A3 C3', 'G2 D3 B3 D3'].map((p) => rep(p.split(' ').map((n) => `${n}:0.5`).join(' '), 2)).join(' '), 'LH'), ['rhythm'], { tempo: 66, grand: false, backing: back('E5:4 E5:4 C5:4 D5:4', 'RH', 0.4, 'melody') }),
    ],
  },
  {
    id: 'S14-3', level: 14, title: 'Colour chords: sus, add2, 6 and augmented', prerequisites: ['S14-1'],
    summary: 'Small changes to a triad that make songs shimmer, ache or lift.',
    teach: [
      t('Suspended chords', 'Replace the third with the fourth (sus4) or the second (sus2). The chord sounds open and unresolved, then lands when the third returns: Csus4 to C is the classic "amen" lift.', [60, 65, 67], [60, 65, 67, 60, 64, 67]),
      t('Add2 and 6', 'Keep the triad and add a note: the 2nd (C D E G, "add2" or "add9") sounds bright and modern; the 6th (C E G A) sounds warm and old-fashioned, a favourite for final chords.', [60, 62, 64, 67], [60, 62, 64, 67, 60, 64, 67, 69]),
      t('Augmented', 'Raise the fifth by a half step (C E G sharp). It sounds like a question that pulls toward the next chord, usually IV: C, Caug, F.', [60, 64, 68], [60, 64, 68, 60, 65, 69]),
    ],
    exercises: [
      ex('S14-3-a', 'Colours on C', 'Csus4 to C, Csus2 to C, Cadd2, C6, then Caug resolving to F.', 'treble', 'wait',
        parts(['C4+F4+G4:2 C4+E4+G4:2 C4+D4+G4:2 C4+E4+G4:2 C4+D4+E4+G4:4 C4+E4+G4+A4:4 C4+E4+G#4:4 C4+F4+A4:4', 'RH'], ['C3:4 C3:4 C3:4 C3:4 C3:4 F2:4', 'LH']), ['noteReadingTreble']),
      ex('S14-3-b', 'A worship-style turnaround', 'Cadd2, G/B, Am7, Fsus2 in time.', 'treble', 'timed',
        parts(['C4+D4+E4+G4:4 B3+D4+G4:4 C4+E4+G4:4 C4+F4+G4:4', 'RH'], ['C3:4 B2:4 A2:4 F2:4', 'LH']), ['rhythm'], { tempo: 72 }),
    ],
  },
  {
    id: 'S14-4', level: 14, title: 'Twelve-bar blues and boogie-woogie', prerequisites: ['S14-2'],
    summary: 'The twelve-bar form, the boogie left hand, and the blues scale on top.',
    teach: [
      t('The twelve-bar form', 'Twelve bars, three chords: four bars of I, two of IV, two of I, then V, IV, I, I. In C: C C C C | F F C C | G F C C. Count the bars out loud the first few times.'),
      t('The boogie left hand', 'Walk up and down the chord in eighth notes: root, third, fifth, sixth, flat seventh, sixth, fifth, third. Move the same shape to F and G. Play it with a gentle swing (long-short).', [48, 52, 55, 57, 58], [48, 52, 55, 57, 58, 57, 55, 52]),
      t('The blues scale', 'C, E flat, F, F sharp, G, B flat, C. The "blue notes" (E flat and F sharp) rub against the chords on purpose. Short riffs from this scale fit over all three chords.', [60, 63, 65, 66, 67, 70, 72], [60, 63, 65, 66, 67, 70, 72]),
    ],
    exercises: [
      ex('S14-4-a', 'Boogie left hand, twelve bars', 'The walking eighth-note pattern through the whole form.', 'bass', 'timed',
        seqOf(['C', 'C', 'C', 'C', 'F', 'F', 'C', 'C', 'G', 'F', 'C', 'C'].map((ch) => ({ C: 'C3 E3 G3 A3 Bb3 A3 G3 E3', F: 'F2 A2 C3 D3 Eb3 D3 C3 A2', G: 'G2 B2 D3 E3 F3 E3 D3 B2' })[ch]!.split(' ').map((n) => `${n}:0.5`).join(' ')).join(' '), 'LH'), ['rhythm'],
        { tempo: 84, grand: false, flats: true, backing: back(['C', 'C', 'C', 'C', 'F', 'F', 'C', 'C', 'G', 'F', 'C', 'C'].map((ch) => `${({ C: 'E4+Bb4', F: 'Eb4+A4', G: 'F4+B4' })[ch]}:4`).join(' '), 'RH', 0.26) }),
      ex('S14-4-b', 'The blues scale', 'Up and down in C.', 'treble', 'timed', seqOf('C4:0.5 Eb4:0.5 F4:0.5 Gb4:0.5 G4:0.5 Bb4:0.5 C5:1 Bb4:0.5 G4:0.5 Gb4:0.5 F4:0.5 Eb4:0.5 C4:0.5 C4:1', 'RH', [1, 2, 3, 4, 1, 2, 3, 2, 1, 4, 3, 2, 1, 1]), ['rhythm'], { tempo: 72, grand: false, flats: true }),
      ex('S14-4-c', 'A riff over the boogie', 'One riff, four times; the band plays the boogie.', 'treble', 'timed', seqOf(rep('G4:0.5 Bb4:0.5 G4:0.5 Eb4:0.5 C4:1 R:1', 4), 'RH'), ['rhythm'],
        { tempo: 84, grand: false, flats: true, backing: back(['C', 'C', 'F', 'C'].map((ch) => ({ C: 'C3 E3 G3 A3 Bb3 A3 G3 E3', F: 'F2 A2 C3 D3 Eb3 D3 C3 A2' })[ch]!.split(' ').map((n) => `${n}:0.5`).join(' ')).join(' '), 'LH', 0.34) }),
    ],
  },
  {
    id: 'S14-5', level: 14, title: 'Ragtime and stride', prerequisites: ['S14-2'],
    summary: 'The "oom-pah" left hand and a syncopated right hand.',
    teach: [
      t('Oom-pah', 'Low bass note on beats 1 and 3 ("oom"), a chord in the middle of the piano on 2 and 4 ("pah"). The left hand jumps, so look ahead and move early. Keep the bass strong and the chords light.', [36, 52, 55, 60], [36, 52, 55, 60, 43, 52, 55, 60]),
      t('The ragtime chain', 'C, A7, D7, G7, back to C: each chord is the "five" of the next, so the music keeps pulling forward. The sevenths give it its old-time colour.'),
      t('Syncopation on top', 'The right hand lands between the beats ("short-long-short") while the left keeps strict time. That contrast is ragtime. Practise the left hand until it runs by itself.'),
    ],
    exercises: [
      ex('S14-5-a', 'Stride left hand', 'Bass and chord through C, A7, D7, G7, C.', 'bass', 'timed',
        seqOf('C2:1 E3+G3+C4:1 G2:1 E3+G3+C4:1 A2:1 E3+G3+C#4:1 E2:1 E3+G3+C#4:1 D2:1 F#3+A3+C4:1 A2:1 F#3+A3+C4:1 G2:1 F3+G3+B3:1 D2:1 F3+G3+B3:1 C2:1 E3+G3+C4:1 C2:2', 'LH'), ['rhythm'], { tempo: 66, grand: false }),
      ex('S14-5-b', 'A rag tune', 'Syncopated right hand; the band plays the stride.', 'treble', 'timed',
        seqOf('E5:0.5 G5:1 E5:0.5 C5:1 D5:1 E5:0.5 C#5:1 E5:0.5 A4:2 F#5:0.5 A5:1 F#5:0.5 D5:1 C5:1 B4:0.5 D5:1 F5:0.5 G5:2 E5:1 C5:1 C5:2', 'RH'), ['rhythm'],
        { tempo: 66, grand: false, backing: back('C2:1 E3+G3+C4:1 G2:1 E3+G3+C4:1 A2:1 E3+G3+C#4:1 E2:1 E3+G3+C#4:1 D2:1 F#3+A3+C4:1 A2:1 F#3+A3+C4:1 G2:1 F3+G3+B3:1 D2:1 F3+G3+B3:1 C2:1 E3+G3+C4:1 C2:2', 'LH', 0.32) }),
    ],
  },
  {
    id: 'S14-6', level: 14, title: 'Latin: montuno and bossa nova', prerequisites: ['S14-2'],
    summary: 'The looping salsa piano figure and the gentle Brazilian comp.',
    teach: [
      t('The montuno', 'A short figure in octaves and chord tones that loops over two or four chords, locking with the bass and percussion. Keep it light, even and exactly in time: the groove comes from repetition.', [60, 72, 67, 64, 76], [60, 72, 67, 64, 76, 67]),
      t('The bass anticipates', 'In Latin music the bass often plays just before the chord changes (on the "and" of 2 and on 4), so the harmony seems to arrive early. Listen to the band and feel where it lands.'),
      t('Bossa nova', 'Soft seventh chords, a bass that rocks between root and fifth, and a right hand that falls just off the beat. Play gently, close to the keys, like speaking quietly.'),
    ],
    exercises: [
      ex('S14-6-a', 'Montuno: C F G F', 'Right-hand octaves and chord tones; the band plays the bass.', 'treble', 'timed',
        seqOf(rep('C4+C5:0.5 G4:0.5 E4+E5:0.5 G4:0.5 C4+C5:0.5 A4:0.5 F4+F5:0.5 A4:0.5 B3+B4:0.5 G4:0.5 D4+D5:0.5 G4:0.5 C4+C5:0.5 A4:0.5 F4+F5:0.5 A4:0.5', 2), 'RH'), ['rhythm'],
        { tempo: 88, grand: false, backing: back(rep('R:1.5 C3:1 F2:1.5 R:1.5 G2:1 F2:1.5', 2), 'LH', 0.4) }),
      ex('S14-6-b', 'Bossa comp', 'Am7, D7, Gmaj7, Cmaj7: right hand off the beat, left hand root and fifth.', 'treble', 'timed',
        parts([['G3+C4+E4', 'F#3+C4+E4', 'F#3+B3+D4', 'E3+G3+B3'].map((c) => `R:0.5 ${c}:1 ${c}:1 R:0.5 ${c}:1`).join(' '), 'RH'], ['A2:1.5 E2:0.5 E2:2 D2:1.5 A2:0.5 A2:2 G2:1.5 D2:0.5 D2:2 C2:1.5 G2:0.5 G2:2', 'LH']), ['rhythm'], { tempo: 72 }),
    ],
  },
  {
    id: 'S14-7', level: 14, title: 'Gospel piano', prerequisites: ['S14-3'],
    summary: 'Walk-ups, passing chords, rich 2-5-1 endings and the church Amen with a twist.',
    teach: [
      t('Walk-ups', 'Gospel bass lines walk into the next chord by step: C, D, E, F into the IV chord, with a passing chord on each step above. Walking down again (F, E, D, C) brings you home.', [48, 50, 52, 53], [48, 50, 52, 53]),
      t('Rich voicings', 'Gospel pianists rarely play plain triads. A 9th on the ii chord, a 13th on the V and a major 9th on the I make a 2-5-1 that sounds like Sunday morning. Keep the left hand in octaves for weight.', [53, 57, 60, 64], [38, 53, 57, 60, 64]),
      t('Amen with a twist', 'Between the IV chord and home, slip in the minor iv (F minor in C): one note moves down a half step, A to A flat. It is the tender sound at the end of so many gospel songs.', [60, 65, 69, 60, 65, 68, 60, 64, 67], [60, 65, 69, 60, 65, 68, 60, 64, 67]),
    ],
    exercises: [
      ex('S14-7-a', 'Walk up to IV and home', 'Passing chords over a walking bass.', 'treble', 'wait',
        parts([`${C}:1 D4+F4+A4:1 ${C}:1 ${F}:1 ${F}:4 ${F}:1 ${C}:1 B3+D4+F4:1 ${C}:1 ${C}:4`, 'RH'], ['C3:1 D3:1 E3:1 F3:1 F2:4 F2:1 E2:1 D2:1 C2:1 C2+C3:4', 'LH']), ['noteReadingBass']),
      ex('S14-7-b', 'A Sunday 2-5-1', 'Dm9, G13, Cmaj9 with octave bass.', 'treble', 'wait',
        parts(['F3+A3+C4+E4:4 F3+B3+E4:4 E3+G3+B3+D4:8', 'RH'], ['D2+D3:4 G2+G3:4 C2+C3:8', 'LH']), ['noteReadingBass']),
      ex('S14-7-c', 'Amen with the minor iv', 'F, F minor, C: listen to the A flat.', 'treble', 'timed',
        parts([`${F}:2 C4+F4+Ab4:2 ${C}:4`, 'RH'], ['F2:2 F2:2 C2+C3:4', 'LH']), ['rhythm'], { tempo: 60, flats: true }),
    ],
  },
  {
    id: 'S14-8', level: 14, title: 'Highlife and Afrobeat keys', prerequisites: ['S14-2'],
    summary: 'The bright guitar-like patterns of highlife and the tight, punchy stabs of Afrobeat.',
    teach: [
      t('Highlife', 'Highlife grew in West Africa from brass bands, guitar music and dance halls. On keys, play rippling broken chords in eighth notes, like a palm-wine guitar, over a bouncing root-and-fifth bass. Bright major chords, I, IV and V, and a smile in the rhythm.', [67, 72, 76], [67, 72, 76, 72, 67, 72, 76, 79]),
      t('Afrobeat', 'Afrobeat locks keys, guitar, bass and drums into one long groove, often on a single minor chord. The keyboard plays short, punchy chord stabs on the off-beats and leaves space. Less is more: the gaps are part of the rhythm.'),
      t('Interlock with the band', 'Each instrument has its own small pattern and they fit together like a puzzle. Play yours exactly the same every time, listen to the bass, and let the groove build by repetition.'),
    ],
    exercises: [
      ex('S14-8-a', 'Highlife ripple', 'Broken chords in eighths over C, F, G, C; the band plays the bass.', 'treble', 'timed',
        seqOf(['G4 C5 E5 C5 G4 C5 E5 G5', 'A4 C5 F5 C5 A4 C5 F5 A5', 'G4 B4 D5 B4 G4 B4 D5 G5'].map((p) => p.split(' ').map((n) => `${n}:0.5`).join(' ')).join(' ') + ' E5:0.5 C5:0.5 G4:0.5 C5:0.5 C5:2', 'RH'), ['rhythm'],
        { tempo: 96, grand: false, backing: back('C3:1.5 G2:0.5 C3:1 G2:1 F2:1.5 C3:0.5 F2:1 C3:1 G2:1.5 D3:0.5 G2:1 D3:1 C3:1.5 G2:0.5 C3:2', 'LH', 0.4) }),
      ex('S14-8-b', 'Afrobeat stabs', 'Short chords on the off-beats over a minor groove; the band plays the bass riff.', 'treble', 'timed',
        seqOf(['F4+A4+C5', 'F4+A4+C5', 'F4+B4+D5', 'F4+A4+C5'].map((c) => rep(`R:0.5 ${c}:0.5`, 4)).join(' '), 'RH'), ['rhythm'],
        { tempo: 100, grand: false, backing: back('D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5 D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5 G2:0.5 R:0.5 G3:0.5 F3:0.5 D3:1 C3:0.5 D3:0.5 D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5', 'LH', 0.45) }),
      ex('S14-8-c', 'The bass riff', 'Now you play the bass riff; the band plays the stabs.', 'bass', 'timed',
        seqOf('D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5 D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5 G2:0.5 R:0.5 G3:0.5 F3:0.5 D3:1 C3:0.5 D3:0.5 D2:0.5 R:0.5 D3:0.5 C3:0.5 A2:1 G2:0.5 A2:0.5', 'LH'), ['rhythm'],
        { tempo: 96, grand: false, backing: back(['F4+A4+C5', 'F4+A4+C5', 'F4+B4+D5', 'F4+A4+C5'].map((c) => rep(`R:0.5 ${c}:0.5`, 4)).join(' '), 'RH', 0.3) }),
    ],
  },
  {
    id: 'S14-9', level: 14, title: 'Accompanying a singer', prerequisites: ['S14-2'],
    summary: 'Support the voice: give the start, keep the beat, stay out of the way, and fit the style.',
    teach: [
      t('The singer leads', 'Your job is to make the singer sound good. Play an introduction that gives the key and tempo, keep a steady beat, and follow if they stretch a phrase. Never play the tune louder than they sing it.'),
      t('Leave room', 'Keep your right hand below the singer\'s notes, play less when they sing and fill a little in the gaps between phrases. Simple and steady beats busy and clever.'),
      t('Pick a pattern for the style', 'Ballad: broken chords in the left, soft chords in the right. Waltz: bass on 1, chord on 2 and 3. Gospel in twelve-eight: four slow beats, each split in three, with a rolling left hand.'),
    ],
    exercises: [
      ex('S14-9-a', 'Ballad under a voice', 'Left hand 1-5-8, right hand chords; the singer\'s tune plays above you.', 'treble', 'timed',
        parts([`${C}:2 ${C}:2 ${G}:2 ${G}:2 ${Am}:2 ${Am}:2 ${F}:2 ${F}:2`, 'RH'], ['C3:1 G3:1 C4:2 G2:1 D3:1 G3:2 A2:1 E3:1 A3:2 F2:1 C3:1 F3:2', 'LH']), ['rhythm'],
        { tempo: 72, backing: back('E5:2 D5:2 D5:2 B4:2 C5:2 E5:2 C5:4', 'RH', 0.55, 'melody') }),
      ex('S14-9-b', 'Waltz accompaniment', 'Bass on 1, chord on 2 and 3, under a tune.', 'treble', 'timed',
        parts(['R:1 E4+G4:1 E4+G4:1 R:1 D4+F4:1 D4+F4:1 R:1 D4+F4:1 D4+F4:1 R:1 E4+G4:1 E4+G4:1', 'RH'], ['C3:3 G2:3 G2:3 C3:3', 'LH']), ['rhythm'],
        { tempo: 96, timeSig: [3, 4], backing: back('G5:2 E5:1 D5:3 F5:2 D5:1 C5:3', 'RH', 0.5, 'melody') }),
      ex('S14-9-c', 'Gospel in twelve-eight', 'Four slow beats split in three: right-hand chords on each big beat, left hand rolling.', 'treble', 'timed',
        parts([`${C}:1.5 ${C}:1.5 ${C}:1.5 ${C}:1.5 ${F}:1.5 ${F}:1.5 ${F}:1.5 ${F}:1.5 ${C}:1.5 ${C}:1.5 ${C}:1.5 ${C}:1.5 ${G}:1.5 ${G}:1.5 ${C}:3`, 'RH'], ['C3:3 G2:3 F2:3 C3:3 C3:3 G2:3 G2:3 C3:3', 'LH']), ['rhythm'],
        { tempo: 54, timeSig: [12, 8] }),
    ],
  },
];

/** Level 9: the craft lessons from the review: fingering, pedaling, minor scales, ornaments. */
export const CRAFT_LESSONS: LessonDef[] = [
  {
    id: 'L9-5', level: 9, title: 'Fingering: crossings, substitution and choosing', prerequisites: ['L9-1'],
    summary: 'How to find a fingering that works, and the two tricks that make long lines smooth.',
    teach: [
      t('Crossings', 'The thumb passes under fingers 3 or 4 to go up (right hand), and fingers 3 or 4 cross over the thumb to go down. Keep the wrist level and let the thumb travel early, so there is no bump.'),
      t('Finger substitution', 'Hold a key down and quietly swap fingers on it (3 to 1, say) without letting go. Organists do this all the time; pianists use it to stay legato when they run out of fingers.'),
      t('Choosing a fingering', 'Look at the shape before you play: where does the line turn, and how far does it go? Put the thumb on white keys, avoid the thumb on black keys, plan crossings just after the turn, and write the fingering in. Use the same fingering every time.'),
    ],
    exercises: [
      ex('L9-5-a', 'Crossings up and down', 'A long line with planned crossings (fingers shown).', 'treble', 'wait',
        seqOf('C4:1 D4:1 E4:1 F4:1 G4:1 A4:1 B4:1 C5:1 D5:1 E5:1 D5:1 C5:1 B4:1 A4:1 G4:1 F4:1 E4:1 D4:1 C4:2', 'RH', [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique'], { grand: false }),
      ex('L9-5-b', 'A line that turns', 'Thumb tucks and crossings around a turning melody.', 'treble', 'timed',
        seqOf('E4:0.5 F4:0.5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 D4:0.5 E4:1', 'RH', [1, 2, 3, 1, 2, 3, 4, 3, 2, 1, 3, 2, 1, 2, 1]), ['fingerTechnique', 'rhythm'], { tempo: 66, grand: false }),
    ],
  },
  {
    id: 'L9-6', level: 9, title: 'Pedal like a pianist', prerequisites: ['L7-3'],
    summary: 'Legato (after-the-beat) pedaling, half pedal, and knowing when to leave it off.',
    teach: [
      t('Legato pedal', 'Play the chord, then press the pedal just after it sounds. At the next chord: play it, lift the pedal at the same moment, and press it down again right after. Up with the hands, down after the hands. This joins chords without blurring them.'),
      t('Half pedal', 'Press only part way, or lift only part way and press again. It thins the ringing without stopping it: useful in fast passages or when a melody moves by step.'),
      t('When to leave it off', 'No pedal for crisp staccato, for fast scales in the low register, or when the harmony changes on every note. If it sounds muddy, lift more often. Your ears decide, not a rule.'),
    ],
    exercises: [
      ex('L9-6-a', 'Chords, pedaled legato', 'Slow chords: lift and catch the pedal on each change (watch and listen).', 'treble', 'timed',
        parts([`${C}:4 ${Am}:4 ${F}:4 ${G}:4`, 'RH'], ['C3:4 A2:4 F2:4 G2:4', 'LH']), ['rhythm'], { tempo: 60 }),
      ex('L9-6-b', 'A melody over pedaled bass', 'Right-hand legato line, left-hand bass notes held by the pedal.', 'treble', 'timed',
        parts(['E5:1 D5:1 C5:1 D5:1 E5:2 E5:2 D5:1 C5:1 D5:1 B4:1 C5:4', 'RH'], ['C3:4 G2:4 F2:4 C3:4', 'LH']), ['rhythm'], { tempo: 66 }),
    ],
  },
  {
    id: 'L9-7', level: 9, title: 'Minor scales: natural, harmonic and melodic', prerequisites: ['L5-4'],
    summary: 'Three versions of the minor scale and why each exists.',
    teach: [
      t('Natural minor', 'A minor uses only white keys, from A to A. It shares its notes with C major (its relative major). It sounds calm and sad.', [57, 59, 60, 62, 64, 65, 67, 69], [57, 59, 60, 62, 64, 65, 67, 69]),
      t('Harmonic minor', 'Raise the 7th note (G to G sharp). Now the V chord is major and pulls strongly home. The big gap between F and G sharp gives it its Middle Eastern colour.', [57, 59, 60, 62, 64, 65, 68, 69], [57, 59, 60, 62, 64, 65, 68, 69]),
      t('Melodic minor', 'Going up, raise the 6th and 7th (F sharp, G sharp) for a smooth climb; coming down, use the natural minor. Singers and melodies love it.', [57, 59, 60, 62, 64, 66, 68, 69], [57, 59, 60, 62, 64, 66, 68, 69, 67, 65, 64, 62, 60, 59, 57]),
    ],
    exercises: [
      ex('L9-7-a', 'Three A minors', 'Natural, harmonic, then melodic (up and down).', 'treble', 'timed',
        seqOf('A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 F4:0.5 G4:0.5 A4:0.5 A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 F4:0.5 G#4:0.5 A4:0.5 A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 F#4:0.5 G#4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 D4:0.5 C4:0.5 B3:0.5 A3:1', 'RH',
          [1, 2, 3, 1, 2, 3, 4, 5, 1, 2, 3, 1, 2, 3, 4, 5, 1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]), ['fingerTechnique', 'noteReadingTreble'], { tempo: 72, grand: false }),
    ],
  },
  {
    id: 'L9-8', level: 9, title: 'Ornaments: grace notes, mordents, trills and tremolo', prerequisites: ['L9-1'],
    summary: 'The little decorations that make a melody speak.',
    teach: [
      t('Grace notes', 'A tiny note with a slash, crushed in just before the main note. Play both almost together and let the main note ring. Blues and gospel players do it with a black key slipping onto a white one.'),
      t('Mordents and turns', 'A mordent is a quick wiggle: the note, the note above (or below), and back. A turn goes above, main, below, main. In this app they are written out in small fast notes so you can learn the shape.'),
      t('Trills and tremolo', 'A trill alternates quickly between a note and the one above. A tremolo alternates quickly between two notes further apart, often an octave or a chord. Stay loose: speed comes from relaxation, not force.'),
    ],
    exercises: [
      ex('L9-8-a', 'Written-out ornaments', 'A mordent, a turn and a short trill, slowly then in time.', 'treble', 'timed',
        seqOf('C5:0.25 D5:0.25 C5:0.5 E5:1 F5:0.25 E5:0.25 D5:0.25 E5:0.25 G5:1 D5:0.25 E5:0.25 D5:0.25 E5:0.25 D5:0.25 E5:0.25 D5:0.25 C#5:0.25 D5:2', 'RH', [2, 3, 2, 4, 5, 4, 3, 4, 5, 2, 3, 2, 3, 2, 3, 2, 1, 2]), ['fingerTechnique', 'rhythm'], { tempo: 60, grand: false }),
      ex('L9-8-b', 'Octave tremolo', 'Left hand alternates C2 and C3, loose and even.', 'bass', 'timed',
        seqOf(rep('C2:0.25 C3:0.25', 8) + ' ' + rep('G1:0.25 G2:0.25', 8), 'LH'), ['fingerTechnique', 'rhythm'], { tempo: 60, grand: false }),
    ],
  },
];
