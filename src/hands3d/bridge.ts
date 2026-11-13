// MusicAnimationBridge: turns a score (events + fingering) into hand and finger motion over time.
// Times are seconds on the same clock the audio is scheduled on. Everything is computed in the
// right-hand model space: the left hand works mirrored (x -> -x) and is drawn mirrored.
//
// Hand position: "lazy" placement. At every new note group the hand moves only as far as needed for
// each sounding finger to reach its key within that finger's comfortable range (the thumb reaches
// far under the palm, so scales pass the thumb under instead of jumping), then drifts part of the way
// toward the centred position. Moves start ahead of the note (preparation) and arrive just before it.
// Fingers: prepare above the next key, press with a short attack, hold for the written length (legato),
// lift on release (staccato and repeated notes lift in between), and return to a relaxed shape when idle.

import { isBlackKey } from '../core/music';
import type { Hand, ScoreEvent } from '../core/types';
import type { V3 } from './anatomy';
import { REST_OFFSETS, REST_Y } from './kinematics';
import { handOfPitch } from './fingering';

export interface KeyGeo {
  /** key centre across the keyboard, mm (white key width 23.5 mm, black keys on the boundary) */
  x: (midi: number) => number;
  whiteLen: number;   // visible white key length, mm
  blackLen: number;   // black key length, mm
  /** lowest / highest key on screen (lets an idle hand rest where it can be seen) */
  lo?: number;
  hi?: number;
}
export const WHITE_MM = 23.5;
export const BLACK_H = 12;     // black key top above the white key surface, mm
export const KEY_DIP = 9;      // key travel, mm
export const HOVER = 6;        // fingertip hover above a key it is about to play, mm

export interface BridgeNote { midi: number; finger: number; on: number; off: number; ev: number }
export interface FingerAnim { target: V3; w: number; press: number; midi?: number }
export interface HandAnim { x: number; y: number; yaw: number; fingers: FingerAnim[]; /** extra height of the whole hand above the keys, mm */ z?: number }

const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6))); return t * t * (3 - 2 * t); };
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** quintic ease: no jolt at the start or end of a move (zero velocity and acceleration) */
const glide = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6))); return t * t * t * (t * (t * 6 - 15) + 10); };

// comfortable reach of each fingertip around its relaxed spot across the keys (mm): [toward -x, toward +x]
const REACH: [number, number][] = [[12, 42], [11, 9], [9, 9], [9, 10], [9, 12]];

interface Key { t: number; x: number; y: number; free: number }

export class AnimationBridge {
  readonly notes: Record<Hand, BridgeNote[]> = { RH: [], LH: [] };
  readonly byFinger: Record<Hand, BridgeNote[][]> = { RH: [[], [], [], [], []], LH: [[], [], [], [], []] };
  private keysX: Record<Hand, Key[]> = { RH: [], LH: [] };
  readonly present: Record<Hand, boolean> = { RH: false, LH: false };
  readonly centre: number;

