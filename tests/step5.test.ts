import { LESSONS, PIANO_LESSONS, lessonById } from '../src/curriculum/lessons';
import { ProgressStore } from '../src/progress/store';
import { checkCerts, levelDone } from '../src/progress/certs';
import { mergeProgress } from '../src/account/merge';
import { newCode, summarize } from '../src/account/classSummary';
import { placementLevel, SECTIONS } from '../src/curriculum/placement';
import { certificateSvg } from '../src/progress/certSvg';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const master = (p: ProgressStore, level: number) => { for (const l of PIANO_LESSONS.filter((x) => x.level === level)) for (const e of l.exercises) p.data.exercises[e.id] = { best: 95, passes: 5, attempts: [], box: 2 }; };

describe('certificates', () => {
  it('a level earns its certificate once, dated', () => {
    const p = new ProgressStore(mem());
    expect(checkCerts(p, LESSONS)).toEqual([]);
    master(p, 0);
    expect(levelDone(p, LESSONS, 0)).toBe(true);
    expect(checkCerts(p, LESSONS, '2026-11-12')).toEqual([0]);
    expect(p.data.certs).toEqual({ 0: '2026-11-12' });
    expect(checkCerts(p, LESSONS)).toEqual([]);
  });
  it('the certificate names the person and the level, escaped', () => {
    const svg = certificateSvg('Ama <3', 4, '2026-11-12');
    expect(svg).toContain('Ama &lt;3');
    expect(svg).toContain('Level 4');
  });
  it('certificates and placement merge across devices', () => {
    const m = mergeProgress({ version: 1, exercises: {}, practiceLog: {}, certs: { 1: '2026-10-01' }, placedLevel: 3 }, { version: 1, exercises: {}, practiceLog: {}, certs: { 1: '2026-09-01', 2: '2026-11-01' }, placedLevel: 5 });
    expect(m.certs).toEqual({ 1: '2026-09-01', 2: '2026-11-01' });
    expect(m.placedLevel).toBe(5);
  });
});

describe('placement', () => {
  it('stops at the first missed section', () => {
    expect(placementLevel(SECTIONS.map(() => true))).toBe(9);
    expect(placementLevel([true, true, true, false, true])).toBe(2);
    expect(placementLevel([false])).toBe(0);
  });
  it('a placed learner can open lessons up to that level without the earlier ones', () => {
    const p = new ProgressStore(mem());
    const l = lessonById('L5-3')!;
    expect(p.lessonUnlocked(l, LESSONS)).toBe(false);
    p.data.placedLevel = 5;
    expect(p.lessonUnlocked(l, LESSONS)).toBe(true);
    expect(p.lessonComplete(l)).toBe(false);
  });
});

describe('classes', () => {
  it('class codes are six readable characters', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[A-Z2-9]{6}$/);
    expect(newCode()).not.toMatch(/[O0I1]/);
  });
  it('summarizes a learner from saved progress', () => {
    const l = lessonById('L0-1')!;
    const ex = Object.fromEntries(l.exercises.map((e) => [e.id, { best: 95, passes: 5, attempts: [], box: 2 }]));
    const today = new Date().toISOString().slice(0, 10);
    const s = summarize({ version: 1, exercises: ex, practiceLog: { [today]: 600 } }, [{ id: 'a', class_id: 'c', lesson_id: 'L0-1', note: null, due: null, created_at: '' }, { id: 'b', class_id: 'c', lesson_id: 'L0-2', note: null, due: null, created_at: '' }]);
    expect(s.done).toBe(1);
    expect(s.weekMinutes).toBe(10);
    expect(s.finished).toEqual({ a: true, b: false });
    expect(summarize(null, []).done).toBe(0);
  });
});

describe('certificate seal', async () => {
  const { sealMelody, guilloche, verifyUrl } = await import('../src/progress/certSeal');
  const { certificateSvg: svgOf, certTopics } = await import('../src/progress/certSvg');
  const seal = 'a3f19c0b7e5d22481f9a6c3e0d7b5a4c2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b';
  it('the same seal always gives the same marks, another seal different ones', () => {
    expect(sealMelody(seal)).toEqual(sealMelody(seal));
    expect(sealMelody(seal)).not.toEqual(sealMelody('00' + seal.slice(2)));
    expect(guilloche(seal, 0, 0, 80, 130)[0]).not.toEqual(guilloche('ff' + seal.slice(2), 0, 0, 80, 130)[0]);
    expect(sealMelody(seal).every((k) => k >= 2 && k <= 19)).toBe(true);
  });
  it('a sealed certificate carries its code, a QR and the verify link', () => {
    const s = svgOf('Ama', 2, '2026-11-12', undefined, { code: 'AUX-AAAAA-BBBBB', seal });
    expect(s).toContain('AUX-AAAAA-BBBBB');
    expect(s).toContain('Scan to verify');
    expect(verifyUrl('AUX-AAAAA-BBBBB')).toMatch(/#\/verify\/AUX-AAAAA-BBBBB$/);
  });
  it('topics start with a capital letter', () => {
    expect(certTopics(0).split('  ·  ').every((t) => t[0] === t[0].toUpperCase())).toBe(true);
  });
});

describe('server exercise catalog', async () => {
  const { catalogSql, exerciseCatalog } = await import('../src/progress/exerciseCatalog');
  const { readFileSync } = await import('fs');
  it('matches the curriculum (run: npx vite-node scripts/exerciseCatalog.ts)', () => {
    expect(readFileSync('supabase/migrations/0009_exercise_catalog.sql', 'utf8')).toBe(catalogSql());
  });
  it('every exercise has a sensible minimum time and note count', () => {
    for (const r of exerciseCatalog()) { expect(r.minMs).toBeGreaterThanOrEqual(1500); expect(r.groups).toBeGreaterThan(0); }
  });
});
