// HandGeometry: builds ONE continuous anatomical hand surface (palm, five fingers, thumb, wrist)
// from a smooth signed-distance model, polygonised with Surface Nets, then skinned to a 17-bone rig.
// Fingers are joined to the palm with smooth webbing but kept apart from each other; knuckles,
// finger pads and the thenar/hypothenar eminences are modelled as volume, not drawn on.
// Pure math (no DOM, no WebGL): unit-tested in tests/hands3d.test.ts.

import { FINGERS, chainStart, segLens, type FingerDef, type V3 } from './anatomy';

// ---------- SDF primitives ----------
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subv = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lenv = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function smin(a: number, b: number, k: number) { if (a === Infinity) return b; if (b === Infinity) return a; const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); }

/** Tapered capsule (round cone) from a (radius ra) to b (radius rb); z squashed by `flat`. */
function roundCone(p: V3, a: V3, b: V3, ra: number, rb: number, flat = 1): number {
  const q: V3 = [p[0], p[1], a[2] + (p[2] - a[2]) / flat];
  const ba = subv(b, a), pa = subv(q, a);
  const l2 = dot(ba, ba);
  const t = clamp(dot(pa, ba) / l2, 0, 1);
  const r = ra + (rb - ra) * t;
  const c: V3 = [a[0] + ba[0] * t, a[1] + ba[1] * t, a[2] + ba[2] * t];
  return (lenv(subv(q, c)) - r) * Math.min(1, flat * 1.05);
}
function sphere(p: V3, c: V3, r: number) { return lenv(subv(p, c)) - r; }
function ellipsoid(p: V3, c: V3, r: V3) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const q2 = [(p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2])];
  const k0 = Math.hypot(q[0], q[1], q[2]), k1 = Math.hypot(q2[0], q2[1], q2[2]);
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
export function roundBox(p: V3, c: V3, h: V3, r: number) {
  const q = [Math.abs(p[0] - c[0]) - h[0], Math.abs(p[1] - c[1]) - h[1], Math.abs(p[2] - c[2]) - h[2]];
  const o = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return o + Math.min(Math.max(q[0], q[1], q[2]), 0) - r;
}

// ---------- the hand ----------
function palmSDF(p: V3): number {
  let d = ellipsoid(p, [3, 50, -3.5], [33, 45, 11.5]);                                     // palm body, domed on the back
  for (const f of FINGERS.slice(1)) d = smin(d, roundCone(p, [f.joints[0][0] * 0.45, 12, -1], f.joints[0], 9.5, f.radii[0] * 0.98, 0.62), 7); // metacarpals
  d = smin(d, ellipsoid(p, [27, 40, -5], [10, 30, 10]), 8);                                // hypothenar (little-finger side)
  const th = FINGERS[0].joints;
  d = smin(d, roundCone(p, [-13, 16, -6], th[1], 15, FINGERS[0].radii[1] * 1.02, 0.75), 9); // thenar eminence + thumb metacarpal
  d = smin(d, roundCone(p, [0, 4, -1], [0, -95, -1], 22.5, 27, 0.62), 10);                 // wrist & forearm
  for (const f of FINGERS.slice(1)) d = smin(d, sphere(p, [f.joints[0][0], f.joints[0][1] - 2.5, 4.2], f.radii[0] * 0.62), 3.2); // knuckle heads
  d = smin(d, sphere(p, [-32, 52, 1.5], 7.5), 6);                                           // first dorsal interosseous (thumb web)
  return d;
}

function fingerSDF(p: V3, f: FingerDef): number {
  const j = f.joints, r = f.radii;
  const start = f.id === 1 ? 1 : 0;
  let d = Infinity;
  for (let s = start; s < 3; s++) {
    const a = j[s], b = s === 2 ? tipCenter(f) : j[s + 1];
    d = smin(d, roundCone(p, a, b, r[s] * (s > start ? 0.97 : 1), s === 2 ? r[3] : r[s + 1] * 0.97, f.flat), 4);
  }
  // dorsal knuckle bumps at the interphalangeal joints
  for (let s = Math.max(1, start + 1); s <= 2; s++) d = smin(d, sphere(p, [j[s][0], j[s][1], j[s][2] + r[s] * 0.3], r[s] * 0.62), 4.5);
  // finger pad (palmar side of the fingertip)
  const tc = tipCenter(f);
  d = smin(d, sphere(p, [tc[0], tc[1] - 2, tc[2] - r[3] * 0.35], r[3] * 0.82), 2);
  return d;
}
export function tipCenter(f: FingerDef): V3 {
  const a = f.joints[2], b = f.joints[3];
  const d = subv(b, a), l = lenv(d);
  return [b[0] - (d[0] / l) * f.radii[3], b[1] - (d[1] / l) * f.radii[3], b[2] - (d[2] / l) * f.radii[3]];
}

