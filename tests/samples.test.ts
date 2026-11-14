import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { SOUNDS, rootsOf, nearestRoot, layerFor } from '../src/audio/samples';
import { INSTRUMENTS } from '../src/audio/engine';

describe('recorded instrument sounds', () => {
  it('ship a recording for every key they use', () => {
    for (const s of SOUNDS) for (const dir of s.layers) for (const r of rootsOf(s)) expect(existsSync(`public/sounds/${dir}/${r}.mp3`), `${dir}/${r}`).toBe(true);
  });
  it('never pitch a note far from a recording inside the range', () => {
    for (const s of SOUNDS) { const roots = rootsOf(s); for (let m = s.lo; m <= s.hi; m++) expect(Math.abs(nearestRoot(roots, m) - m)).toBeLessThanOrEqual(2); }
  });
  it('pick soft, medium and loud piano layers', () => {
    expect(layerFor(3, 0.2)).toBe(0); expect(layerFor(3, 0.7)).toBe(1); expect(layerFor(3, 0.8)).toBe(1); expect(layerFor(3, 0.95)).toBe(2); expect(layerFor(1, 0.95)).toBe(0);
  });
  it('keep the classic play-along voices free and the new ones for Pro and Plus', () => {
    expect(INSTRUMENTS.filter((i) => !i.plus).map((i) => i.id)).toEqual(['piano', 'violin', 'viola', 'cello', 'flute', 'strings', 'bass', 'choir']);
  });
});
