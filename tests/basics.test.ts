import { GLOSSARY } from '../src/curriculum/glossary';
import { lessonById, PIANO_LESSONS } from '../src/curriculum/lessons';
import { makeQuestion } from '../src/curriculum/drills';
import { NARRATION } from '../src/curriculum/narration';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('method-book foundations', () => {
  it('every glossary lesson link points at a real lesson', () => {
    for (const t of GLOSSARY) if (t.lesson) expect(lessonById(t.lesson), t.term).toBeTruthy();
  });
  it('new lessons sit in teaching order', () => {
    const ids = PIANO_LESSONS.map((l) => l.id);
    expect(ids[0]).toBe('L0-0');
    expect(ids.indexOf('L1-6')).toBe(ids.indexOf('L1-2') + 1);
    expect(ids.slice(ids.indexOf('L4-5') + 1, ids.indexOf('L4-5') + 5)).toEqual(['L4-6', 'L4-7', 'L4-8', 'L4-9']);
  });
  it('new steps all have narration', () => {
    for (const id of ['L0-0', 'L1-6', 'L4-6', 'L4-7', 'L4-8', 'L4-9']) lessonById(id)!.teach.forEach((_, i) => expect(NARRATION[`${id}#${i}`], `${id}#${i}`).toBeTruthy());
  });
  it('reading drills always offer the right answer among distinct choices', () => {
    const rnd = seeded(7);
    for (const kind of ['count', 'tempo', 'meter', 'roadmap'] as const) {
      const pool = kind === 'count' ? ['ta', 'ti-ti', 'tri-po-let', 'ti-ka-ti-ka'] : kind === 'tempo' ? ['Adagio', 'Andante', 'Allegro'] : kind === 'meter' ? ['2/4', '3/4', '6/8'] : ['0', '1', '2', '3', '4'];
      for (let i = 0; i < 40; i++) {
        const q = makeQuestion({ kind, pool }, rnd);
        expect(q.options).toContain(q.answers[0]);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });
  it('triplet beats add up to whole beats', () => {
    const ev = lessonById('L4-7')!.exercises.find((e) => e.id === 'L4-7-b')!.events;
    const last = ev[ev.length - 1];
    expect(Math.abs(last.beat + last.beats - 8)).toBeLessThan(1e-9);
  });
});