/** Signed distance of the whole hand + which part is closest (0 palm, 1..5 finger). */
export function handSDF(p: V3): { d: number; part: number } {
  const palm = palmSDF(p);
  let best = Infinity, part = 0, raw = palm;
  for (const f of FINGERS) {
    const fd = fingerSDF(p, f);
    // each finger is webbed to the palm, fingers are NOT melted into each other
    const joined = smin(palm, fd, f.id === 1 ? 7 : 4);
    if (joined < best) { best = joined; }
    if (fd < raw) { raw = fd; part = f.id; }
  }
  return { d: best, part };
}

// ---------- Surface Nets ----------
export interface RawMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array; parts: Uint8Array }

export function buildHandSurface(step = 2.2): RawMesh {
  const bmin: V3 = [-78, -62, -22], bmax: V3 = [56, 197, 22];
  const nx = Math.ceil((bmax[0] - bmin[0]) / step) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / step) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const y = bmin[1] + j * step;
    // open the forearm at the bottom of the box (the arm continues off-screen)
    field[at(i, j, k)] = j === 0 ? 1 : handSDF([bmin[0] + i * step, y, bmin[2] + k * step]).d;
  }
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(([a, b, c]) => field[at(i + a, j + b, k + c)]);
    let mask = 0;
    v.forEach((x, n) => { if (x < 0) mask |= 1 << n; });
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; cnt++;
    }
    cellVert[at(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / cnt) * step, bmin[1] + (j + sy / cnt) * step, bmin[2] + (k + sz / cnt) * step);
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = field[at(i, j, k)] < 0;
    if (s0 !== field[at(i + 1, j, k)] < 0) quad(cellVert[at(i, j - 1, k - 1)], cellVert[at(i, j, k - 1)], cellVert[at(i, j, k)], cellVert[at(i, j - 1, k)], !s0);
    if (s0 !== field[at(i, j + 1, k)] < 0) quad(cellVert[at(i - 1, j, k - 1)], cellVert[at(i - 1, j, k)], cellVert[at(i, j, k)], cellVert[at(i, j, k - 1)], !s0);
    if (s0 !== field[at(i, j, k + 1)] < 0) quad(cellVert[at(i - 1, j - 1, k)], cellVert[at(i, j - 1, k)], cellVert[at(i, j, k)], cellVert[at(i - 1, j, k)], !s0);
  }
  // drop vertices no face uses (cells along the open forearm cut)
  const used = new Int32Array(pos.length / 3).fill(-1);
  const kept: number[] = [];
  for (let t = 0; t < idx.length; t++) { const v = idx[t]; if (used[v] < 0) { used[v] = kept.length / 3; kept.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } idx[t] = used[v]; }
  pos.length = 0; pos.push(...kept);
  // relax + project back onto the true surface, then analytic normals from the SDF gradient
  const n = pos.length / 3;
  const P = Float32Array.from(pos), N = new Float32Array(n * 3), parts = new Uint8Array(n);
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].push(b); nb[b].push(a); }
  for (let it = 0; it < 2; it++) {
    const Q = Float32Array.from(P);
    for (let v = 0; v < n; v++) {
      if (!nb[v].length) continue;
      let ax = 0, ay = 0, az = 0;
      for (const w of nb[v]) { ax += P[w * 3]; ay += P[w * 3 + 1]; az += P[w * 3 + 2]; }
      const m = nb[v].length;
      Q[v * 3] = P[v * 3] * 0.5 + (ax / m) * 0.5; Q[v * 3 + 1] = P[v * 3 + 1] * 0.5 + (ay / m) * 0.5; Q[v * 3 + 2] = P[v * 3 + 2] * 0.5 + (az / m) * 0.5;
    }
    P.set(Q);
  }
  const e = 0.35;
  for (let v = 0; v < n; v++) {
    let p: V3 = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    for (let s = 0; s < 2; s++) {
      const g = grad(p, e);
      const d = handSDF(p).d;
      p = [p[0] - g[0] * d, p[1] - g[1] * d, p[2] - g[2] * d];
    }
    P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2];
    const g = grad(p, e);
    N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
    parts[v] = handSDF(p).part;
  }
  return { positions: P, normals: N, indices: Uint32Array.from(idx), parts };
}

export function grad(p: V3, e = 0.35): V3 {
  const f = (x: number, y: number, z: number) => handSDF([x, y, z]).d;
  const g: V3 = [f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)];
  const l = Math.hypot(...g) || 1;
  return [g[0] / l, g[1] / l, g[2] / l];
}

/** Move a point onto the hand surface (sphere tracing along the gradient). */
export function projectToSurface(p: V3): V3 {
  let q = p;
  for (let i = 0; i < 12; i++) {
    const d = handSDF(q).d;
    if (Math.abs(d) < 0.02) break;
    const g = grad(q);
    q = [q[0] - g[0] * d, q[1] - g[1] * d, q[2] - g[2] * d];
  }
  return q;
}

