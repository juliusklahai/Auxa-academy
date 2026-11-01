import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/musicxml/parse';
import { analyzeChords, chordName, makeBand, BAND_KEYS } from '../src/musicxml/band';
import { demoChoraleXml } from '../src/musicxml/demo';
import { songXml } from '../src/songs';

const parse = (xml: string) => parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, xml);

describe('Play-along band: harmony analysis', () => {
  it('reads the chords of the SATB chorale', () => {
    const s = parse(demoChoraleXml());
    const names = analyzeChords(s).map(chordName);
    expect(names[0]).toBe('C');        // bar 1, beats 1-2
    expect(names[3]).toBe('Am');       // bar 2, beats 3-4: E C A A
    expect(names[15]).toBe('C');       // final bar
  });
  it('reads Canon in D (piano part only) as D A Bm F#m G D G A', () => {
    const s = parse(songXml('canon'));
    const pianoOnly = s.notes.filter((n) => n.track.startsWith('P1|'));
    expect(analyzeChords(s, pianoOnly).slice(0, 8).map(chordName)).toEqual(['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']);
  });
});

describe('Play-along band: parts', () => {
  const s = parse(songXml('twinkle'));
  const band = makeBand(s, { pad: true, bass: true, melody: true });
  it('writes bass, strings pad and melody guide on separate tracks', () => {
    expect(new Set(band.map((n) => n.track))).toEqual(new Set(Object.values(BAND_KEYS)));
  });
  it('bass notes are chord roots in a low register', () => {
    const bass = band.filter((n) => n.track === BAND_KEYS.bass);
    expect(bass[0].midi % 12).toBe(0);
    expect(bass.every((n) => n.midi >= 40 && n.midi <= 51)).toBe(true);
  });
  it('pad chords are three notes and move smoothly (no jumps over a fifth)', () => {
    const pad = band.filter((n) => n.track === BAND_KEYS.pad);
    const chords = new Map<number, number[]>();
    pad.forEach((n) => (chords.get(n.startQ) ?? chords.set(n.startQ, []).get(n.startQ)!).push(n.midi));
    const list = [...chords.values()].map((c) => c.sort((a, b) => a - b));
    expect(list.every((c) => c.length === 3)).toBe(true);
    for (let i = 1; i < list.length; i++) list[i].forEach((m, k) => expect(Math.abs(m - list[i - 1][k])).toBeLessThanOrEqual(7));
  });
  it('melody guide follows the tune', () => {
    const mel = band.filter((n) => n.track === BAND_KEYS.melody).map((n) => n.midi % 12);
    expect(mel.slice(0, 7)).toEqual([0, 0, 7, 7, 9, 9, 7]); // C C G G A A G
  });
});
