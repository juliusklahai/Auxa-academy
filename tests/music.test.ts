import { freqToNote, midiToFreq, midiToName, nameToMidi, isBlackKey, midiToVexKey } from '../src/core/music';

describe('music helpers', () => {
  it('converts names and MIDI both ways', () => {
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('A4')).toBe(69);
    expect(nameToMidi('Bb3')).toBe(58);
    expect(nameToMidi('C#5')).toBe(73);
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(21)).toBe('A0');
    expect(midiToName(108)).toBe('C8');
  });
  it('maps frequency and cents with configurable A4', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(freqToNote(261.63)).toEqual({ midi: 60, cents: 0 });
    expect(freqToNote(440 * Math.pow(2, 0.2 / 12)).cents).toBe(20);
    expect(freqToNote(432, 432).midi).toBe(69);
  });
  it('knows black keys and VexFlow keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([false, true, false, true, false, false, true]);
    expect(midiToVexKey(61)).toBe('c#/4');
  });
});
