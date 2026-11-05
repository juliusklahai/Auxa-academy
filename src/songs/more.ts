// More songs for the library: public-domain tunes in simple original arrangements, and original
// practice pieces written for this app (fictional titles, free to use). Graded Beginner -> Advanced.
import type { SongSpec } from './build';
import type { Groove, Song } from './index';

const piano = (rh: string, lh: string) => ({ id: 'P1', name: 'Piano', program: 1, staves: [{ clef: 'G' as const, music: rh }, { clef: 'F' as const, music: lh }] });
const line = (id: string, name: string, program: number, clef: 'G' | 'F', music: string) => ({ id, name, program, staves: [{ clef, music }] });

interface Def {
  id: string; title: string; composer: string; level: Song['level']; groove: Groove; about: string;
  fifths: number; beats: number; beatType?: number; tempo: number; pickup?: boolean;
  rh: string; lh: string; extra?: { name: string; program: number; clef: 'G' | 'F'; music: string; color: Song['colors'][string] }[];
  original?: boolean;
}
function song(d: Def): Song {
  const parts = [piano(d.rh, d.lh), ...(d.extra ?? []).map((x, i) => line(`P${i + 2}`, x.name, x.program, x.clef, x.music))];
  const spec: SongSpec = { title: d.title, composer: d.composer, arranger: d.original ? undefined : 'Maestro arrangement', fifths: d.fifths, beats: d.beats, beatType: d.beatType ?? 4, tempo: d.tempo, pickup: d.pickup, parts };
  const colors: Song['colors'] = {};
  (d.extra ?? []).forEach((x, i) => { colors[`P${i + 2}`] = x.color; });
  return { id: d.id, title: d.title, composer: d.composer, level: d.level, groove: d.groove, about: d.about, spec, colors, original: d.original };
}
const flute = (music: string) => ({ name: 'Flute', program: 74, clef: 'G' as const, music, color: 'flute' as const });
const violin = (music: string) => ({ name: 'Violin', program: 41, clef: 'G' as const, music, color: 'violin' as const });
const cello = (music: string) => ({ name: 'Cello', program: 43, clef: 'F' as const, music, color: 'cello' as const });
const strings = (music: string) => ({ name: 'Strings', program: 49, clef: 'F' as const, music, color: 'strings' as const });

