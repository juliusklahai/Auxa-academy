// HandRig + FingerIK (pure math, no WebGL).
// The skeleton has 17 bones (see anatomy.BONES). Every bone's bind orientation is the identity, so a
// bone's local rotation is applied in the hand's own frame: +Y along the fingers, +Z out of the back of
// the hand, thumb on -X (right hand). The left hand is the mirror image and is solved in the right-hand
// model space (x -> -x) and drawn with a negative x scale.
//
// Finger chains have 3 degrees of freedom that the IK solves for: MCP abduction, MCP flexion and PIP
// flexion. DIP flexion is coupled to PIP flexion (as the flexor tendons do in a real finger). The thumb
// solves CMC yaw (toward the palm), CMC flexion (down, toward the keys) and MCP flexion, with the IP
// joint coupled and a small automatic pronation roll that comes with opposition.

import { FINGERS, LIMITS, chainStart, type FingerDef, type V3 } from './anatomy';

export type Q = [number, number, number, number]; // x, y, z, w
const D2R = Math.PI / 180;

export const qId = (): Q => [0, 0, 0, 1];
export function qAxis(a: V3, ang: number): Q {
  const l = Math.hypot(a[0], a[1], a[2]) || 1, s = Math.sin(ang / 2) / l;
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)];
}
export function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qRot(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
export const qInv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Z: V3 = [0, 0, 1];

// ---------- skeleton ----------
export interface BoneDef { name: string; parent: number; head: V3 }
export const BONE_DEFS: BoneDef[] = (() => {
  const b: BoneDef[] = [{ name: 'forearm', parent: -1, head: [0, -70, -1] }, { name: 'palm', parent: 0, head: [0, 0, 0] }];
  for (const f of FINGERS) {
    const s = chainStart(f.id);
    const names = f.id === 1 ? ['thumb_meta', 'thumb_prox', 'thumb_dist'] : ['prox', 'mid', 'dist'].map((x) => `${f.name}_${x}`);
    for (let k = 0; k < 3; k++) b[s + k] = { name: names[k], parent: k === 0 ? 1 : s + k - 1, head: f.joints[k] };
  }
  return b;
})();

/** Flexion axis of a finger (rotating +angle about it curls the finger toward the palm, -Z). */
export const flexAxis = (f: FingerDef): V3 => nrm(cross(Z, sub(f.joints[1], f.joints[0])));
const dirOf = (f: FingerDef): V3 => nrm(sub(f.joints[1], f.joints[0]));

/** Point a pianist touches the key with, in the distal bone's bind frame (world bind coordinates). */
export function contactBind(f: FingerDef): V3 {
  const a = f.joints[2], b = f.joints[3], d = nrm(sub(b, a)), r = f.radii[3];
  if (f.id === 1) return add(add(b, scl(d, -r * 0.55)), add(scl(Z, -r * 0.7), [r * 0.35, 0, 0])); // side of the thumb tip
  return add(add(b, scl(d, -r * 0.45)), scl(Z, -r * 0.82)); // finger pad just behind the nail tip
}

// ---------- per-finger parameters ----------
/** [abd/yaw, mcp/cmc flex, pip/mcp flex] in radians. */
export type FingerParams = [number, number, number];

export const LIM: Record<number, [number, number][]> = {
  1: [[LIMITS.thumbCmc.yaw[0] * D2R, LIMITS.thumbCmc.yaw[1] * D2R], [LIMITS.thumbCmc.flex[0] * D2R, LIMITS.thumbCmc.flex[1] * D2R], [LIMITS.thumbMcp.flex[0] * D2R, LIMITS.thumbMcp.flex[1] * D2R]],
  2: [[-20 * D2R, 18 * D2R], [LIMITS.mcp.flex[0] * D2R, LIMITS.mcp.flex[1] * D2R], [LIMITS.pip.flex[0] * D2R, LIMITS.pip.flex[1] * D2R]],
  3: [[-18 * D2R, 18 * D2R], [LIMITS.mcp.flex[0] * D2R, LIMITS.mcp.flex[1] * D2R], [LIMITS.pip.flex[0] * D2R, LIMITS.pip.flex[1] * D2R]],
  4: [[-18 * D2R, 20 * D2R], [LIMITS.mcp.flex[0] * D2R, LIMITS.mcp.flex[1] * D2R], [LIMITS.pip.flex[0] * D2R, LIMITS.pip.flex[1] * D2R]],
  5: [[-16 * D2R, 28 * D2R], [LIMITS.mcp.flex[0] * D2R, LIMITS.mcp.flex[1] * D2R], [LIMITS.pip.flex[0] * D2R, LIMITS.pip.flex[1] * D2R]],
};
/** Relaxed, rounded "piano" hand shape. Abduction sign: + spreads toward the little-finger side. */
export const REST: Record<number, FingerParams> = {
  1: [0, 40 * D2R, 8 * D2R],
  2: [-3 * D2R, 22 * D2R, 46 * D2R],
  3: [0, 22 * D2R, 48 * D2R],
  4: [3 * D2R, 22 * D2R, 46 * D2R],
  5: [8 * D2R, 20 * D2R, 42 * D2R],
};

/** Local rotations of a finger's 3 bones for the given parameters. */
export function fingerLocal(f: FingerDef, p: FingerParams): [Q, Q, Q] {
  const ax = flexAxis(f);
  if (f.id === 1) {
    const d = dirOf(f);
    const meta = qMul(qMul(qAxis(Z, -p[0]), qAxis(ax, p[1])), qAxis(d, -(p[0] * 0.2 + p[1] * 0.3))); // opposition roll
    return [meta, qAxis(ax, p[2]), qAxis(ax, p[2] * LIMITS.thumbIpCoupling)];
  }
  return [qMul(qAxis(Z, -p[0]), qAxis(ax, p[1])), qAxis(ax, p[2]), qAxis(ax, p[2] * LIMITS.dipCoupling)];
}

/** Contact point of a finger in the palm bone frame (palm head at the origin). */
export function fingerContact(f: FingerDef, p: FingerParams): V3 {
  const [l0, l1, l2] = fingerLocal(f, p);
  const j = f.joints;
  const r0 = l0, r1 = qMul(r0, l1), r2 = qMul(r1, l2);
  const p1 = add(j[0], qRot(r0, sub(j[1], j[0])));
  const p2 = add(p1, qRot(r1, sub(j[2], j[1])));
  return add(p2, qRot(r2, sub(contactBind(f), j[2])));
}

function clampP(fid: number, p: FingerParams): FingerParams {
  const L = LIM[fid];
  return [Math.max(L[0][0], Math.min(L[0][1], p[0])), Math.max(L[1][0], Math.min(L[1][1], p[1])), Math.max(L[2][0], Math.min(L[2][1], p[2]))];
}

/**
 * FingerIK: damped least squares on the 3 free angles with joint limits, warm-started from the
 * previous frame (keeps the natural, curved branch of the solution). Returns the parameters and the
 * remaining distance to the target in mm.
 */
export function solveFinger(fid: number, target: V3, init: FingerParams = REST[fid], iters = 14): { p: FingerParams; err: number } {
  const a = dls(fid, target, init, iters);
  if (a.err < 1.5 || init === REST[fid]) return a;
  const b = dls(fid, target, REST[fid], iters + 6);   // fall back to a fresh start from the relaxed shape
  return b.err < a.err - 0.5 ? b : a;
}
function dls(fid: number, target: V3, init: FingerParams, iters: number): { p: FingerParams; err: number } {
  const f = FINGERS[fid - 1];
  let p = clampP(fid, [...init] as FingerParams);
  const rest = REST[fid];
  let e = sub(target, fingerContact(f, p));
  const h = 1e-3, lam2 = 16, maxStep = 0.14;
  for (let it = 0; it < iters; it++) {
    const err = Math.hypot(e[0], e[1], e[2]);
    if (err < 0.15) break;
    const J: V3[] = [0, 1, 2].map((k) => { const q = [...p] as FingerParams; q[k] += h; return scl(sub(fingerContact(f, q), fingerContact(f, p)), 1 / h); });
    // A = J J^T + lam^2 I (3x3), dp = J^T A^-1 e   (J columns = J[k])
    const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => J[0][r] * J[0][c] + J[1][r] * J[1][c] + J[2][r] * J[2][c] + (r === c ? lam2 : 0)));
    const x = solve3(A, e);
    // a small pull toward the relaxed shape keeps the redundant MCP/PIP split natural
    let dp = [0, 1, 2].map((k) => J[k][0] * x[0] + J[k][1] * x[1] + J[k][2] * x[2] + (rest[k] - p[k]) * 0.03);
    const m = Math.max(...dp.map(Math.abs));
    if (m > maxStep) dp = dp.map((v) => (v * maxStep) / m);
    p = clampP(fid, [p[0] + dp[0], p[1] + dp[1], p[2] + dp[2]]);
    e = sub(target, fingerContact(f, p));
  }
  return { p, err: Math.hypot(e[0], e[1], e[2]) };
}
function solve3(A: number[][], b: V3): V3 {
  const [a, bb, c] = A[0], [d, e, f] = A[1], [g, h, i] = A[2];
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g) || 1e-9;
  const inv = [
    [(e * i - f * h) / det, (c * h - bb * i) / det, (bb * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (bb * g - a * h) / det, (a * e - bb * d) / det],
  ];
  return [inv[0][0] * b[0] + inv[0][1] * b[1] + inv[0][2] * b[2], inv[1][0] * b[0] + inv[1][1] * b[1] + inv[1][2] * b[2], inv[2][0] * b[0] + inv[2][1] * b[1] + inv[2][2] * b[2]];
}