  constructor(events: ScoreEvent[], fingering: number[][], timeOf: (beat: number) => number, readonly geo: KeyGeo) {
    const allX = events.flatMap((e) => e.pitches.map((p) => geo.x(p)));
    this.centre = geo.x(60);
    void allX;
    events.forEach((ev, k) => {
      const on = timeOf(ev.beat);
      const end = timeOf(ev.beat + ev.beats);
      const off = on + Math.max(0.06, (end - on) * 0.94);
      ev.pitches.forEach((p, i) => {
        const hand = handOfPitch(ev, p);
        const finger = fingering[k]?.[i] || 3;
        const n = { midi: p, finger, on, off, ev: k };
        this.notes[hand].push(n);
        this.byFinger[hand][finger - 1].push(n);
        this.present[hand] = true;
      });
    });
    for (const h of ['RH', 'LH'] as Hand[]) {
      this.byFinger[h].forEach((l) => {
        l.sort((a, b) => a.on - b.on);
        // a finger cannot hold one key while it plays the next
        for (let i = 0; i + 1 < l.length; i++) if (l[i].off > l[i + 1].on - 0.035) l[i].off = Math.max(l[i].on + 0.03, l[i + 1].on - 0.035);
      });
      this.keysX[h] = this.planHand(h);
    }
    // a hand with nothing to play rests on the keys, clear of the other hand, so both are visible
    for (const h of ['RH', 'LH'] as Hand[]) {
      if (this.present[h]) continue;
      const other = this.notes[h === 'RH' ? 'LH' : 'RH'].map((n) => n.midi);
      if (!other.length) continue;
      let mid = h === 'RH' ? Math.max(64, Math.max(...other) + 9) : Math.min(52, Math.min(...other) - 9);
      if (geo.lo !== undefined && geo.hi !== undefined) mid = clamp(mid, geo.lo + 5, geo.hi - 5);
      if (isBlackKey(mid)) mid -= 1;
      if (h === 'RH' ? mid - 4 <= Math.max(...other) : mid + 4 >= Math.min(...other)) continue; // no room
      this.keysX[h] = [{ t: -1, x: this.mx(h, mid), y: this.restLine, free: -1 }];
      this.present[h] = true;
      this.idle[h] = true;
    }
  }
  readonly idle: Record<Hand, boolean> = { RH: false, LH: false };

  /** Model-space x of a key for a hand (left hand mirrored). */
  mx(h: Hand, midi: number) { return h === 'RH' ? this.geo.x(midi) : -this.geo.x(midi); }
  get blackFront() { return this.geo.whiteLen - this.geo.blackLen; }
  /** Line the relaxed middle fingertip rests on (just in front of the black keys). */
  get restLine() { return clamp(this.blackFront - 2, 14, 64); }

  /** Where a fingertip touches a key (model space, z = key surface). */
  keyPoint(h: Hand, midi: number, finger: number): V3 {
    const black = isBlackKey(midi);
    const yRel = REST_Y[finger - 1] * 0.7;
    const y = black ? clamp(this.blackFront + 12 + yRel * 0.3, this.blackFront + 6, this.geo.whiteLen - 8)
      : clamp(this.restLine + yRel, 7, this.blackFront + 3);
    return [this.mx(h, midi), y, black ? BLACK_H : 0];
  }

  private planHand(h: Hand): Key[] {
    const groups = new Map<number, BridgeNote[]>();
    for (const n of this.notes[h]) { const k = Math.round(n.on * 1000); groups.set(k, [...(groups.get(k) ?? []), n]); }
    const times = [...groups.keys()].sort((a, b) => a - b);
    const keys: Key[] = [];
    let hx: number | null = null;
    for (const k of times) {
      const g = groups.get(k)!;
      let lo = -Infinity, hi = Infinity, comfy = 0, blacks = 0;
      for (const n of g) {
        const x = this.mx(h, n.midi), off = REST_OFFSETS[n.finger - 1], [l, r] = REACH[n.finger - 1];
        lo = Math.max(lo, x - off - r); hi = Math.min(hi, x - off + l);
        comfy += x - off;
        if (isBlackKey(n.midi)) blacks++;
      }
      comfy /= g.length;
      let next: number;
      if (lo > hi) next = comfy;                                   // unreachable spread: centre it
      else {
        const lazy = hx === null ? comfy : clamp(hx, lo, hi);
        next = clamp(lazy + (comfy - lazy) * 0.45, lo, hi);
      }
      hx = next;
      // black keys pull the hand a little further into the keyboard
      keys.push({ t: g[0].on, x: next, y: this.restLine + (blacks / g.length) * 9, free: Math.max(...g.map((n) => n.off)) });
    }
    return keys;
  }