export const MORE_SONGS: Song[] = [
  // ---------------- Beginner ----------------
  song({
    id: 'hotcross', title: 'Hot Cross Buns', composer: 'Traditional', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 88,
    about: 'Only three notes: E, D and C with fingers 3, 2, 1. Left hand plays C and G.',
    rh: 'E4 D4 C4:2 | E4 D4 C4:2 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 | E4 D4 C4:2',
    lh: 'C3:4 | G2:2 C3:2 | C3:2 G2:2 | G2:2 C3:2',
  }),
  song({
    id: 'mary', title: 'Mary Had a Little Lamb', composer: 'Traditional (USA, 1830)', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 96,
    about: 'Right hand on C D E G. Left hand plays one long note per bar.',
    rh: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4',
    lh: 'C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4',
    extra: [cello('C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4')],
  }),
  song({
    id: 'frere', title: 'Frère Jacques', composer: 'Traditional French', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 100,
    about: 'The famous round. Right hand moves from C position to G and back. Flute plays the round two bars behind you.',
    rh: 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2',
    lh: 'C3:4 | C3:4 | C3:4 | C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:4',
    extra: [flute('R:4 | R:4 | C5 D5 E5 C5 | C5 D5 E5 C5 | E5 F5 G5:2 | E5 F5 G5:2 | G5:0.5 A5:0.5 G5:0.5 F5:0.5 E5 C5 | C5 G4 C5:2')],
  }),
  song({
    id: 'aucl', title: 'Au Clair de la Lune', composer: 'Traditional French (18th century)', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 92,
    about: 'A gentle moonlight song. Right hand from G below middle C up to E. Left hand alternates C and G.',
    rh: 'C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | D4 D4 D4 D4 | A3:2 A3:2 | D4 C4 B3 A3 | G3:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4',
    lh: 'C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4 | C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4 | G2:4 | F2:4 | D2:2 D3:2 | G2:4 | C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4',
    extra: [strings('E3+G3:4 | E3+G3:2 D3+G3:2 | E3+G3:2 D3+F3:2 | E3+G3:4 | E3+G3:4 | E3+G3:2 D3+G3:2 | E3+G3:2 D3+F3:2 | E3+G3:4 | D3+F#3:4 | C3+F3:4 | D3+F#3:4 | B2+D3:4 | E3+G3:4 | E3+G3:2 D3+G3:2 | E3+G3:2 D3+F3:2 | E3+G3:4')],
  }),
  song({
    id: 'london', title: 'London Bridge', composer: 'Traditional English', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 100,
    about: 'A dotted rhythm at the start of each line. Right hand in C position plus A.',
    rh: 'G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 | G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3',
    lh: 'C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4',
  }),
  song({
    id: 'jingle', title: 'Jingle Bells (chorus)', composer: 'James Lord Pierpont (1857)', level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 112,
    about: 'Repeated notes and one stretch up to G. Left hand plays the bass on beats 1 and 3. Violin adds bells on top.',
    rh: 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4 F4 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4',
    lh: 'C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | F2:2 C3:2 | C3:2 G2:2 | G2:2 D3:2 | G2:2 B2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | F2:2 C3:2 | C3:2 G2:2 | G2:2 G2:2 | C3:4',
    extra: [violin('G5:0.5 R:0.5 G5:0.5 R:0.5 G5:2 | G5:0.5 R:0.5 G5:0.5 R:0.5 G5:2 | G5:2 E5:2 | C5:4 | A5:2 F5:2 | G5:2 E5:2 | F5:2 B4:2 | B4:2 D5:2 | G5:0.5 R:0.5 G5:0.5 R:0.5 G5:2 | G5:0.5 R:0.5 G5:0.5 R:0.5 G5:2 | G5:2 E5:2 | C5:4 | A5:2 F5:2 | G5:2 E5:2 | D5:2 B4:2 | C5:4')],
  }),
  song({
    id: 'row', title: 'Row, Row, Row Your Boat', composer: 'Traditional (1852)', level: 'Beginner', groove: 'gentle6', fifths: 0, beats: 6, beatType: 8, tempo: 92,
    about: 'Your first 6/8: two big beats per bar, each split in three. Right hand climbs C to G and back.',
    rh: 'C4:1.5 C4:1.5 | C4:1 D4:0.5 E4:1.5 | E4:1 D4:0.5 E4:1 F4:0.5 | G4:3 | C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 | E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 | G4:1 F4:0.5 E4:1 D4:0.5 | C4:3',
    lh: 'C3:3 | C3:3 | G2:3 | C3:3 | C3:3 | C3:3 | G2:3 | C3:3',
  }),
  song({
    id: 'o-firstsong', title: 'Little Copper Kite', composer: 'Maestro original', original: true, level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 90,
    about: 'Original practice piece in C position. Steps, one small skip, and a left hand that only plays C and G.',
    rh: 'C4 D4 E4:2 | E4 F4 G4:2 | G4 F4 E4 D4 | C4:2 E4:2 | D4 E4 F4:2 | G4 E4 C4:2 | D4 D4 E4 D4 | C4:4',
    lh: 'C3:4 | C3:4 | G2:4 | C3:4 | G2:4 | C3:4 | G2:4 | C3:4',
    extra: [flute('E5:4 | G5:4 | B4:4 | C5:4 | B4:4 | C5:4 | B4:2 G4:2 | C5:4')],
  }),
  song({
    id: 'o-robot', title: 'Robot Parade', composer: 'Maestro original', original: true, level: 'Beginner', groove: 'soft', fifths: 0, beats: 4, tempo: 104,
    about: 'Original piece for steady pulse: hands take turns, so you never play both at once.',
    rh: 'C4 C4 G4:2 | R:4 | E4 E4 G4:2 | R:4 | F4 E4 D4 C4 | R:4 | D4 E4 C4:2 | R:4',
    lh: 'R:4 | C3 C3 G2:2 | R:4 | C3 E3 G3:2 | R:4 | F3 E3 D3 C3 | R:4 | G2 G2 C3:2',
  }),
  // ---------------- Easy ----------------
  song({
    id: 'saints', title: 'When the Saints Go Marching In', composer: 'Traditional spiritual', level: 'Easy', groove: 'soft', fifths: 0, beats: 4, tempo: 108,
    about: 'Rests at the start of phrases, long held notes and a bouncy left hand.',
    rh: 'R C4 E4 F4 | G4:4 | R C4 E4 F4 | G4:4 | R C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | R E4 E4 D4 | C4:3 C4 | E4:2 G4 G4 | G4 F4:3 | R E4 F4 G4 | E4:2 C4:2 | D4:2 D4:2 | C4:4',
    lh: 'C3:4 | C3 G3 E3 G3 | C3:4 | C3 G3 E3 G3 | C3:4 | C3 G3 E3 G3 | C3:4 | G2 D3 B2 D3 | G2:4 | C3 G3 E3 G3 | C3:4 | F2 C3 A2 C3 | C3:4 | C3 G3 E3 G3 | G2 D3 B2 D3 | C3:4',
    extra: [violin('R:4 | E5:4 | R:4 | E5:4 | R:4 | E5:2 C5:2 | G4:2 C5:2 | B4:4 | R:4 | E5:4 | G5:4 | A5:4 | R:4 | G5:2 E5:2 | F5:2 B4:2 | C5:4')],
  }),
  song({
    id: 'amazing', title: 'Amazing Grace', composer: 'Traditional (words John Newton, 1779)', level: 'Easy', groove: 'waltz', fifths: 1, beats: 3, tempo: 76, pickup: true,
    about: 'A hymn in 3/4 in G major (one sharp, F#). Left hand plays the bass and a light chord.',
    rh: 'D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | D5:3 | D5:2 B4 | D5:1.5 B4:0.5 G4 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:2',
    lh: 'R | G2 B2+D3 B2+D3 | G2 B2+D3 B2+D3 | C3 E3+G3 E3+G3 | G2 B2+D3 B2+D3 | G2 B2+D3 B2+D3 | E2 G2+B2 G2+B2 | D2 F#2+A2 F#2+A2 | G2 B2+D3 B2+D3 | G2 B2+D3 B2+D3 | D2 F#2+A2 F#2+A2 | C3 E3+G3 E3+G3 | G2 B2+D3 B2+D3 | G2 B2+D3 B2+D3 | D2 F#2+A2 F#2+A2 | G2:2',
    extra: [strings('R | G3:3 | G3:3 | E3:3 | D3:3 | G3:3 | E3:3 | F#3:3 | G3:3 | G3:3 | F#3:3 | E3:3 | D3:3 | G3:3 | F#3:3 | G3:2')],
  }),
  song({
    id: 'scarborough', title: 'Scarborough Fair', composer: 'Traditional English', level: 'Easy', groove: 'waltz', fifths: -1, beats: 3, tempo: 84,
    about: 'A haunting folk song in D Dorian (a minor-sounding mode). Left hand holds open fifths.',
    rh: 'D4:2 D4 | A4:2 A4 | E4:1.5 F4:0.5 E4 | D4:3 | R A4 C5 | D5:2 C5 | A4 B4 G4 | A4:3 | D5:2 D5 | C5:2 A4 | A4 G4 F4 | E4 C4:2 | D4:2 A4 | G4:2 F4 | E4 D4 C4 | D4:3',
    lh: 'D3+A3:3 | D3+A3:3 | C3+G3:3 | D3+A3:3 | D3+A3:3 | D3+A3:3 | G2+D3:3 | A2+E3:3 | D3+A3:3 | F2+C3:3 | D3+A3:3 | C3+G3:3 | D3+A3:3 | G2+D3:3 | C3+G3:3 | D3+A3:3',
    extra: [flute('R:3 | R:3 | R:3 | A5:3 | F5:3 | F5:3 | E5:3 | E5:3 | F5:3 | E5:3 | D5:3 | C5:3 | A5:3 | B5:3 | G5:3 | F5:3')],
  }),
  song({
    id: 'brahms', title: 'Lullaby (Wiegenlied)', composer: 'Johannes Brahms (1868)', level: 'Easy', groove: 'waltz', fifths: 0, beats: 3, tempo: 80, pickup: true,
    about: 'The famous lullaby in 3/4. Right hand rocks gently with repeated notes; left hand plays a soft waltz bass.',
    rh: 'E4:0.5 E4:0.5 | G4:2 E4:0.5 E4:0.5 | G4:2 E4:0.5 G4:0.5 | C5 B4:1.5 A4:0.5 | A4 G4 D4:0.5 E4:0.5 | F4 D4 D4:0.5 E4:0.5 | F4:2 D4:0.5 F4:0.5 | B4 A4 G4 | B4 C5:2',
    lh: 'R | C3 E3+G3 E3+G3 | C3 E3+G3 E3+G3 | F2 A2+C3 A2+C3 | C3 E3+G3 E3+G3 | G2 B2+D3 B2+D3 | G2 B2+D3 B2+D3 | G2 B2+F3 B2+F3 | C3 E3+G3:2',
  }),
  song({
    id: 'o-harbor', title: 'Harbor Lights at Dusk', composer: 'Maestro original', original: true, level: 'Easy', groove: 'gentle6', fifths: 1, beats: 3, tempo: 84,
    about: 'Original piece in G major. The left hand plays broken chords (root, fifth, tenth); the right hand sings over it.',
    rh: 'B4:2 A4 | G4:2 D4 | E4 F#4 G4 | A4:3 | B4:2 C5 | D5:2 B4 | A4 G4 F#4 | G4:3',
    lh: 'G2 D3 B3 | E2 B2 G3 | C3 G3 E3 | D3 A3 F#3 | G2 D3 B3 | B2 F#3 D3 | D3 A3 C4 | G2 D3 G3',
    extra: [cello('G2:3 | E2:3 | C3:3 | D3:3 | G2:3 | B2:3 | D3:3 | G2:3')],
  }),
  song({
    id: 'o-rain', title: 'Rainy Window Waltz', composer: 'Maestro original', original: true, level: 'Easy', groove: 'waltz', fifths: -1, beats: 3, tempo: 100,
    about: 'Original waltz in F major with B flat. Oom-pah-pah left hand, flowing right hand with eighth notes.',
    rh: 'A4 C5 F5 | E5:2 D5 | C5:0.5 D5:0.5 C5 Bb4 | A4:3 | G4 A4 Bb4 | C5:2 A4 | G4:0.5 A4:0.5 G4 E4 | F4:3',
    lh: 'F2 A2+C3 A2+C3 | C3 E3+G3 E3+G3 | F2 A2+C3 A2+C3 | F2 A2+C3 A2+C3 | C3 E3+Bb3 E3+Bb3 | F2 A2+C3 A2+C3 | C3 E3+Bb3 E3+Bb3 | F2 A2+C3 A2+C3',
  }),
  // ---------------- Intermediate ----------------
  song({
    id: 'gymno', title: 'Gymnopédie No. 1 (opening)', composer: 'Erik Satie (1888)', level: 'Intermediate', groove: 'none', fifths: 2, beats: 3, tempo: 66,
    about: 'Slow and calm in 3/4. Left hand: a low note then a soft chord, alternating G and D. The right hand floats on top.',
    rh: 'R:3 | R:3 | R:3 | R:3 | R F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4:3 | F#4:3 | R:3 | R F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4:3 | C#5:3 | F#5:3',
    lh: 'G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2 | G2 B3+D4+F#4:2 | D2 A3+C#4+F#4:2',
  }),
  song({
    id: 'turkish', title: 'Turkish March (theme, simplified)', composer: 'Wolfgang Amadeus Mozart (1783)', level: 'Intermediate', groove: 'none', fifths: 0, beats: 2, tempo: 112,
    about: 'Sixteenth-note turns in A minor. Left hand plays light broken chords. Practice slowly first, then build speed.',
    rh: 'B4:0.25 A4:0.25 G#4:0.25 A4:0.25 C5:1 | D5:0.25 C5:0.25 B4:0.25 C5:0.25 E5:1 | F5:0.25 E5:0.25 D#5:0.25 E5:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 | B5:0.25 A5:0.25 G#5:0.25 A5:0.25 C6:1 | A5:0.5 C6:0.5 B5:0.5 A5:0.5 | G#5:0.5 A5:0.5 E5:0.5 F5:0.5 | D5:0.5 C5:0.5 B4:0.5 E5:0.5 | A4:2',
    lh: 'A2:0.5 E3+C4:0.5 E3+C4:0.5 E3+C4:0.5 | A2:0.5 E3+C4:0.5 E3+C4:0.5 E3+C4:0.5 | A2:0.5 E3+C4:0.5 E3+C4:0.5 E3+C4:0.5 | A2:0.5 E3+C4:0.5 E3+C4:0.5 E3+C4:0.5 | A2:0.5 E3+C4:0.5 D3+F3:0.5 D3+F3:0.5 | E3+B3:0.5 E3+C4:0.5 C3+A3:0.5 D3+A3:0.5 | E3+G#3:0.5 E3+A3:0.5 E3+G#3:0.5 E2:0.5 | A2:2',
  }),
  song({
    id: 'o-fox', title: 'The Wandering Fox', composer: 'Maestro original', original: true, level: 'Intermediate', groove: 'soft', fifths: 0, beats: 4, tempo: 96,
    about: 'Original piece in A minor with syncopation and an Alberti bass in the left hand.',
    rh: 'A4 C5:0.5 E5:1.5 D5 | C5:0.5 B4:0.5 A4 B4:2 | G#4 B4:0.5 E5:1.5 D5 | C5:0.5 B4:0.5 C5 A4:2 | F5 E5:0.5 D5:1.5 C5 | D5:0.5 C5:0.5 B4 C5:2 | B4:0.5 C5:0.5 D5 E5 G#4 | A4:4',
    lh: 'A2:0.5 E3:0.5 C3:0.5 E3:0.5 A2:0.5 E3:0.5 C3:0.5 E3:0.5 | G2:0.5 D3:0.5 B2:0.5 D3:0.5 G2:0.5 D3:0.5 B2:0.5 D3:0.5 | E2:0.5 B2:0.5 G#2:0.5 B2:0.5 E2:0.5 B2:0.5 G#2:0.5 B2:0.5 | A2:0.5 E3:0.5 C3:0.5 E3:0.5 A2:0.5 E3:0.5 C3:0.5 E3:0.5 | D2:0.5 A2:0.5 F2:0.5 A2:0.5 D2:0.5 A2:0.5 F2:0.5 A2:0.5 | G2:0.5 D3:0.5 B2:0.5 D3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 | E2:0.5 B2:0.5 G#2:0.5 B2:0.5 E2:0.5 B2:0.5 G#2:0.5 B2:0.5 | A2:4',
    extra: [violin('E5:4 | D5:4 | B4:4 | C5:4 | A5:4 | G5:2 E5:2 | E5:2 B4:2 | A4:4')],
  }),
  song({
    id: 'o-lighthouse', title: 'Lighthouse Nocturne', composer: 'Maestro original', original: true, level: 'Intermediate', groove: 'none', fifths: -3, beats: 4, tempo: 70,
    about: 'Original nocturne in E flat major (three flats). Wide left-hand arpeggios under a singing melody.',
    rh: 'G4:2 Bb4:1.5 Ab4:0.5 | G4:3 Eb4 | F4:2 Ab4:1.5 G4:0.5 | F4:4 | Eb5:2 D5:1.5 C5:0.5 | Bb4:2 G4:2 | Ab4:1.5 G4:0.5 F4 D4 | Eb4:4',
    lh: 'Eb2:0.5 Bb2:0.5 Eb3:0.5 G3:0.5 Bb3:0.5 G3:0.5 Eb3:0.5 Bb2:0.5 | Eb2:0.5 Bb2:0.5 Eb3:0.5 G3:0.5 Bb3:0.5 G3:0.5 Eb3:0.5 Bb2:0.5 | Bb1:0.5 F2:0.5 Bb2:0.5 D3:0.5 Ab3:0.5 D3:0.5 Bb2:0.5 F2:0.5 | Bb1:0.5 F2:0.5 Bb2:0.5 D3:0.5 Ab3:0.5 D3:0.5 Bb2:0.5 F2:0.5 | C2:0.5 G2:0.5 C3:0.5 Eb3:0.5 G3:0.5 Eb3:0.5 C3:0.5 G2:0.5 | G1:0.5 D2:0.5 G2:0.5 Bb2:0.5 D3:0.5 Bb2:0.5 G2:0.5 D2:0.5 | Ab1:0.5 Eb2:0.5 Ab2:0.5 C3:0.5 Bb1:0.5 F2:0.5 Bb2:0.5 D3:0.5 | Eb2:0.5 Bb2:0.5 Eb3:0.5 G3:0.5 Eb3:2',
    extra: [strings('Eb3+G3:4 | Eb3+G3:4 | D3+Ab3:4 | D3+Ab3:4 | C3+G3:4 | D3+G3:4 | C3+F3:2 D3+F3:2 | Eb3+G3:4')],
  }),
  // ---------------- Advanced ----------------
  song({
    id: 'bachprelude', title: 'Prelude in C (opening)', composer: 'Johann Sebastian Bach (1722)', level: 'Advanced', groove: 'none', fifths: 0, beats: 4, tempo: 66,
    about: 'From the Well-Tempered Clavier. The left hand holds the bass while the right hand repeats a broken-chord figure; every bar is a new harmony.',
    rh: 'R:0.5 G4:0.5 C5:0.5 E5:0.5 G4:0.5 C5:0.5 E5:0.5 R:0.5 | R:0.5 A4:0.5 D5:0.5 F5:0.5 A4:0.5 D5:0.5 F5:0.5 R:0.5 | R:0.5 G4:0.5 D5:0.5 F5:0.5 G4:0.5 D5:0.5 F5:0.5 R:0.5 | R:0.5 G4:0.5 C5:0.5 E5:0.5 G4:0.5 C5:0.5 E5:0.5 R:0.5 | R:0.5 A4:0.5 E5:0.5 A5:0.5 A4:0.5 E5:0.5 A5:0.5 R:0.5 | R:0.5 F#4:0.5 A4:0.5 D5:0.5 F#4:0.5 A4:0.5 D5:0.5 R:0.5 | R:0.5 G4:0.5 D5:0.5 G5:0.5 G4:0.5 D5:0.5 G5:0.5 R:0.5 | R:0.5 E4:0.5 G4:0.5 C5:0.5 E4:0.5 G4:0.5 C5:0.5 R:0.5 | R:0.5 E4:0.5 G4:0.5 C5:0.5 E4:0.5 G4:0.5 C5:0.5 R:0.5 | R:0.5 D4:0.5 F#4:0.5 C5:0.5 D4:0.5 F#4:0.5 C5:0.5 R:0.5 | R:0.5 D4:0.5 G4:0.5 B4:0.5 D4:0.5 G4:0.5 B4:0.5 R:0.5 | C4+E4+G4+C5:4',
    lh: 'C4+E4:4 | C4+D4:4 | B3+D4:4 | C4+E4:4 | C4+E4:4 | C4+D4:4 | B3+D4:4 | B3+C4:4 | A3+C4:4 | D3+A3:4 | G3+B3:4 | C3:4',
  }),
  song({
    id: 'o-toccatina', title: 'Copper Comet Toccatina', composer: 'Maestro original', original: true, level: 'Advanced', groove: 'soft', fifths: 4, beats: 4, tempo: 108,
    about: 'Original study in E major (four sharps): sixteenth-note runs in the right hand, octave leaps and chords in the left.',
    rh: 'E5:0.25 D#5:0.25 C#5:0.25 B4:0.25 G#4:0.25 B4:0.25 E5:0.25 G#5:0.25 F#5:0.25 E5:0.25 D#5:0.25 C#5:0.25 B4:1 | A4:0.25 B4:0.25 C#5:0.25 D#5:0.25 E5:0.25 F#5:0.25 G#5:0.25 A5:0.25 G#5:1 E5:1 | C#5:0.25 D#5:0.25 E5:0.25 C#5:0.25 A4:0.25 C#5:0.25 E5:0.25 A5:0.25 G#5:0.25 F#5:0.25 E5:0.25 D#5:0.25 C#5:1 | B4:0.25 C#5:0.25 D#5:0.25 E5:0.25 F#5:0.25 G#5:0.25 A5:0.25 B5:0.25 E6:2',
    lh: 'E2:0.5 E3:0.5 G#3+B3:1 B1:0.5 B2:0.5 F#3+A3:1 | A1:0.5 A2:0.5 C#3+E3:1 E2:0.5 E3:0.5 G#3+B3:1 | A1:0.5 A2:0.5 C#3+E3:1 F#2:0.5 F#3:0.5 A3+C#4:1 | B1:0.5 B2:0.5 D#3+F#3+A3:1 E2:0.5 B2:0.5 E3+G#3+B3:1',
    extra: [cello('E2:2 B1:2 | A1:2 E2:2 | A1:2 F#2:2 | B1:2 E2:2')],
  }),
];
