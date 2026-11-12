// Certificates: one per level, earned when every piano lesson in that level is mastered.
import type { Lesson } from '../core/types';
import type { ProgressStore } from './store';

export const today = () => new Date().toISOString().slice(0, 10);

/** Levels of the piano path that have lessons, in order. */
export const certLevels = (all: Lesson[]) => [...new Set(all.filter((l) => (l.track ?? 'piano') === 'piano').map((l) => l.level))].sort((a, b) => a - b);

export function levelDone(p: ProgressStore, all: Lesson[], level: number) {
  const ls = all.filter((l) => (l.track ?? 'piano') === 'piano' && l.level === level);
  return ls.length > 0 && ls.every((l) => p.lessonComplete(l));
}

/** Records any newly finished levels and returns them (lowest first). */
export function checkCerts(p: ProgressStore, all: Lesson[], on = today()): number[] {
  const fresh: number[] = [];
  for (const lv of certLevels(all)) {
    if (p.data.certs?.[lv]) continue;
    if (levelDone(p, all, lv)) { (p.data.certs ??= {})[lv] = on; fresh.push(lv); }
  }
  if (fresh.length) p.save();
  return fresh;
}

export const earned = (p: ProgressStore) => Object.entries(p.data.certs ?? {}).map(([lv, d]) => ({ level: Number(lv), date: d })).sort((a, b) => a.level - b.level);
