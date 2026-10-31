// A short original SATB chorale (voiced by a search that forbids parallel fifths/octaves) ("Maestro Chorale", written for this app, free to use) in hymn layout:
// two staves, soprano + alto on the treble staff, tenor + bass on the bass staff, as real choir and
// church music is printed. Generated as standard MusicXML so it goes through the same importer as user files.

const S = 'G4 E4 F4 G4 | A4 G4 E4:2 | F4 E4 D4 G4 | E4 D4 D4:2 | G4 A4 B4 C5 | A4 G4 E4:2 | F4 E4 D4 D4 | C4:4';
const A = 'C4 C4 C4 C4 | C4 C4 C4:2 | D4 C4 B3 C4 | C4 D4 D4:2 | C4 F4 D4 E4 | F4 E4 A3:2 | A3 A3 B3 B3 | G3:4';
const T = 'E3 G3 F3 E3 | F3 G3 A3:2 | A3 G3 G3 G3 | A3 B3 B3:2 | C4 C4 G3 G3 | F3 G3 A3:2 | A3 E3 G3 F3 | E3:4';
const B = 'C3 C3 A2 C3 | F3 E3 A3:2 | D3 E3 G3 E3 | C3 G3 G3:2 | E3 F3 G3 C3 | F3 C3 C3:2 | D3 C3 G2 G2 | C3:4';
const LYR = 'Sing a new song, raise the morn - ing light; Hear the voic - es, bright - ly join in one;'.split(/\s+/);

const STEPS = /^([A-G])(#|b)?(\d)$/;
const TYPE: Record<number, string> = { 1: 'quarter', 2: 'half', 4: 'whole', 3: 'half', 0.5: 'eighth' };

function measures(spec: string) {
  return spec.split('|').map((m) => m.trim().split(/\s+/).map((t) => { const [n, d] = t.split(':'); return { n, beats: +(d ?? 1) }; }));
}

function noteXml(n: string, beats: number, voice: number, staff: number, stem: 'up' | 'down', lyric?: string) {
  const [, step, acc, oct] = STEPS.exec(n)!;
  const alter = acc === '#' ? '<alter>1</alter>' : acc === 'b' ? '<alter>-1</alter>' : '';
  return `<note><pitch><step>${step}</step>${alter}<octave>${oct}</octave></pitch><duration>${beats * 2}</duration><voice>${voice}</voice><type>${TYPE[beats]}</type>${beats === 3 ? '<dot/>' : ''}<stem>${stem}</stem><staff>${staff}</staff>${lyric ? `<lyric number="1"><syllabic>single</syllabic><text>${lyric}</text></lyric>` : ''}</note>`;
}

export function demoChoraleXml(): string {
  const [s, a, t, b] = [S, A, T, B].map(measures);
  let li = 0;
  const body = s.map((_, mi) => {
    // tempo marks: a little faster for the second half, broadening in the last bar
    const tempoMark = mi === 4 ? `<direction placement="above"><direction-type><words>Più mosso</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>88</per-minute></metronome></direction-type><sound tempo="88"/></direction>`
      : mi === 7 ? `<direction placement="above"><direction-type><words>Broadly</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>` : '';
    const attrs = tempoMark + (mi === 0 ? `<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>76</per-minute></metronome></direction-type><sound tempo="76"/></direction>` : '');
    const v = (arr: typeof s, voice: number, staff: number, stem: 'up' | 'down', lyr = false) => arr[mi].map((x) => noteXml(x.n, x.beats, voice, staff, stem, lyr ? LYR[li++] : undefined)).join('');
    return `<measure number="${mi + 1}">${attrs}${v(s, 1, 1, 'up', true)}<backup><duration>8</duration></backup>${v(a, 2, 1, 'down')}<backup><duration>8</duration></backup>${v(t, 3, 2, 'up')}<backup><duration>8</duration></backup>${v(b, 4, 2, 'down')}${mi === s.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ''}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>Maestro Chorale</work-title></work><identification><creator type="composer">Maestro demo (original)</creator></identification>
<part-list><score-part id="P1"><part-name>Choir</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}