  /** Hand placement at time t (model space). */
  handAt(h: Hand, t: number): { x: number; y: number; yaw: number } {
    const K = this.keysX[h];
    if (!K.length) return { x: 0, y: this.restLine, yaw: 0 };
    let x = K[0].x, y = K[0].y;
    for (let i = 1; i < K.length; i++) {
      const a = K[i - 1], b = K[i];
      const move = clamp(0.14 + Math.abs(b.x - a.x) / 380, 0.14, 0.42);
      // keep the hand still while the previous keys are still held (legato, thumb passing under);
      // a big shift then finishes just after the new note, the reaching finger leading the hand
      const hold = Math.abs(b.x - a.x) > 10 ? Math.min(a.free - 0.07, b.t - 0.06) : -Infinity;
      const start = Math.max(a.t + 0.02, b.t - 0.04 - move, hold), arrive = start + Math.min(move, Math.max(0.12, b.t + 0.1 - start));
      if (t <= start) break;
      const u = glide(start, arrive, t);
      x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u;
      if (t < arrive) break;
    }
    const c = h === 'RH' ? this.centre : -this.centre;
    const yaw = -clamp((x - c) / 900, -0.22, 0.22);
    return { x, y, yaw };
  }

  /** Finger motion at time t. `target` is in model space; w = 0 means "relaxed, follow the hand". */
  fingersAt(h: Hand, t: number): FingerAnim[] {
    return this.byFinger[h].map((list, fi) => {
      const f = fi + 1;
      let prev: BridgeNote | undefined, next: BridgeNote | undefined;
      for (const n of list) { if (n.on <= t + 0.03) prev = n; else { next = n; break; } }
      const ATT = 0.045, REL = 0.09;
      let press = 0, w = 0, target: V3 = [0, 0, 0], midi: number | undefined;
      if (prev && t < prev.off + REL) {
        press = t < prev.off ? smooth(prev.on - 0.03, prev.on + ATT - 0.03, t) : 1 - smooth(prev.off, prev.off + REL, t);
        const k = this.keyPoint(h, prev.midi, f);
        target = [k[0], k[1], k[2] + HOVER * (1 - press) - KEY_DIP * press];
        w = 1; midi = prev.midi;
      }
      if (next) {
        const free = prev ? prev.off + REL * 0.6 : -Infinity;
        const prep = clamp(next.on - free, 0.09, 0.42);
        const u = smooth(next.on - prep - 0.03, next.on - 0.03, t);
        if (u > 0) {
          const k = this.keyPoint(h, next.midi, f);
          const hover: V3 = [k[0], k[1], k[2] + HOVER];
          if (w > 0 && press > 0.02) {
            // still releasing the previous key: lift first, then travel
            target = [target[0] + (hover[0] - target[0]) * u * (1 - press), target[1] + (hover[1] - target[1]) * u * (1 - press), target[2] + (hover[2] - target[2]) * u];
          } else if (w > 0) {
            target = [target[0] + (hover[0] - target[0]) * u, target[1] + (hover[1] - target[1]) * u, target[2] + (hover[2] - target[2]) * u + Math.sin(Math.PI * u) * 4];
          } else { target = hover; w = u; }
        }
      }
      if (prev && !next && t >= prev.off + REL) {
        // after its last note the finger relaxes back into the hand shape
        const k = this.keyPoint(h, prev.midi, f);
        target = [k[0], k[1], k[2] + HOVER];
        w = 1 - smooth(prev.off + REL, prev.off + REL + 0.3, t);
      } else if (prev && next && w === 0 && t >= prev.off + REL) {
        const k = this.keyPoint(h, prev.midi, f);
        target = [k[0], k[1], k[2] + HOVER];
        w = 1 - smooth(prev.off + REL, prev.off + REL + 0.3, t);
      }
      return { target, w, press, midi };
    });
  }

  at(h: Hand, t: number): HandAnim {
    return { ...this.handAt(h, t), fingers: this.fingersAt(h, t) };
  }

  /** Start time of the note group of event `k` (for step mode and seeking). */
  timeOfEvent(k: number): number | undefined {
    const n = this.notes.RH.find((x) => x.ev === k) ?? this.notes.LH.find((x) => x.ev === k);
    return n?.on;
  }
}
