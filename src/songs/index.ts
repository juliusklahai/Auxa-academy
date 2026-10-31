// Built-in song library: public-domain melodies in simple original arrangements for this app.
// Each has piano right hand + left hand (practice either or both) and play-along instruments.
import { buildSongXml, type SongSpec } from './build';
import type { Instrument } from '../audio/engine';

export type Groove = 'none' | 'soft' | 'waltz' | 'gentle6';
export interface Song { id: string; title: string; composer: string; level: 'Beginner' | 'Easy' | 'Intermediate'; about: string; groove: Groove; spec: SongSpec; colors: Partial<Record<string, Instrument>> }

const piano = (rh: string, lh: string) => ({ id: 'P1', name: 'Piano', program: 1, staves: [{ clef: 'G' as const, music: rh }, { clef: 'F' as const, music: lh }] });
const line = (id: string, name: string, program: number, clef: 'G' | 'F', music: string) => ({ id, name, program, staves: [{ clef, music }] });

export const SONGS: Song[] = [
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional (French, 1761)', level: 'Beginner', groove: 'soft',
    about: 'Right hand in C position, left hand plays one bass note per half bar. Violin sings a gentle counter-melody, cello holds the bass.',
    colors: { P2: 'violin', P3: 'cello' },
    spec: {
      title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional', arranger: 'Maestro arrangement', fifths: 0, beats: 4, beatType: 4, tempo: 92,
      parts: [
        piano(
          'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
          'C3:4 | F3:2 C3:2 | F3:2 C3:2 | G3:2 C3:2 | C3:2 F3:2 | C3:2 G3:2 | C3:2 F3:2 | C3:2 G3:2 | C3:4 | F3:2 C3:2 | F3:2 C3:2 | G3:2 C3:2'),
        line('P2', 'Violin', 41, 'G', 'E5:4 | F5:2 E5:2 | A4:2 G4:2 | B4:2 C5:2 | E5:2 F5:2 | G5:2 F5:2 | E5:2 D5:2 | C5:2 B4:2 | E5:4 | F5:2 E5:2 | A5:2 G5:2 | F5:2 E5:2'),
        line('P3', 'Cello', 43, 'F', 'C3:4 | F2:2 C3:2 | F2:2 C3:2 | G2:2 C3:2 | C3:2 F2:2 | C3:2 G2:2 | C3:2 F2:2 | C3:2 G2:2 | C3:4 | F2:2 C3:2 | F2:2 C3:2 | G2:2 C3:2'),
      ],
    },
  },
  {
    id: 'ode', title: 'Ode to Joy', composer: 'Ludwig van Beethoven (1824)', level: 'Beginner', groove: 'soft',
    about: 'The full 16-bar theme. Right hand stays in C position; left hand alternates C and G. The violin joins an octave higher at the climax.',
    colors: { P2: 'violin', P3: 'cello' },
    spec: {
      title: 'Ode to Joy', composer: 'Ludwig van Beethoven', arranger: 'Maestro arrangement', fifths: 0, beats: 4, beatType: 4, tempo: 100,
      parts: [
        piano(
          'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 | D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
          'C3:4 | G2:4 | C3:4 | G2:2 G2:2 | C3:4 | G2:4 | C3:4 | G2:2 C3:2 | G2:2 C3:2 | G2:2 C3:2 | G2:4 | C3:2 G2:2 | C3:4 | G2:4 | C3:4 | G2:2 C3:2'),
        line('P2', 'Violin', 41, 'G', 'G4:4 | B4:4 | G4:4 | G4:2 B4:2 | C5:4 | B4:4 | E5:4 | F5:2 E5:2 | B4:2 C5:2 | B4:2 G4:2 | B4:2 D5:2 | E5:2 D5:2 | E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5:1.5 C5:0.5 C5:2'),
        line('P3', 'Cello', 43, 'F', 'C3:4 | G2:4 | C3:4 | G2:2 G2:2 | C3:4 | G2:4 | C3:4 | G2:2 C3:2 | G2:2 C3:2 | G2:2 C3:2 | G2:4 | C3:2 G2:2 | C3:4 | G2:4 | C3:4 | G2:2 C3:2'),
      ],
    },
  },
  {
    id: 'minuet', title: 'Minuet in G', composer: 'Christian Petzold (c. 1725)', level: 'Easy', groove: 'waltz',
    about: 'A dance in 3/4 from the Notebook for Anna Magdalena Bach. Right hand: quarter notes and running eighths. Left hand: one note per bar. Flute doubles your melody.',
    colors: { P2: 'flute', P3: 'cello' },
    spec: {
      title: 'Minuet in G', composer: 'Christian Petzold (attr.)', arranger: 'Maestro arrangement', fifths: 1, beats: 3, beatType: 4, tempo: 104,
      parts: [
        piano(
          'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3 | D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | A4 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 | G4:3',
          'G3:3 | B3:3 | C4:3 | B3:3 | A3:3 | G3:3 | D3:3 | D3:3 | G3:3 | B3:3 | C4:3 | B3:3 | A3:3 | G3:3 | D3:3 | G2:3'),
        line('P2', 'Flute', 74, 'G', 'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3 | D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | A4 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 | G4:3'),
        line('P3', 'Cello', 43, 'F', 'G2:3 | B2:3 | C3:3 | B2:3 | A2:3 | G2:3 | D3:3 | D3:3 | G2:3 | B2:3 | C3:3 | B2:3 | A2:3 | G2:3 | D3:3 | G2:3'),
      ],
    },
  },
  {
    id: 'elise', title: 'Für Elise (opening)', composer: 'Ludwig van Beethoven (1810)', level: 'Intermediate', groove: 'none',
    about: 'The famous opening in 3/8. Right hand: the E-D# turn and broken chords. Left hand: rising A minor and E major arpeggios, passed smoothly to the right hand. Soft strings support the harmony.',
    colors: { P2: 'strings' },
    spec: {
      title: 'Für Elise (opening)', composer: 'Ludwig van Beethoven', arranger: 'Maestro arrangement', fifths: 0, beats: 3, beatType: 8, tempo: 66, pickup: true,
      parts: [
        piano(
          'E5:0.25 D#5:0.25 | E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 | A4:0.5 R:0.25 C4:0.25 E4:0.25 A4:0.25 | B4:0.5 R:0.25 E4:0.25 G#4:0.25 B4:0.25 | C5:0.5 R:0.25 E4:0.25 E5:0.25 D#5:0.25 | E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 | A4:0.5 R:0.25 C4:0.25 E4:0.25 A4:0.25 | B4:0.5 R:0.25 E4:0.25 C5:0.25 B4:0.25 | A4:1',
          'R:0.5 | R:1.5 | A2:0.25 E3:0.25 A3:0.25 R:0.75 | E2:0.25 E3:0.25 G#3:0.25 R:0.75 | A2:0.25 E3:0.25 A3:0.25 R:0.75 | R:1.5 | A2:0.25 E3:0.25 A3:0.25 R:0.75 | E2:0.25 E3:0.25 G#3:0.25 R:0.75 | A2:0.25 E3:0.25 A3:0.25 R:0.25'),
        line('P2', 'Strings', 49, 'F', 'R:0.5 | R:1.5 | A3+C4+E4:1.5 | G#3+B3+E4:1.5 | A3+C4+E4:1.5 | R:1.5 | A3+C4+E4:1.5 | G#3+B3+E4:1.5 | A3+C4+E4:1'),
      ],
    },
  },
  {
    id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel (c. 1680)', level: 'Easy', groove: 'none',
    about: 'Right hand plays the chord changes as half-note triads; left hand plays the famous repeating bass. The violin sings the canon melody above you.',
    colors: { P2: 'violin', P3: 'cello' },
    spec: {
      title: 'Canon in D', composer: 'Johann Pachelbel', arranger: 'Maestro arrangement', fifths: 2, beats: 4, beatType: 4, tempo: 66,
      parts: [
        piano(
          'D4+F#4+A4:2 C#4+E4+A4:2 | D4+F#4+B4:2 C#4+F#4+A4:2 | D4+G4+B4:2 D4+F#4+A4:2 | D4+G4+B4:2 C#4+E4+A4:2 | D4+F#4+A4:2 C#4+E4+A4:2 | D4+F#4+B4:2 C#4+F#4+A4:2 | D4+G4+B4:2 D4+F#4+A4:2 | D4+G4+B4:2 C#4+E4+A4:2 | D4+F#4+A4:4',
          'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D3:2 | G2:2 A2:2 | D3:2 A2:2 | B2:2 F#2:2 | G2:2 D3:2 | G2:2 A2:2 | D3:4'),
        line('P2', 'Violin', 41, 'G', 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | D5 F#5 E5 C#5 | D5 B4 C#5 A4 | B4 D5 A4 F#4 | G4 B4 A4 C#5 | D5:4'),
        line('P3', 'Cello', 43, 'F', 'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2 | D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2 | D2:4'),
      ],
    },
  },
  {
    id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional English (16th century)', level: 'Easy', groove: 'waltz',
    about: 'A flowing melody in 3/4 with dotted rhythms. Left hand plays one low note per bar. The flute guides the tune and strings fill the harmony.',
    colors: { P2: 'flute', P3: 'strings' },
    spec: {
      title: 'Greensleeves', composer: 'Traditional', arranger: 'Maestro arrangement', fifths: 0, beats: 3, beatType: 4, tempo: 92, pickup: true,
      parts: [
        piano(
          'A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:2 A4 | A4:1.5 G#4:0.5 A4 | B4:2 G#4 | E4:2 A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:1.5 B4:0.5 A4 | G#4:1.5 F#4:0.5 G#4 | A4:2',
          'R | A2:3 | C3:3 | G2:3 | E2:3 | A2:3 | A2:3 | E2:3 | A2:3 | A2:3 | C3:3 | G2:3 | E2:3 | A2:3 | E2:3 | A2:2'),
        line('P2', 'Flute', 74, 'G', 'A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:2 A4 | A4:1.5 G#4:0.5 A4 | B4:2 G#4 | E4:2 A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:1.5 B4:0.5 A4 | G#4:1.5 F#4:0.5 G#4 | A4:2'),
        line('P3', 'Strings', 49, 'F', 'R | A3+C4+E4:3 | G3+C4+E4:3 | G3+B3+D4:3 | G3+B3+E4:3 | A3+C4+E4:3 | A3+C4+E4:3 | G#3+B3+E4:3 | A3+C4+E4:3 | A3+C4+E4:3 | G3+C4+E4:3 | G3+B3+D4:3 | G3+B3+E4:3 | A3+C4+E4:3 | G#3+B3+E4:3 | A3+C4+E4:2'),
      ],
    },
  },
];

const cache = new Map<string, string>();
export function songXml(id: string): string {
  if (!cache.has(id)) { const s = SONGS.find((x) => x.id === id)!; cache.set(id, buildSongXml(s.spec)); }
  return cache.get(id)!;
}
export const songByTitle = (title: string) => SONGS.find((s) => s.spec.title === title);
