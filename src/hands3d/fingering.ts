// FingeringPlanner: suggests piano fingering when the score has none (or only some).
// Dynamic programming over every note group of each hand. A state is the set of fingers used for a
// group (ordered with pitch: ascending fingers in the right hand, descending in the left). Costs model
// what a teacher would say: stay in position, avoid using the same finger for two different notes in
// a row, pass the thumb under (or a finger over the thumb) only from 2, 3 or 4 and preferably over a
// semitone, keep the thumb off black keys, and never stretch beyond a finger pair's comfortable span.
// Fingers written in the MusicXML (or chosen by the learner) are fixed constraints.

import { isBlackKey } from '../core/music';
import type { Hand, ScoreEvent } from '../core/types';

const WHITE_OFF = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const wpos = (m: number) => Math.floor(m / 12) * 7 + WHITE_OFF[((m % 12) + 12) % 12];

/** Comfortable span (white keys) between two fingers a < b. */
const SPAN: Record<string, number> = { '12': 4, '13': 5, '14': 6, '15': 7.5, '23': 2.2, '24': 3.6, '25': 5, '34': 2.2, '35': 3.6, '45': 2.2 };
const span = (a: number, b: number) => SPAN[`${Math.min(a, b)}${Math.max(a, b)}`] ?? 0;
const REST_OFF = [-2, -1, 0, 1, 2]; // fingertip offsets from the middle finger, white keys (right hand)

export const handOfPitch = (ev: ScoreEvent, p: number): Hand => ev.hand ?? ev.hands?.[ev.pitches.indexOf(p)] ?? (p < 60 ? 'LH' : 'RH');

interface Group { ev: number; idx: number[]; midis: number[]; fixed: (number | undefined)[] }
type State = number[];

function combos(n: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) { out.push(acc); return; }
    for (let f = start; f <= 5; f++) rec(f + 1, [...acc, f]);
  };
  rec(1, []);
  return out;
}

function statesFor(g: Group, hand: Hand): State[] {
  const n = g.midis.length;
  if (n > 5) return [g.midis.map((_, i) => (hand === 'RH' ? Math.min(5, i + 1) : Math.max(1, 5 - i)))];
  const all = combos(n).map((c) => (hand === 'RH' ? c : [...c].reverse()));
  const ok = all.filter((c) => c.every((f, i) => g.fixed[i] === undefined || g.fixed[i] === f));
  return ok.length ? ok : [g.midis.map((_, i) => g.fixed[i] ?? (hand === 'RH' ? i + 1 : 5 - i))];
}

/** Mirror so that the left hand can use right-hand rules: x -> -x. */
const dirPos = (m: number, hand: Hand) => (hand === 'RH' ? wpos(m) : -wpos(m));

function chordCost(g: Group, s: State, hand: Hand): number {
  let c = 0;
  const mostlyBlack = g.midis.filter(isBlackKey).length * 2 > g.midis.length;
  s.forEach((f, i) => {
    if (isBlackKey(g.midis[i])) c += f === 1 ? (mostlyBlack ? 0.7 : 1.6) : f === 5 ? 0.6 : 0;
  });
  for (let i = 1; i < s.length; i++) {
    const w = Math.abs(wpos(g.midis[i]) - wpos(g.midis[i - 1]));
    const fd = Math.abs(s[i] - s[i - 1]);
    const max = span(s[i], s[i - 1]);
    if (w > max) c += 8 * (w - max);
    c += Math.abs(Math.min(w, 4) - fd) * 0.9;
  }
  void hand;
  return c;
}

const handX = (g: Group, s: State, hand: Hand) => s.reduce((a, f, i) => a + dirPos(g.midis[i], hand) - REST_OFF[f - 1], 0) / s.length;

function stepCost(m1: number, a: number, m2: number, b: number, hand: Hand): number {
  if (m1 === m2) return a === b ? 0 : 0.4;
  if (a === b) return 6;
  const d = dirPos(m2, hand) - dirPos(m1, hand);
  const semi = Math.abs(m2 - m1);
  const ad = Math.abs(d);
  const black2 = isBlackKey(m2);
  if ((d > 0 && b > a) || (d < 0 && b < a)) {
    const fd = Math.abs(b - a);
    const max = span(a, b);
    let c = Math.abs(ad - fd) * 0.6;
    if (ad > max) c += 8 * (ad - max);
    return c;
  }
  // crossing: thumb under (ascending in RH model) or finger over the thumb (descending)
  const thumbUnder = d > 0 && b === 1 && a >= 2 && a <= 4;
  const fingerOver = d < 0 && a === 1 && b >= 2 && b <= 4;
  if (!thumbUnder && !fingerOver) return 14;
  const other = thumbUnder ? a : b;
  let c = 2 + (other === 4 ? 0.5 : other === 2 ? 0.7 : 0);
  if (ad > 1.01) c += (ad - 1) * 1.6;
  if (semi > 1) c += 0.3;
  if (thumbUnder && black2) c += 2.5;
  if (fingerOver && isBlackKey(m1)) c += 1.5;
  return c;
}

