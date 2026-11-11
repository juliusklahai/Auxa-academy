import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/settings', () => ({ getSettings: () => ({ coachVoice: true }) }));
vi.mock('../src/native/bridge', () => ({ native: null, isNativeApp: false }));
import { speakable } from '../src/ui/voice';

describe('voice coach reads naturally', () => {
  const cases: [string, string][] = [
    ['RH melody, LH shells.', 'right hand melody, left hand shells.'],
    ['I – IV – V – I in four parts.', 'one, four, five, one in four parts.'],
    ['Dm7, G7, Cmaj7: root and 7th.', 'D minor seven, G seven, C major seven, root and seventh.'],
    ['ii–V–I in F and Bb', 'two, five, one in F and B flat'],
    ['C – G/B – Am – F', 'C, G over B, A minor, F'],
    ['Play middle C (C4) with RH finger 1.', 'Play middle C with right hand finger 1.'],
    ['V7 to I: the 7th falls.', 'five seven to I, the seventh falls.'],
    ['Connected quarter notes at 66 BPM.', 'Connected quarter notes at 66 beats per minute.'],
  ];
  for (const [a, b] of cases) it(a, () => expect(speakable(a)).toBe(b));
  it('leaves the word I alone', () => expect(speakable('I think I can.')).toBe('I think I can.'));
});
