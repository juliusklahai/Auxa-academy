import { describe, expect, it } from 'vitest';
import { inflateSync } from 'fflate';
import { HAND_DATA, HAND_LAYOUT } from '../src/hands3d/handData';
import { BONE_DEFS, LIM, REST, boneRotations, fingerContact, frameFor, qMul, qRot, solveFinger, toLocal, type FingerParams, type Q } from '../src/hands3d/kinematics';
import { FINGERS, type V3 } from '../src/hands3d/anatomy';
import { AnimationBridge, KEY_DIP } from '../src/hands3d/bridge';
import { HandPoser } from '../src/hands3d/pose';
import { planFingering } from '../src/hands3d/fingering';
import { isBlackKey } from '../src/core/music';
import type { ScoreEvent } from '../src/core/types';

// ---------- decode the shipped hand ----------
const raw = inflateSync(Uint8Array.from(atob(HAND_DATA), (c) => c.charCodeAt(0)));
const T: Record<string, { new (b: ArrayBuffer, o: number, n: number): ArrayLike<number>; BYTES_PER_ELEMENT: number }> = { Int16Array, Int8Array, Uint16Array, Uint8Array } as never;
const D: Record<string, ArrayLike<number>> = {};
for (const [k, [off, len, type]] of Object.entries(HAND_LAYOUT)) D[k] = new T[type](raw.buffer, raw.byteOffset + off, len / T[type].BYTES_PER_ELEMENT);
const nV = D.pos.length / 3;
const vtx = (a: ArrayLike<number>, i: number): V3 => [a[i * 3] / 100, a[i * 3 + 1] / 100, a[i * 3 + 2] / 100];

// ---------- CPU skinning (same math as the GPU: bind orientations are identity) ----------
function boneWorld(rots: Q[]): { R: Q[]; P: V3[] } {
  const R: Q[] = [], P: V3[] = [];
  BONE_DEFS.forEach((b, i) => {
    if (i <= 1) { R[i] = rots[i]; P[i] = [0, 0, 0]; return; } // forearm and palm both pivot at the wrist
    const pi = b.parent, ph = pi <= 1 ? [0, 0, 0] : BONE_DEFS[pi].head;
    const off: V3 = [b.head[0] - ph[0], b.head[1] - ph[1], b.head[2] - ph[2]];
    const r = qRot(R[pi], off);
    P[i] = [P[pi][0] + r[0], P[pi][1] + r[1], P[pi][2] + r[2]];
    R[i] = qMul(R[pi], rots[i]);
  });
  return { R, P };
}
function skin(p: V3, si: number[], sw: number[], W: { R: Q[]; P: V3[] }): V3 {
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    if (!sw[k]) continue;
    const b = si[k], h = b <= 1 ? [0, 0, 0] : BONE_DEFS[b].head;
    const r = qRot(W.R[b], [p[0] - h[0], p[1] - h[1], p[2] - h[2]]);
    for (let c = 0; c < 3; c++) out[c] += (W.P[b][c] + r[c]) * sw[k];
  }
  return out;
}
const curled = (): FingerParams[] => FINGERS.map((f) => [0, LIM[f.id][1][1] * 0.75, LIM[f.id][2][1] * 0.8] as FingerParams);