// ---------- whole-hand placement ----------
export interface HandFrame { pos: V3; rot: Q } // palm bone (wrist joint) in keyboard space, right-hand model space
export const HAND_PITCH = 7 * D2R;   // knuckles slightly higher than the wrist
export const HAND_ROLL = 9 * D2R;    // little-finger side slightly lower (natural pronation)

export function handRotation(yaw: number, roll = HAND_ROLL): Q {
  return qMul(qAxis(Z, yaw), qMul(qAxis([1, 0, 0], HAND_PITCH), qAxis([0, 1, 0], roll)));
}
/** Contact point of each finger in the relaxed pose, palm frame. */
export const REST_CONTACT: V3[] = FINGERS.map((f) => fingerContact(f, REST[f.id]));

/** Palm frame that puts the relaxed middle fingertip at (x, y) hovering `hover` mm above the white keys. */
export function frameFor(x: number, y: number, yaw: number, hover: number, roll = HAND_ROLL): HandFrame {
  const rot = handRotation(yaw, roll);
  const c = qRot(rot, REST_CONTACT[2]);
  return { pos: [x - c[0], y - c[1], hover - c[2]], rot };
}
export const toLocal = (fr: HandFrame, p: V3): V3 => qRot(qInv(fr.rot), sub(p, fr.pos));
export const toWorld = (fr: HandFrame, p: V3): V3 => add(fr.pos, qRot(fr.rot, p));

/** Rest tip x offsets (mm) of each finger relative to the middle finger when the hand is level. */
export const REST_OFFSETS: number[] = (() => { const fr = frameFor(0, 0, 0, 0); return REST_CONTACT.map((c) => toWorld(fr, c)[0]); })();
export const REST_Y: number[] = (() => { const fr = frameFor(0, 0, 0, 0); return REST_CONTACT.map((c) => toWorld(fr, c)[1]); })();

/** All 17 bone local rotations for a set of finger parameters (index 0 = forearm). */
export function boneRotations(params: FingerParams[], wristFlex = 0): Q[] {
  const out: Q[] = BONE_DEFS.map(() => qId());
  out[1] = qAxis([1, 0, 0], wristFlex);
  for (const f of FINGERS) {
    const s = chainStart(f.id);
    const l = fingerLocal(f, params[f.id - 1]);
    out[s] = l[0]; out[s + 1] = l[1]; out[s + 2] = l[2];
  }
  return out;
}
