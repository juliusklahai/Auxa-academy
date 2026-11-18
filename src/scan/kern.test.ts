import { describe, expect, it } from 'vitest';
import { badBars, dropRepeats, joinSystems, parseKern, parseToken, toMusicXml } from './kern';

describe('kern tokens', () => {
  it('reads pitch, octave, accidentals and length', () => {
    expect(parseToken('4c')!.note!.midi).toBe(60);
    expect(parseToken('8cc#L')!.note!.midi).toBe(73);
    expect(parseToken('2.GG')!.note!.midi).toBe(43);
    expect(parseToken('2.GG')!.dur).toBe(3);
    expect(parseToken('16dd-J')!.note!.alter).toBe(-1);
    expect(parseToken('4r')!.note).toBeNull();
    expect(parseToken('[4e')!.note!.tie).toBe('start');
  });
});

const TWO = `*clefF4\t*clefG2
*k[f#]\t*k[f#]
*M3/4\t*M3/4
2.G 2.B\t4d
.\t8f
.\t8g
.\t4a
=\t=
2.G\t2.g
=\t=
2.G\t2.g
=\t=`;

describe('kern to score', () => {
  it('times notes across both hands and keeps chords together', () => {
    const s = parseKern('**kern\t**kern\n' + TWO);
    expect(s.time).toEqual([3, 4]);
    expect(s.key).toBe(1);
    const m = s.measures[0];
    expect(m.events.find((e) => e.staff === 2)!.notes.map((n) => n.midi)).toEqual([55, 59]);
    const rh = m.events.filter((e) => e.staff === 1).map((e) => e.t);
    expect(rh).toEqual([0, 1, 1.5, 2]);
  });
  it('gives a note the key signature sharp when the reader left it out', () => {
    const s = parseKern('**kern\t**kern\n' + TWO);
    expect(s.measures[0].events.find((e) => e.staff === 1 && e.t === 1)!.notes[0].midi).toBe(66); // f -> F#4
  });
  it('flags bars that do not add up and drops a bar written twice', () => {
    const s = parseKern(joinSystems([TWO, '*clefF4\t*clefG2\n4G\t4g\n=\t=']));
    expect(badBars(s).length).toBe(0); // the short last bar is allowed
    const before = s.measures.length;
    expect(dropRepeats(s, { 0: 2 })).toBe(1);
    expect(s.measures.length).toBe(before - 1);
  });
  it('ignores an invented time signature at the start of a line', () => {
    const s = parseKern(joinSystems([TWO, '*clefF4\t*clefG2\n*M4/4\t*M4/4\n2.G\t2.g\n=\t=']));
    expect(s.measures.every((m) => !m.time)).toBe(true);
  });
  it('writes MusicXML with two staves', () => {
    const xml = toMusicXml(parseKern('**kern\t**kern\n' + TWO, { title: 'T', rights: 'Public domain' }));
    expect(xml).toContain('<staves>2</staves>');
    expect(xml).toContain('<rights>Public domain</rights>');
    expect((xml.match(/<measure /g) || []).length).toBe(3);
    expect(xml).toContain('<chord/>');
  });
});
