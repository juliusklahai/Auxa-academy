import { describe, it, expect } from 'vitest';
import { splitLyrics, fitLyrics } from '../src/compose/lyrics';
import { writeXml } from '../src/compose/xml';
import { keyInfo, type MelodyNote } from '../src/compose/transcribe';

const N = (spec: [number | null, number][]): MelodyNote[] => { let b = 0; return spec.map(([midi, beats]) => { const n = { midi, beat: b, beats }; b += beats; return n; }); };

describe('lyrics', () => {
  it('splits words and syllables the hymn-book way', () => {
    const t = splitLyrics('A-maz-ing grace');
    expect(t).toEqual([{ text: 'A', syllabic: 'begin' }, { text: 'maz', syllabic: 'middle' }, { text: 'ing', syllabic: 'end' }, { text: 'grace', syllabic: 'single' }]);
    expect(splitLyrics('Glo_ _ ri-a').filter((x) => x === '_').length).toBe(2);
  });
  it('one syllable per note, rests skipped', () => {
    const r = fitLyrics(N([[67, 1], [72, 2], [null, 1], [76, 1]]), 'A-maz ing');
    expect(r.notes.map((n) => n.lyric)).toEqual(['A', 'maz', undefined, 'ing']);
    expect(r.extra).toBe(0);
  });
  it('places a melisma on the short stepwise note, not after a rest', () => {
    // "Glo-ri-a": Glo on a long note, ri on two quick steps, a
    const r = fitLyrics(N([[67, 2], [69, 0.5], [71, 0.5], [72, 2]]), 'Glo-ri-a');
    expect(r.notes.map((n) => n.lyric)).toEqual(['Glo', 'ri', undefined, 'a']);
    expect(r.held).toBe(1);
  });
  it('honours the underscores the singer typed, and keeps extra syllables', () => {
    expect(fitLyrics(N([[60, 1], [62, 1], [64, 1]]), 'Ah _ men').notes.map((n) => n.lyric)).toEqual(['Ah', undefined, 'men']);
    const r = fitLyrics(N([[60, 1], [62, 1]]), 'one two three');
    expect(r.extra).toBe(1);
    expect(r.notes[1].lyric).toBe('two three');
  });
  it('writes syllabic into MusicXML', () => {
    const notes = fitLyrics(N([[60, 2], [62, 2]]), 'Je-sus').notes;
    const xml = writeXml({ title: 't', key: keyInfo(0, 'major'), timeSig: [4, 4], bpm: 80, partName: 'Voice', staves: ['treble'], voices: [{ notes, staff: 0 }] });
    expect(xml).toContain('<syllabic>begin</syllabic><text>Je</text>');
    expect(xml).toContain('<syllabic>end</syllabic><text>sus</text>');
  });
});
