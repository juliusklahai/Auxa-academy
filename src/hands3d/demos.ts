// Hand demonstrations for teaching steps that are about the body, not notation: hand shape, finger
// numbers, arm weight, thumb under, legato and staccato, trills... Each one is a short looping script:
// notes (with fingers) on a timeline in seconds, plus how high each hand floats above the keys.
// Scripts start and end in the same place, so the loop is seamless.
import type { Hand, ScoreEvent } from '../core/types';

export type DemoId =
  | 'setup' | 'shape' | 'fingers' | 'quiet' | 'armweight' | 'touch' | 'legato' | 'staccato'
  | 'thumbUnder' | 'crossOver' | 'substitution' | 'broken' | 'waltz' | 'holdCommon' | 'sixths'
  | 'trill' | 'mordent' | 'grace' | 'leap' | 'octaves';

export interface DemoScript {
  id: DemoId;
  /** what the learner should watch, one line */
  caption: string;
  events: ScoreEvent[];
  fingering: number[][];
  /** loop length, seconds */
  loop: number;
  /** keyboard range to draw */
  lo: number;
  hi: number;
  /** show finger numbers whatever the setting */
  labels?: boolean;
  /** hand height above the keys (mm) over time */
  lift?: (h: Hand, t: number) => number;
  /** note velocity for the "hear it" playback, 0..1 (per note index) */
  vel?: (i: number) => number;
}

const glide = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * t * (t * (t * 6 - 15) + 10); };
/** a hand that hovers at `h` mm, settles onto the keys between a0..a1 and rises again b0..b1 */
const settle = (h: number, a0: number, a1: number, b0: number, b1: number) => (t: number) => h * (1 - glide(a0, a1, t)) + h * glide(b0, b1, t);
const hover = (f: (t: number) => number) => (_: Hand, t: number) => f(t);

class Builder {
  ev: ScoreEvent[] = [];
  fi: number[][] = [];
  note(hand: Hand, midi: number | number[], finger: number | number[], at: number, dur: number) {
    const ps = Array.isArray(midi) ? midi : [midi];
    const fs = Array.isArray(finger) ? finger : [finger];
    this.ev.push({ pitches: ps, beat: at, beats: dur, hand });
    this.fi.push(fs);
    return this;
  }
  /** one note after another, `step` seconds apart, each lasting step * len */
  run(hand: Hand, notes: number[], fingers: number[], at: number, step: number, len = 0.92) {
    notes.forEach((m, i) => this.note(hand, m, fingers[i], at + i * step, step * len));
    return this;
  }
  done(d: Omit<DemoScript, 'events' | 'fingering'>): DemoScript {
    const order = this.ev.map((e, i) => i).sort((a, b) => this.ev[a].beat - this.ev[b].beat);
    return { ...d, events: order.map((i) => this.ev[i]), fingering: order.map((i) => this.fi[i]) };
  }
}

const RH5 = [60, 62, 64, 65, 67], LH5 = [55, 53, 52, 50, 48]; // C position, thumb first

