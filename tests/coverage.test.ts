import { describe, it, expect } from 'vitest';
import { PIANO_LESSONS, VOICE_LESSONS } from '../src/curriculum/lessons';
import { auditCourse } from '../src/curriculum/coverage';
import { countItems, cellBar } from '../src/curriculum/readingDrills';

describe('teach before you test', () => {
  it('every piano exercise only uses what earlier lessons taught', () => {
    expect(auditCourse(PIANO_LESSONS).map((g) => `${g.exercise}: ${g.missing.join(', ')}`)).toEqual([]);
  });
  it('every voice exercise only uses what earlier lessons taught', () => {
    expect(auditCourse(VOICE_LESSONS).map((g) => `${g.exercise}: ${g.missing.join(', ')}`)).toEqual([]);
  });
  it('play-alongs in the first lessons use only quarter notes', () => {
    const l0 = PIANO_LESSONS.find((l) => l.id === 'L0-1')!;
    for (const e of l0.exercises.filter((x) => x.id.includes('-pa'))) for (const ev of e.events) expect([1, 2, 4]).toContain(ev.beats);
  });
});

describe('rhythm answers as notation', () => {
  it('reads answer words back into notes', () => {
    expect(countItems('ta-a  sh  ta')).toEqual([{ beats: 2, say: 'ta-a' }, { beats: 1, rest: true, say: 'sh' }, { beats: 1, say: 'ta' }]);
    expect(countItems('ti-ti  ta-a-a').map((x) => x.beats)).toEqual([0.5, 0.5, 3]);
  });
  it('shows each rhythm word in a full bar', () => {
    for (const c of ['ta', 'ta-a', 'ta-a-a', 'sh', 'ti-ti', 'tri-po-let', 'ti-tika']) expect(cellBar(c).reduce((a, x) => a + x.beats, 0)).toBeCloseTo(4);
  });
});
