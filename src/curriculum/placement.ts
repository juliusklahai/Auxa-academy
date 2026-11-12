// The placement test's sections (rising in level) and how a result maps to a level.
import type { DrillSpec } from '../core/types';

interface Section { level: number; label: string; spec: DrillSpec }
const KEYS = [60, 67, 65, 62];
export const SECTIONS: Section[] = [
  { level: 1, label: 'Treble notes', spec: { kind: 'notename', pool: ['treble-near'] } },
  { level: 1, label: 'Bass notes', spec: { kind: 'notename', pool: ['bass-near'] } },
  { level: 2, label: 'Rhythm', spec: { kind: 'count', pool: ['ta', 'ta-a', 'ta-a-a', 'sh'] } },
  { level: 3, label: 'The whole grand staff', spec: { kind: 'notename', pool: ['treble', 'bass'] } },
  { level: 4, label: 'Eighths, sixteenths, triplets', spec: { kind: 'count', pool: ['ta', 'ti-ti', 'ti-ka-ti-ka', 'tri-po-let'] } },
  { level: 4, label: 'Time signatures', spec: { kind: 'meter', pool: ['2/4', '3/4', '4/4', '6/8'] } },
  { level: 5, label: 'Key signatures', spec: { kind: 'keysig', pool: ['0', '1', '2', '-1', '-2'] } },
  { level: 6, label: 'Major or minor', spec: { kind: 'quality', pool: ['maj', 'min'], keys: KEYS } },
  { level: 8, label: 'Ledger lines', spec: { kind: 'notename', pool: ['ledger'] } },
  { level: 8, label: 'Intervals', spec: { kind: 'interval', pool: ['M2', 'M3', 'P4', 'P5', 'P8'], style: 'up', keys: KEYS } },
  { level: 9, label: 'Seventh chords', spec: { kind: 'quality', pool: ['maj7', 'm7', '7'], keys: KEYS } },
];
export const PER = 2; // questions per section

/** Highest level reached by passing every section in order (a section passes with both answers right). */
export function placementLevel(passed: boolean[]): number {
  let lv = 0;
  for (let i = 0; i < SECTIONS.length; i++) { if (!passed[i]) break; lv = SECTIONS[i].level; }
  return lv;
}

