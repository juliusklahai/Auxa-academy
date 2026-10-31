// Tiny MusicXML writer for the built-in song library. Songs are written as compact text,
// turned into standard MusicXML, and then go through the same importer as user files.
//
// Note tokens: "E5:0.5" (pitch:quarters), "C4+E4+G4:2" (chord), "R:1" (rest). Default length 1.
// Measures are separated by "|". Accidentals: "#" sharp, "b" flat (e.g. "F#4", "Bb3").

export interface StaffSpec { clef: 'G' | 'F'; music: string }
export interface PartSpec { id: string; name: string; program: number; staves: StaffSpec[] }
export interface SongSpec {
  title: string; composer: string; arranger?: string;
  fifths: number; beats: number; beatType: number; tempo: number;
  pickup?: boolean;           // first measure is an anacrusis
  tempoMarks?: { measure: number; bpm: number; words?: string }[];
  parts: PartSpec[];
}

const DIV = 4; // divisions per quarter
const TYPES: [number, string, boolean][] = [
  [4, 'whole', false], [3, 'half', true], [2, 'half', false], [1.5, 'quarter', true], [1, 'quarter', false],
  [0.75, 'eighth', true], [0.5, 'eighth', false], [0.375, '16th', true], [0.25, '16th', false],
];
const typeOf = (q: number) => TYPES.find(([d]) => Math.abs(d - q) < 1e-6);

export function parseTokens(measure: string): { pitches: string[]; q: number }[] {
  return measure.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const [n, d] = tok.split(':');
    return { pitches: n === 'R' ? [] : n.split('+'), q: d === undefined ? 1 : +d };
  });
}

function pitchXml(p: string) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(p);
  if (!m) throw new Error(`bad pitch ${p}`);
  const alter = m[2] === '#' ? '<alter>1</alter>' : m[2] === 'b' ? '<alter>-1</alter>' : '';
  return `<pitch><step>${m[1]}</step>${alter}<octave>${m[3]}</octave></pitch>`;
}

function noteXml(pitches: string[], q: number, voice: number, staff: number, multiStaff: boolean): string {
  const t = typeOf(q);
  const dur = Math.round(q * DIV);
  const typeXml = t ? `<type>${t[1]}</type>${t[2] ? '<dot/>' : ''}` : '';
  const st = multiStaff ? `<staff>${staff}</staff>` : '';
  if (!pitches.length) return `<note><rest/><duration>${dur}</duration><voice>${voice}</voice>${typeXml}${st}</note>`;
  return pitches.map((p, i) => `<note>${i ? '<chord/>' : ''}${pitchXml(p)}<duration>${dur}</duration><voice>${voice}</voice>${typeXml}${st}</note>`).join('');
}

export function buildSongXml(song: SongSpec): string {
  const partList = song.parts.map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name><score-instrument id="${p.id}-I1"><instrument-name>${p.name}</instrument-name></score-instrument><midi-instrument id="${p.id}-I1"><midi-channel>${song.parts.indexOf(p) + 1}</midi-channel><midi-program>${p.program}</midi-program></midi-instrument></score-part>`).join('');
  const parts = song.parts.map((part, pi) => {
    const staves = part.staves.map((s) => s.music.split('|'));
    const n = staves[0].length;
    const multi = part.staves.length > 1;
    let body = '';
    for (let mi = 0; mi < n; mi++) {
      let attrs = '';
      if (mi === 0) {
        const clefs = part.staves.map((s, si) => `<clef${multi ? ` number="${si + 1}"` : ''}><sign>${s.clef}</sign><line>${s.clef === 'G' ? 2 : 4}</line></clef>`).join('');
        attrs = `<attributes><divisions>${DIV}</divisions><key><fifths>${song.fifths}</fifths></key><time><beats>${song.beats}</beats><beat-type>${song.beatType}</beat-type></time>${multi ? `<staves>${part.staves.length}</staves>` : ''}${clefs}</attributes>`;
      }
      let dir = '';
      if (pi === 0) {
        const mark = mi === 0 ? { bpm: song.tempo, words: '' } : song.tempoMarks?.find((t) => t.measure === mi);
        if (mark) dir = `<direction placement="above">${mark.words ? `<direction-type><words>${mark.words}</words></direction-type>` : ''}<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${mark.bpm}</per-minute></metronome></direction-type><sound tempo="${mark.bpm}"/></direction>`;
      }
      const voices = staves.map((m, si) => {
        const toks = parseTokens(m[mi] ?? '');
        const len = toks.reduce((a, t) => a + t.q, 0);
        return { xml: toks.map((t) => noteXml(t.pitches, t.q, si === 0 ? 1 : 5, si + 1, multi)).join(''), len };
      });
      const inner = voices.map((v, i) => (i ? `<backup><duration>${Math.round(voices[i - 1].len * DIV)}</duration></backup>` : '') + v.xml).join('');
      const last = mi === n - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : '';
      const implicit = song.pickup && mi === 0 ? ' implicit="yes"' : '';
      body += `<measure number="${song.pickup ? mi : mi + 1}"${implicit}>${attrs}${dir}${inner}${last}</measure>`;
    }
    return `<part id="${part.id}">${body}</part>`;
  }).join('');
  const credit = song.arranger ? `<creator type="arranger">${song.arranger}</creator>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${song.title}</work-title></work><identification><creator type="composer">${song.composer}</creator>${credit}</identification><part-list>${partList}</part-list>${parts}</score-partwise>`;
}