// ---------- skin weights ----------
/** Position along a finger chain from its first joint, and the chain segment lengths. */
function chainParam(p: V3, f: FingerDef): { u: number; L: number[] } {
  const pts: V3[] = [f.joints[0], f.joints[1], f.joints[2], f.joints[3]];
  const L = segLens(f);
  let best = Infinity, bu = 0, acc = 0;
  for (let s = 0; s < 3; s++) {
    const a = pts[s], b = pts[s + 1], ab = subv(b, a), l2 = dot(ab, ab);
    let t = dot(subv(p, a), ab) / l2;
    const tc = s === 0 ? Math.min(t, 1) : clamp(t, 0, 1); // allow negative u before the first joint
    const c: V3 = [a[0] + ab[0] * tc, a[1] + ab[1] * tc, a[2] + ab[2] * tc];
    const dist = lenv(subv(p, c));
    if (dist < best) { best = dist; bu = acc + (s === 0 ? Math.min(t, 1) : clamp(t, 0, 1)) * L[s]; }
    acc += L[s];
    t = 0;
  }
  return { u: bu, L };
}

/** Up to 4 (bone, weight) pairs for a point on the hand (bind pose). */
export function skinWeights(p: V3, part: number): [number[], number[]] {
  const w = new Map<number, number>();
  const add = (b: number, x: number) => { if (x > 1e-4) w.set(b, (w.get(b) ?? 0) + x); };
  // forearm / palm
  const forearm = smoothstep(14, -14, p[1]);
  if (part === 0) {
    add(0, forearm);
    let palm = 1 - forearm;
    // thenar region follows the thumb metacarpal
    const th = FINGERS[0];
    const { u } = chainParam(p, th);
    const dx = Math.hypot(p[0] - th.joints[0][0] - (th.joints[1][0] - th.joints[0][0]) * clamp(u / 38, 0, 1), p[1] - th.joints[0][1] - (th.joints[1][1] - th.joints[0][1]) * clamp(u / 38, 0, 1));
    const thenar = (1 - smoothstep(9, 19, dx)) * smoothstep(-6, 12, u) * 0.85 * palm;
    add(2, thenar);
    palm -= thenar;
    add(1, palm);
  } else {
    const f = FINGERS[part - 1];
    const { u, L } = chainParam(p, f);
    const b0 = chainStart(part);
    const s0 = f.id === 1 ? smoothstep(-6, 10, u) : smoothstep(-8, 4, u);
    const s1 = smoothstep(L[0] - 4.5, L[0] + 4.5, u);
    const s2 = smoothstep(L[0] + L[1] - 3.5, L[0] + L[1] + 3.5, u);
    add(f.id === 1 ? 1 : 1, (1 - s0) * (1 - forearm));
    add(0, (1 - s0) * forearm);
    add(b0, s0 * (1 - s1));
    add(b0 + 1, s1 * (1 - s2));
    add(b0 + 2, s2);
  }
  const top = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((a, [, x]) => a + x, 0) || 1;
  const idx = top.map(([b]) => b), ws = top.map(([, x]) => x / sum);
  while (idx.length < 4) { idx.push(0); ws.push(0); }
  return [idx, ws];
}

// ---------- nails ----------
export interface Nail { finger: number; grid: V3[][]; normal: V3[][] }
/** Curved nail plate lying on the dorsal fingertip surface (bind pose). */
export function buildNails(): Nail[] {
  return FINGERS.map((f) => {
    const tc = tipCenter(f);
    const a = f.joints[2], dir = subv(f.joints[3], a), l = lenv(dir);
    const u: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    const side: V3 = [u[1], -u[0], 0];
    const w = f.radii[3] * 1.22;
    const nu = 9, nv = 7;
    const grid: V3[][] = [], normal: V3[][] = [];
    for (let i = 0; i <= nv; i++) {
      const t = i / nv;
      const along = -f.nailLen + t * (f.nailLen - 0.6) + 0.2;
      const row: V3[] = [], nrow: V3[] = [];
      for (let k = 0; k <= nu; k++) {
        const v = (k / nu) * 2 - 1;
        const roundEnd = t > 0.75 ? Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2 * 0.35)) : 1;
        const widen = 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.4));
        const x = v * (w / 2) * widen * roundEnd;
        const top: V3 = [tc[0] + u[0] * along + side[0] * x, tc[1] + u[1] * along + side[1] * x, tc[2] + f.radii[3] + 6];
        const s = projectToSurface([top[0], top[1], tc[2] + f.radii[3] * 0.6]);
        const g = grad(s);
        row.push([s[0] + g[0] * 0.45, s[1] + g[1] * 0.45, s[2] + g[2] * 0.45]);
        nrow.push(g);
      }
      grid.push(row); normal.push(nrow);
    }
    return { finger: f.id, grid, normal };
  });
}
