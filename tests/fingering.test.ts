import { describe, expect, it } from 'vitest';
import { planFingering } from '../src/hands3d/fingering';
import type { ScoreEvent } from '../src/core/types';

const seq = (ms: number[], hand: 'RH' | 'LH'): ScoreEvent[] => ms.map((m, i) => ({ pitches: [m], beat: i, beats: 1, hand }));
const C = [0, 2, 4, 5, 7, 9, 11];
const scale = (start: number, octaves: number) => [...Array.from({ length: octaves * 7 }, (_, i) => start + Math.floor(i / 7) * 12 + C[i % 7]), start + octaves * 12];

describe('FingeringPlanner', () => {
  it('RH two-octave C major scale ascending', () => {
    expect(planFingering(seq(scale(60, 2), 'RH')).flat()).toEqual([1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]);
  });
  it('RH one-octave C major scale descending', () => {
    expect(planFingering(seq(scale(60, 1).reverse(), 'RH')).flat()).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });
  it('LH one-octave C major scale ascending', () => {
    expect(planFingering(seq(scale(48, 1), 'LH')).flat()).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });
  it('C major triad: RH 1-3-5, LH 5-3-1', () => {
    expect(planFingering([{ pitches: [60, 64, 67], beat: 0, beats: 2, hand: 'RH' }])[0]).toEqual([1, 3, 5]);
    expect(planFingering([{ pitches: [48, 52, 55], beat: 0, beats: 2, hand: 'LH' }])[0]).toEqual([5, 3, 1]);
  });
  it('five-finger position', () => {
    expect(planFingering(seq([60, 62, 64, 65, 67], 'RH')).flat()).toEqual([1, 2, 3, 4, 5]);
    expect(planFingering(seq([48, 50, 52, 53, 55], 'LH')).flat()).toEqual([5, 4, 3, 2, 1]);
  });
  it('keeps written fingering and plans around it', () => {
    const ev = seq([60, 62, 64, 65], 'RH');
    ev[0].fingers = [2];
    const f = planFingering(ev).flat();
    expect(f[0]).toBe(2);
    expect(new Set(f).size).toBe(4);
  });
});
