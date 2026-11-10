// Sing to score, step 3: write the melody (or the four-part arrangement) as standard MusicXML, so it
// shows in the score view, opens in My Music for practice, and downloads for MuseScore or Sibelius.
import type { KeyInfo, MelodyNote } from './transcribe';
import type { ChordSlot } from './harmony';
import { chordName } from './harmony';

const DIV = 4; // divisions per quarter: sixteenths are 1
const VALUES: [number, string, boolean][] = [[4, 'whole', false], [3, 'half', true], [2, 'half', false], [1.5, 'quarter', true], [1, 'quarter', false], [0.75, 'eighth', true], [0.5, 'eighth', false], [0.25, '16th', false]];
const STEP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const STEP_F = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];
const ALTER_S = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const ALTER_F = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];

/** Note name for the key: sharps in sharp keys, flats in flat keys. */
export function spell(midi: number, key: KeyInfo): { step: string; alter: number; octave: number } {
  const pc = midi % 12;
  // minor keys raise the 6th and 7th notes: those are written with sharps (C# in D minor, not Db)
  const raised = key.mode === 'minor' && (pc === (key.tonic + 11) % 12 || pc === (key.tonic + 9) % 12) && [1, 3, 6, 8, 10].includes(pc);
  const flat = key.fifths < 0 && !raised;
  const step = (flat ? STEP_F : STEP)[pc], alter = (flat ? ALTER_F : ALTER_S)[pc];
  let octave = Math.floor(midi / 12) - 1;
  if (step === 'B' && alter === 1) octave -= 1; // (never produced; kept for safety)
  return { step, alter, octave };
}

/** Splits a length into written note values (ties join them). */
function pieces(beats: number): [number, string, boolean][] {
  const out: [number, string, boolean][] = [];
  let left = Math.round(beats * 4) / 4;
  while (left > 1e-6) {
    const v = VALUES.find(([b]) => b <= left + 1e-6) ?? VALUES[VALUES.length - 1];
    out.push(v); left -= v[0];
  }
  return out;
}

export interface XmlVoice { notes: MelodyNote[]; staff: number; stem?: 'up' | 'down'; lyric?: string }
export interface XmlScore {
  title: string; composer?: string; key: KeyInfo; timeSig: [number, number]; bpm: number;
  partName: string; staves: ('treble' | 'bass')[]; voices: XmlVoice[]; chords?: ChordSlot[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function writeXml(s: XmlScore): string {
  const barBeats = s.timeSig[0] * (4 / s.timeSig[1]);
  const total = Math.max(barBeats, ...s.voices.flatMap((v) => v.notes.map((n) => n.beat + n.beats)));
  const bars = Math.max(1, Math.ceil(total / barBeats - 1e-9));
  const clef = (c: 'treble' | 'bass', i: number) => `<clef number="${i + 1}"><sign>${c === 'treble' ? 'G' : 'F'}</sign><line>${c === 'treble' ? 2 : 4}</line></clef>`;
  let body = '';
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * barBeats, b1 = b0 + barBeats;
    let m = `<measure number="${bar + 1}">`;
    if (bar === 0) {
      m += `<attributes><divisions>${DIV}</divisions><key><fifths>${s.key.fifths}</fifths><mode>${s.key.mode}</mode></key><time><beats>${s.timeSig[0]}</beats><beat-type>${s.timeSig[1]}</beat-type></time>`
        + `${s.staves.length > 1 ? `<staves>${s.staves.length}</staves>` : ''}${s.staves.map(clef).join('')}</attributes>`
        + `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${s.bpm}</per-minute></metronome></direction-type><sound tempo="${s.bpm}"/></direction>`;
    }
    s.voices.forEach((v, vi) => {
      if (vi > 0) m += `<backup><duration>${barBeats * DIV}</duration></backup>`;
      // events of this voice inside the bar (cut at the barlines, tied across)
      let pos = b0;
      const evs = v.notes.filter((n) => n.beat < b1 - 1e-9 && n.beat + n.beats > b0 + 1e-9).sort((a, b) => a.beat - b.beat);
      const fill = (to: number) => { if (to - pos > 1e-6) { for (const [bt, type, dot] of pieces(to - pos)) m += `<note><rest/><duration>${bt * DIV}</duration><voice>${vi + 1}</voice><type>${type}</type>${dot ? '<dot/>' : ''}${v.staff > 0 ? `<staff>${v.staff}</staff>` : ''}</note>`; pos = to; } };
      for (const n of evs) {
        const st = Math.max(n.beat, b0), en = Math.min(n.beat + n.beats, b1);
        if (st > pos + 1e-6) fill(st);
        if (n.midi === null) { fill(en); continue; }
        const sp = spell(n.midi, s.key);
        const parts = pieces(en - st);
        const tiedIn = n.beat < b0 - 1e-9, tiedOut = n.beat + n.beats > b1 + 1e-9;
        parts.forEach(([bt, type, dot], k) => {
          const start = (k > 0 || tiedIn), stop = (k < parts.length - 1 || tiedOut);
          const ties = (start ? '<tie type="stop"/>' : '') + (stop ? '<tie type="start"/>' : '');
          const tied = (start ? '<tied type="stop"/>' : '') + (stop ? '<tied type="start"/>' : '');
          const chord = s.chords && vi === 0 && k === 0 && !tiedIn ? s.chords.find((c) => Math.abs(c.beat - st) < 1e-6 && c.chord) : undefined;
          if (chord?.chord) {
            const nm = chordName(chord.chord, s.key), [head, slash] = nm.split('/');
            const rootStep = head[0], rootAlt = head[1] === '#' ? 1 : head[1] === 'b' ? -1 : 0;
            const kind = chord.chord.seventh ? 'dominant' : chord.chord.quality === 'min' ? 'minor' : chord.chord.quality === 'dim' ? 'diminished' : 'major';
            m += `<harmony><root><root-step>${rootStep}</root-step>${rootAlt ? `<root-alter>${rootAlt}</root-alter>` : ''}</root><kind text="${esc(head.replace(/^[A-G][#b]?/, ''))}">${kind}</kind>`
              + (slash ? `<bass><bass-step>${slash[0]}</bass-step>${slash[1] === '#' ? '<bass-alter>1</bass-alter>' : slash[1] === 'b' ? '<bass-alter>-1</bass-alter>' : ''}</bass>` : '') + '</harmony>';
          }
          m += `<note><pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.octave}</octave></pitch><duration>${bt * DIV}</duration>${ties}<voice>${vi + 1}</voice><type>${type}</type>${dot ? '<dot/>' : ''}${v.stem ? `<stem>${v.stem}</stem>` : ''}${v.staff > 0 ? `<staff>${v.staff}</staff>` : ''}${tied ? `<notations>${tied}</notations>` : ''}${n.lyric && k === 0 && !tiedIn ? `<lyric number="1"><syllabic>single</syllabic><text>${esc(n.lyric)}</text></lyric>` : ''}</note>`;
        });
        pos = en;
      }
      fill(b1);
    });
    if (bar === bars - 1) m += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    body += m + '</measure>';
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${esc(s.title)}</work-title></work><identification><creator type="composer">${esc(s.composer ?? 'Sung into Maestro')}</creator></identification>
<part-list><score-part id="P1"><part-name>${esc(s.partName)}</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}