describe('HandGeometry', () => {
  it('is one continuous, closed, skinned mesh with nails', () => {
    expect(nV).toBeGreaterThan(6000);
    // one connected component (no glued-on primitives)
    const parent = Int32Array.from({ length: nV }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (let t = 0; t < D.idx.length; t += 3) for (let e = 0; e < 3; e++) parent[find(D.idx[t + e])] = find(D.idx[t + (e + 1) % 3]);
    const roots = new Set<number>(); for (let i = 0; i < nV; i++) roots.add(find(i));
    expect(roots.size).toBe(1);
    // closed surface except the open forearm cut: almost every edge is shared by exactly 2 triangles
    const edges = new Map<string, number>();
    for (let t = 0; t < D.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = D.idx[t + e], b = D.idx[t + (e + 1) % 3]; const k = a < b ? `${a},${b}` : `${b},${a}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
    const open = [...edges.values()].filter((c) => c !== 2).length;
    expect(open / edges.size).toBeLessThan(0.02);
    // skin weights sum to 1 and every finger owns vertices
    for (let v = 0; v < nV; v += 37) expect(D.sw[v * 4] + D.sw[v * 4 + 1] + D.sw[v * 4 + 2] + D.sw[v * 4 + 3]).toBe(255);
    const owners = new Set<number>(); for (let v = 0; v < nV; v++) owners.add(D.part[v]);
    expect([...owners].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(D.nailIdx.length / 3).toBeGreaterThan(5 * 50);
  });

  it('has anatomical volume: knuckles, finger taper, palm thicker than fingers', () => {
    const P = Array.from({ length: nV }, (_, i) => vtx(D.pos, i));
    const thick = (y0: number, y1: number, x0: number, x1: number) => { const z = P.filter((p) => p[1] > y0 && p[1] < y1 && p[0] > x0 && p[0] < x1).map((p) => p[2]); return Math.max(...z) - Math.min(...z); };
    const palm = thick(40, 60, -10, 10), finger = thick(150, 160, -10, 2);
    expect(palm).toBeGreaterThan(finger * 1.5);
    const width = (y: number) => { const x = P.filter((p) => Math.abs(p[1] - y) < 1.5 && p[0] > -14 && p[0] < 6 && p[2] > 0).map((p) => p[0]); return Math.max(...x) - Math.min(...x); };
    expect(width(105)).toBeGreaterThan(width(180)); // middle finger tapers toward the tip
  });
});

describe('AnatomicalStrokes stay attached while bending', () => {
  it('every stroke point stays on the deformed skin (CPU-skinned, curled fist pose)', () => {
    const W = boneWorld(boneRotations(curled()));
    const body = Array.from({ length: nV }, (_, i) => skin(vtx(D.pos, i), [D.si[i * 4], D.si[i * 4 + 1], D.si[i * 4 + 2], D.si[i * 4 + 3]], [0, 1, 2, 3].map((k) => D.sw[i * 4 + k] / 255), W));
    // spatial hash of the deformed body
    const cell = 3, grid = new Map<string, number[]>();
    body.forEach((p, i) => { const k = p.map((x) => Math.floor(x / cell)).join(','); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
    const nearest = (p: V3) => {
      let best = Infinity; const c = p.map((x) => Math.floor(x / cell));
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let d = -2; d <= 2; d++) for (const i of grid.get(`${c[0] + a},${c[1] + b},${c[2] + d}`) ?? []) best = Math.min(best, Math.hypot(body[i][0] - p[0], body[i][1] - p[1], body[i][2] - p[2]));
      return best;
    };
    const nS = D.stPos.length / 3;
    let worst = 0;
    for (let i = 0; i < nS; i += 2) {
      const p = skin(vtx(D.stPos, i), [D.stSi[i * 4], D.stSi[i * 4 + 1], D.stSi[i * 4 + 2], D.stSi[i * 4 + 3]], [0, 1, 2, 3].map((k) => D.stSw[i * 4 + k] / 255), W);
      worst = Math.max(worst, nearest(p));
    }
    expect(nS).toBeGreaterThan(400);
    expect(worst).toBeLessThan(3.2); // mm: within about one mesh cell (2.3 mm) of the deformed skin, never floating
  });
});

describe('FingerIK', () => {
  it('reaches nearby key targets and respects joint limits', () => {
    const fr = frameFor(0, 40, 0, 1.5);
    for (const f of FINGERS) {
      const rest = fingerContact(f, REST[f.id]);
      const t: V3 = [rest[0] + 6, rest[1] + 4, rest[2] - 9];
      const r = solveFinger(f.id, t, REST[f.id], 30);
      // fingers reach on their own; the thumb's last few mm come from the wrist (see HandPoser)
      expect(r.err).toBeLessThan(f.id === 1 ? 7 : 1.5);
      r.p.forEach((v, k) => { expect(v).toBeGreaterThanOrEqual(LIM[f.id][k][0] - 1e-9); expect(v).toBeLessThanOrEqual(LIM[f.id][k][1] + 1e-9); });
    }
    void toLocal(fr, [0, 0, 0]);
  });
});

// ---------- bridge + poser on a real keyboard layout ----------
const whites: number[] = []; for (let m = 36; m <= 96; m++) if (!isBlackKey(m)) whites.push(m);
const keyX = (m: number) => (isBlackKey(m) ? whites.indexOf(m - 1) + 1 : whites.indexOf(m) + 0.5) * 23.5;
const geo = { x: keyX, whiteLen: 120, blackLen: 75 };
const run = (events: ScoreEvent[], spb = 0.5) => new AnimationBridge(events, planFingering(events), (b) => b * spb, geo);

describe('MusicAnimationBridge + HandRig', () => {
  it('plays a two-octave scale: every note reached by its finger, thumb passes under without jumps', () => {
    const C = [0, 2, 4, 5, 7, 9, 11];
    const notes = [...Array.from({ length: 14 }, (_, i) => 60 + Math.floor(i / 7) * 12 + C[i % 7]), 84];
    const br = run(notes.map((m, i) => ({ pitches: [m], beat: i, beats: 1, hand: 'RH' as const })));
    const poser = new HandPoser();
    let lastX = br.handAt('RH', 0).x, maxJump = 0;
    for (let t = 0; t < 7.6; t += 1 / 60) {
      const a = br.at('RH', t);
      const p = poser.pose(a);
      maxJump = Math.max(maxJump, Math.abs(a.x - lastX)); lastX = a.x;
      br.notes.RH.forEach((n) => {
        if (t > n.on + 0.08 && t < n.off - 0.02) {
          const tip = p.tips[n.finger - 1], k = br.keyPoint('RH', n.midi, n.finger);
          expect(Math.abs(tip[0] - k[0])).toBeLessThan(9);     // on its own key (key is 23.5 mm wide)
          expect(tip[2]).toBeLessThan(k[2] - KEY_DIP * 0.5);   // key held down
        }
      });
    }
    expect(maxJump).toBeLessThan(9); // mm per frame at 60 fps: fast shifts glide, never teleport
  });

  it('chords press together; staccato and repeated notes lift between presses', () => {
    const br = run([{ pitches: [60, 64, 67], beat: 0, beats: 1, hand: 'RH' }, { pitches: [67], beat: 1, beats: 0.25, hand: 'RH' }, { pitches: [67], beat: 2, beats: 1, hand: 'RH' }]);
    const at = br.fingersAt('RH', 0.1);
    expect(at.filter((f) => f.press > 0.95).length).toBe(3);
    const f5 = br.byFinger.RH.findIndex((l) => l.some((n) => n.ev === 1));
    expect(br.fingersAt('RH', 0.5 + 0.06)[f5].press).toBeGreaterThan(0.9);
    expect(br.fingersAt('RH', 0.85)[f5].press).toBe(0);      // released after the staccato note
    expect(br.fingersAt('RH', 1.02)[f5].press).toBeGreaterThan(0.9);
  });

  it('is a pure function of the clock (pause, seek, loop and tempo change re-sync)', () => {
    const ev = [60, 62, 64, 65, 67].map((m, i) => ({ pitches: [m], beat: i, beats: 1, hand: 'RH' as const }));
    const a = run(ev, 0.5), b = run(ev, 0.25);
    expect(a.at('RH', 1.3)).toEqual(a.at('RH', 1.3));
    // the same musical position at a different tempo puts the same finger on the same key
    expect(a.fingersAt('RH', 1.0 + 0.1).map((f) => f.midi)).toEqual(b.fingersAt('RH', 0.5 + 0.1).map((f) => f.midi));
  });

  it('left hand mirrors the right hand rig and moves across octaves', () => {
    const br = run([{ pitches: [48], beat: 0, beats: 1, hand: 'LH' }, { pitches: [36], beat: 2, beats: 1, hand: 'LH' }]);
    const x0 = br.handAt('LH', 0.1).x, x1 = br.handAt('LH', 1.3).x;
    // model space is mirrored (moving down the keyboard = +x); an octave down played 1 -> 5 moves
    // the hand one octave (7 white keys = 164 mm) minus the thumb-to-little-finger span (~87 mm)
    expect(x1 - x0).toBeGreaterThan(60);
    expect(x1 - x0).toBeLessThan(100);
  });
});

describe('Keyboard sizes and an idle hand', () => {
  it('fixed sizes keep their key count and centre on the music', async () => {
    const { keyboardRange } = await import('../src/ui/Piano');
    const count = ([a, b]: [number, number]) => b - a + 1;
    expect(count(keyboardRange(60, 72, 25))).toBe(25);
    expect(keyboardRange(60, 72, 88)).toEqual([21, 108]);
    expect(count(keyboardRange(40, 80, 61))).toBe(61);
    const [a, b] = keyboardRange(72, 84, 25); expect(a <= 72 && b >= 84).toBe(true);
    // auto: adds octaves while keys would be wider than the limit
    const [l, h] = keyboardRange(60, 72, 'auto', 1300, 56);
    let w = 0; for (let m = l; m <= h; m++) if (!isBlackKey(m)) w++;
    expect(1300 / w).toBeLessThanOrEqual(56);
  });
  it('a hand with no notes rests beside the other hand, inside the keyboard', () => {
    const br = new AnimationBridge([{ pitches: [60, 64, 67], beat: 0, beats: 2, hand: 'RH' }], [[1, 3, 5]], (b) => b * 0.5, { ...geo, lo: 36, hi: 84 });
    expect(br.present.LH).toBe(true);
    expect(br.idle.LH).toBe(true);
    const x = -br.handAt('LH', 0).x; // mirrored model space back to keyboard mm
    expect(x).toBeLessThan(keyX(60) - 23.5 * 3);
    expect(x).toBeGreaterThan(keyX(36));
  });
});
