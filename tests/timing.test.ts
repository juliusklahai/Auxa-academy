import { beatToMs, countInTimes, effectiveBpm, metronomeClicks } from '../src/audio/timing';
import { AssessmentSession } from '../src/assessment/session';
import { seq } from '../src/curriculum/lessons';

describe('Test 8: metronome timing', () => {
  it('clicks fall exactly on beats with downbeat accents', () => {
    const c = metronomeClicks(0, 4000, 60, 4);
    expect(c.map((x) => x.time)).toEqual([0, 1000, 2000, 3000]);
    expect(c.map((x) => x.accent)).toEqual([true, false, false, false]);
  });
  it('BPM changes rescale click times and stay aligned with expected note onsets', () => {
    const c = metronomeClicks(0, 2000, 120, 4);
    expect(c.map((x) => x.time)).toEqual([0, 500, 1000, 1500]);
    for (let b = 0; b < 4; b++) expect(beatToMs(b, 120)).toBe(c[b].time);
  });
  it('supports subdivisions and count-in', () => {
    expect(metronomeClicks(0, 1000, 60, 4, 2).map((x) => x.sub)).toEqual([false, true]);
    expect(countInTimes(4, 60)).toEqual([-4000, -3000, -2000, -1000]);
  });
});

describe('Test 9: tempo adjustment', () => {
  it('clamps practice tempo to 20-150%', () => {
    expect(effectiveBpm(100, 10)).toBe(20);
    expect(effectiveBpm(100, 200)).toBe(150);
  });
  it('50% tempo doubles every onset but keeps pitches and proportions', () => {
    const ex = { id: 'x', title: '', objective: '', clef: 'treble' as const, mode: 'timed' as const, tempo: 80, timeSig: [4, 4] as [number, number], events: seq('C4:1 D4:0.5 E4:0.5 F4:2'), skills: [], passScore: 80, maxConsecutiveMistakes: 3, requiredPasses: 1, inputs: ['midi' as const] };
    const full = ex.events.map((e) => beatToMs(e.beat, 80));
    const half = ex.events.map((e) => beatToMs(e.beat, effectiveBpm(80, 50)));
    half.forEach((t, i) => expect(t).toBeCloseTo(full[i] * 2));
    const s = new AssessmentSession(ex, effectiveBpm(80, 50));
    s.begin(); s.listen();
    [60, 62, 64, 65].forEach((m, i) => s.input({ midi: m, time: half[i], source: 'midi', confidence: 1 }));
    expect(s.results().every((r) => r.status === 'correct')).toBe(true);
  });
});