export function demoScript(id: DemoId): DemoScript {
  const b = new Builder();
  switch (id) {
    case 'setup': // hands float down onto the keys, rest in the C position, play one soft chord
      return b.note('RH', [60, 64, 67], [1, 3, 5], 2.4, 1.6).note('LH', [48, 52, 55], [5, 3, 1], 2.4, 1.6)
        .done({ id, caption: 'Hands float down onto the keys in their natural curve, facing the middle of the keyboard.', loop: 6.5, lo: 45, hi: 74, lift: hover(settle(42, 0.6, 1.9, 4.9, 6.2)) });
    case 'shape':
      return b.run('RH', RH5, [1, 2, 3, 4, 5], 2.2, 0.45).run('LH', LH5, [1, 2, 3, 4, 5], 2.2, 0.45)
        .done({ id, caption: 'Lift the hands without changing their shape, set them on the keys, and play on the fingertips.', loop: 6.6, lo: 45, hi: 74, labels: true, lift: hover(settle(44, 0.5, 1.6, 4.9, 6.1)) });
    case 'fingers':
      for (let f = 1; f <= 5; f++) b.note('RH', RH5[f - 1], f, 0.5 + (f - 1) * 0.9, 0.6).note('LH', LH5[f - 1], f, 0.5 + (f - 1) * 0.9, 0.6);
      return b.done({ id, caption: 'Thumb is 1, little finger is 5, in both hands. Watch each finger play in turn.', loop: 5.4, lo: 45, hi: 74, labels: true });
    case 'quiet': {
      const up = [0, 1, 2, 3, 4, 3, 2, 1];
      b.run('RH', up.map((i) => RH5[i]), up.map((i) => i + 1), 0.4, 0.36, 1);
      return b.done({ id, caption: 'The hand stays still and level. Only the playing finger moves.', loop: 3.4, lo: 57, hi: 72, labels: true });
    }
    case 'armweight':
      return b.note('RH', 64, 3, 1.0, 0.9).note('LH', 52, 3, 1.0, 0.9)
        .done({ id, caption: 'Let the arm drop its weight into one finger, then float up again. No pushing.', loop: 3.6, lo: 45, hi: 74, labels: true,
          lift: (_, t) => (t < 1.0 ? 58 * (1 - glide(0.45, 1.0, t)) : 58 * glide(1.95, 3.2, t)) });
    case 'touch': // a small drop for soft, a big one for loud
      return b.note('RH', 64, 3, 1.0, 0.7).note('RH', 64, 3, 3.3, 0.7)
        .done({ id, caption: 'Soft: a short, slow drop. Loud: more height and speed. The finger stays firm, the wrist loose.', loop: 4.8, lo: 57, hi: 72, labels: true, vel: (i) => (i === 0 ? 0.32 : 0.95) ,
          lift: (_, t) => (t < 1.0 ? 12 * (1 - glide(0.55, 1.0, t)) : t < 2.9 ? 60 * glide(1.7, 2.7, t) : t < 3.3 ? 60 * (1 - glide(2.9, 3.3, t)) : 12 * glide(4.0, 4.8, t)) });
    case 'legato':
      return b.run('RH', [...RH5, 65, 64, 62], [1, 2, 3, 4, 5, 4, 3, 2], 0.4, 0.42, 1.04)
        .done({ id, caption: 'Legato: the next key goes down exactly as the last one comes up. No gaps.', loop: 4.0, lo: 57, hi: 72, labels: true });
    case 'staccato':
      return b.run('RH', [...RH5, 65, 64, 62], [1, 2, 3, 4, 5, 4, 3, 2], 0.4, 0.42, 0.28)
        .done({ id, caption: 'Staccato: short and light. Each finger springs off the key at once.', loop: 4.0, lo: 57, hi: 72, labels: true });
    case 'thumbUnder':
      return b.run('RH', [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60], [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1], 0.4, 0.38, 1)
        .done({ id, caption: 'Going up, the thumb slides under the hand to the next key. Coming down, finger 3 crosses over the thumb.', loop: 6.6, lo: 57, hi: 76, labels: true });
    case 'crossOver':
      return b.run('RH', [72, 71, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 69, 71, 72], [5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5], 0.4, 0.38, 1)
        .done({ id, caption: 'Coming down, finger 3 crosses over the thumb, and the hand keeps moving smoothly.', loop: 6.6, lo: 57, hi: 76, labels: true });
    case 'substitution':
      return b.note('RH', 64, 3, 0.4, 1.5).note('RH', 64, 1, 1.4, 1.2).note('RH', 62, 2, 2.6, 0.5).note('RH', 60, 1, 3.1, 0.5).note('RH', 62, 2, 3.6, 0.45)
        .done({ id, caption: 'Hold the key and quietly swap fingers on it (3 to 1) without letting it up.', loop: 4.6, lo: 57, hi: 72, labels: true });
    case 'broken':
      return b.run('RH', [60, 64, 67, 64], [1, 3, 5, 3], 0.4, 0.45).run('LH', [48, 52, 55, 52], [5, 3, 1, 3], 0.4, 0.45)
        .run('RH', [60, 64, 67, 64], [1, 3, 5, 3], 2.2, 0.45).run('LH', [48, 52, 55, 52], [5, 3, 1, 3], 2.2, 0.45)
        .done({ id, caption: 'The hand stays shaped over all three keys. Only the fingers take turns.', loop: 4.0, lo: 45, hi: 72, labels: true });
    case 'waltz':
      for (let bar = 0; bar < 2; bar++) {
        const t0 = 0.4 + bar * 1.8;
        b.note('LH', bar ? 43 : 48, 5, t0, 0.55).note('LH', bar ? [53, 59] : [52, 55], bar ? [2, 1] : [3, 1], t0 + 0.6, 0.35).note('LH', bar ? [53, 59] : [52, 55], bar ? [2, 1] : [3, 1], t0 + 1.2, 0.35);
      }
      return b.done({ id, caption: 'Oom-pah-pah: a low bass note on 1, then a light chord on 2 and 3.', loop: 4.0, lo: 41, hi: 62, labels: true });
    case 'holdCommon':
      return b.note('RH', 60, 1, 0.4, 3.1).note('RH', [64, 67], [3, 5], 0.4, 1.4).note('RH', [65, 69], [4, 5], 1.9, 1.5)
        .done({ id, caption: 'C stays held by the thumb while the other fingers move to the next chord.', loop: 4.2, lo: 57, hi: 74, labels: true });
    case 'sixths':
      return b.note('RH', [64, 72], [1, 5], 0.4, 0.55).note('RH', [65, 74], [1, 5], 1.0, 0.55).note('RH', [67, 76], [1, 4], 1.6, 0.55).note('RH', [65, 74], [1, 5], 2.2, 0.55).note('RH', [64, 72], [1, 5], 2.8, 0.8)
        .done({ id, caption: 'The thumb rests lightly on the lower note; fingers 4 and 5 carry the tune on top.', loop: 4.0, lo: 60, hi: 79, labels: true });
    case 'trill': {
      for (let i = 0; i < 14; i++) b.note('RH', i % 2 ? 64 : 62, i % 2 ? 3 : 2, 0.5 + i * 0.11, 0.1);
      b.note('RH', 62, 2, 0.5 + 14 * 0.11, 0.6);
      return b.done({ id, caption: 'A trill: two neighbouring fingers alternate fast and light, the hand still.', loop: 3.4, lo: 57, hi: 72, labels: true });
    }
    case 'mordent':
      return b.note('RH', 64, 3, 0.5, 0.09).note('RH', 65, 4, 0.6, 0.09).note('RH', 64, 3, 0.7, 0.8).note('RH', 62, 2, 1.7, 0.5)
        .note('RH', 64, 3, 2.3, 0.09).note('RH', 65, 4, 2.4, 0.09).note('RH', 64, 3, 2.5, 0.8)
        .done({ id, caption: 'A mordent: the note, the one above, and straight back. A quick flick of the fingers.', loop: 4.0, lo: 57, hi: 72, labels: true });
    case 'grace':
      return b.note('RH', 61, 2, 0.5, 0.06).note('RH', 62, 3, 0.56, 0.9).note('RH', 64, 4, 1.6, 0.5).note('RH', 63, 3, 2.3, 0.06).note('RH', 64, 4, 2.36, 0.9)
        .done({ id, caption: 'A grace note is crushed in just before the main note, almost together.', loop: 3.8, lo: 57, hi: 72, labels: true });
    case 'leap':
      return b.note('RH', [60, 64, 67], [1, 3, 5], 0.4, 0.9).note('RH', [72, 76, 79], [1, 3, 5], 1.8, 0.9).note('RH', [60, 64, 67], [1, 3, 5], 3.2, 0.9)
        .done({ id, caption: 'For a leap, the hand travels early and arrives above the keys before it plays.', loop: 4.6, lo: 57, hi: 81, labels: true });
    case 'octaves': {
      const roots = [36, 41, 43, 36];
      roots.forEach((r, bar) => { for (let k = 0; k < 4; k++) b.note('LH', [r, r + 12], [5, 1], 0.3 + bar * 1.6 + k * 0.4, 0.3); });
      [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]].forEach((c, bar) => b.note('RH', c, [1, 3, 5], 0.3 + bar * 1.6, 1.5));
      return b.done({ id, caption: 'Left hand: octaves on every beat (5 and 1), right hand holds the chord.', loop: 6.7, lo: 33, hi: 72, labels: true });
    }
  }
}