function transitionCost(g1: Group, s1: State, g2: Group, s2: State, hand: Hand): number {
  if (g1.midis.length === 1 && g2.midis.length === 1) return stepCost(g1.midis[0], s1[0], g2.midis[0], s2[0], hand);
  let c = 0.3 * Math.abs(handX(g2, s2, hand) - handX(g1, s1, hand));
  // the same finger on a nearby different note straight after cannot be legato (a hand shift can)
  const shift = Math.abs(handX(g2, s2, hand) - handX(g1, s1, hand));
  s2.forEach((f, i) => {
    const j = s1.indexOf(f);
    if (j >= 0 && g1.midis[j] !== g2.midis[i]) c += g1.midis.length > 1 && g2.midis.length > 1 ? 0.15 : shift < 1.5 ? 1.2 : 0.2;
  });
  return c;
}

/**
 * Fingering for every pitch of every event (parallel to `pitches`).
 * `given` (e.g. from MusicXML or the learner) overrides; 0 means "no suggestion".
 */
export function planFingering(events: ScoreEvent[], given?: (number | undefined)[][]): number[][] {
  const out: number[][] = events.map((e) => e.pitches.map(() => 0));
  for (const hand of ['RH', 'LH'] as Hand[]) {
    const groups: Group[] = [];
    events.forEach((ev, k) => {
      const idx = ev.pitches.map((p, i) => i).filter((i) => handOfPitch(ev, ev.pitches[i]) === hand);
      if (!idx.length) return;
      idx.sort((a, b) => ev.pitches[a] - ev.pitches[b]);
      const fixed = idx.map((i) => { const f = given?.[k]?.[i] ?? ev.fingers?.[i]; return f && f >= 1 && f <= 5 ? f : undefined; });
      groups.push({ ev: k, idx, midis: idx.map((i) => ev.pitches[i]), fixed });
    });
    if (!groups.length) continue;
    const S = groups.map((g) => statesFor(g, hand));
    const cost: number[][] = [S[0].map((s) => chordCost(groups[0], s, hand) + startCost(groups, s, hand))];
    const back: number[][] = [S[0].map(() => -1)];
    for (let t = 1; t < groups.length; t++) {
      const row: number[] = [], br: number[] = [];
      S[t].forEach((s) => {
        let best = Infinity, bi = 0;
        S[t - 1].forEach((p, j) => {
          const c = cost[t - 1][j] + transitionCost(groups[t - 1], p, groups[t], s, hand);
          if (c < best) { best = c; bi = j; }
        });
        row.push(best + chordCost(groups[t], s, hand)); br.push(bi);
      });
      cost.push(row); back.push(br);
    }
    let k = cost[cost.length - 1].indexOf(Math.min(...cost[cost.length - 1]));
    for (let t = groups.length - 1; t >= 0; t--) {
      const s = S[t][k];
      groups[t].idx.forEach((i, n) => { out[groups[t].ev][i] = s[n]; });
      k = back[t][k];
    }
  }
  return out;
}

/** Slight preference for starting a passage in a position that covers where it is going. */
function startCost(groups: Group[], s: State, hand: Hand): number {
  if (groups[0].midis.length !== 1) return 0;
  const m0 = groups[0].midis[0];
  const ahead = groups.slice(1, 6).map((g) => dirPos(g.midis[0], hand) - dirPos(m0, hand));
  if (!ahead.length) return 0;
  const lo = Math.min(0, ...ahead), hi = Math.max(0, ...ahead);
  // room the starting finger leaves below/above it in a five-finger position
  const below = s[0] - 1, above = 5 - s[0];
  return Math.max(0, -lo - below) * 0.35 + Math.max(0, hi - above) * 0.15 + (isBlackKey(m0) && s[0] === 1 ? 1.5 : 0);
}

// ---------- learner overrides ----------
const KEY = (id: string) => `maestro.fingering.${id}`;
export function loadOverrides(exerciseId: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY(exerciseId)) || '{}'); } catch { return {}; }
}
export function saveOverride(exerciseId: string, ev: number, pitchIdx: number, finger: number | null) {
  const o = loadOverrides(exerciseId);
  if (finger === null) delete o[`${ev}:${pitchIdx}`]; else o[`${ev}:${pitchIdx}`] = finger;
  try { localStorage.setItem(KEY(exerciseId), JSON.stringify(o)); } catch { /* storage unavailable */ }
}
export function overridesToGiven(events: ScoreEvent[], o: Record<string, number>): (number | undefined)[][] {
  return events.map((e, k) => e.pitches.map((_, i) => o[`${k}:${i}`]));
}
