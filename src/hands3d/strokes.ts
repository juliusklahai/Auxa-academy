// AnatomicalStrokes (build time): drawing lines that live ON the hand surface — knuckle and joint
// creases, nail outlines and cuticles, extensor tendons, the thumb web, wrist folds and the main palm
// creases. Every stroke point is projected onto the bind-pose surface and gets the same skin weights as
// the mesh under it, so the strokes deform with the fingers instead of floating over them.

import { FINGERS, type V3 } from './anatomy';
import { buildNails, grad, handSDF, projectToSurface, skinWeights } from './geometry';

export interface Stroke { pts: V3[]; strength: number; width: number } // strength 0..1 (opacity), width multiplier

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const Z: V3 = [0, 0, 1];

/** Arc across a finger at a joint, on the dorsal side (a = angle around the finger axis). */
function jointArc(c: V3, u: V3, r: number, spread: number, along: number, bow: number, n = 9): V3[] {
  const side: V3 = nrm([u[1], -u[0], 0]);
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = -spread + (2 * spread * i) / (n - 1);
    const p = add(add(add(c, scl(side, Math.sin(a) * r * 1.6)), scl(Z, Math.cos(a) * r * 1.6)), scl(u, along + bow * a * a));
    pts.push(projectToSurface(p));
  }
  return pts;
}

function lineOnSurface(a: V3, b: V3, lift: number, n = 14, bulge: V3 = [0, 0, 0]): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = add(add(add(a, scl(sub(b, a), t)), scl(Z, lift)), scl(bulge, Math.sin(Math.PI * t)));
    pts.push(projectToSurface(p));
  }
  return pts;
}

export function buildStrokes(): Stroke[] {
  const S: Stroke[] = [];
  for (const f of FINGERS) {
    const j = f.joints, r = f.radii;
    const u0 = nrm(sub(j[1], j[0])), u1 = nrm(sub(j[2], j[1])), u2 = nrm(sub(j[3], j[2]));
    if (f.id === 1) {
      // thumb: IP joint creases and the MCP knuckle
      S.push({ pts: jointArc(j[2], u1, r[2], 0.75, -0.6, 1.4), strength: 0.75, width: 1 });
      S.push({ pts: jointArc(j[2], u1, r[2], 0.55, 1.6, 1.0), strength: 0.45, width: 0.8 });
      S.push({ pts: jointArc(j[1], u0, r[1], 0.7, -1, 2.2), strength: 0.55, width: 0.9 });
      continue;
    }
    // DIP: one crease; PIP: a pair of wrinkles; MCP: knuckle curve
    S.push({ pts: jointArc(j[2], u1, r[2], 0.75, -0.3, 1.2), strength: 0.8, width: 1 });
    S.push({ pts: jointArc(j[1], u0, r[1], 0.8, -1.4, 1.8), strength: 0.75, width: 1 });
    S.push({ pts: jointArc(j[1], u0, r[1], 0.6, 1.2, 1.4), strength: 0.5, width: 0.8 });
    S.push({ pts: jointArc([j[0][0], j[0][1] - 3, j[0][2] + 2], u0, r[0], 0.9, 0, -2.6), strength: 0.5, width: 0.9 });
    // extensor tendon fading toward the wrist
    S.push({ pts: lineOnSurface([j[0][0] * 0.98, j[0][1] - 10, 8], [j[0][0] * 0.35, 14, 8], 6), strength: 0.22, width: 0.8 });
    void u2;
  }
  // nails: outline + cuticle
  for (const nail of buildNails()) {
    const g = nail.grid, R = g.length - 1, C = g[0].length - 1;
    const loop: V3[] = [];
    for (let k = 0; k <= C; k++) loop.push(g[R][k]);
    for (let i = R - 1; i >= 0; i--) loop.push(g[i][C]);
    for (let k = C - 1; k >= 0; k--) loop.push(g[0][k]);
    for (let i = 1; i <= R; i++) loop.push(g[i][0]);
    S.push({ pts: loop, strength: 0.85, width: 0.9 });
    const cut = g[0].map((p, k) => { const n = nail.normal[0][k]; return projectToSurface(add(add(p, scl(n, 1.5)), scl(nrm(sub(g[0][k], g[1][k])), 1.6))); });
    S.push({ pts: cut, strength: 0.4, width: 0.7 });
  }
  // wrist folds (dorsal) and the head of the ulna
  for (const [y, s] of [[-6, 0.4], [-13, 0.28]] as [number, number][]) S.push({ pts: lineOnSurface([-20, y, 10], [22, y + 2, 10], 6, 14, [0, 1.5, 0]), strength: s, width: 0.85 });
  // palmar creases (seen when the hand turns, hidden from straight above by the depth pre-pass)
  S.push({ pts: lineOnSurface([30, 72, -14], [-14, 80, -14], -6, 14, [0, 4, 0]), strength: 0.55, width: 1 });  // heart line
  S.push({ pts: lineOnSurface([-30, 70, -14], [22, 56, -14], -6, 14, [0, -3, 0]), strength: 0.55, width: 1 }); // head line
  S.push({ pts: lineOnSurface([-28, 66, -14], [-12, 14, -14], -6, 14, [7, 0, 0]), strength: 0.55, width: 1 });  // life line
  return S.filter((s) => s.pts.every((p) => Number.isFinite(p[0]) && Math.abs(handSDF(p).d) < 0.6));
}

/** Ribbon geometry for the strokes, with per-vertex skinning. */
export interface StrokeMesh { positions: number[]; normals: number[]; sides: number[]; offs: number[]; alpha: number[]; skinIdx: number[]; skinW: number[]; indices: number[] }

export function strokeRibbons(strokes: Stroke[]): StrokeMesh {
  const m: StrokeMesh = { positions: [], normals: [], sides: [], offs: [], alpha: [], skinIdx: [], skinW: [], indices: [] };
  for (const s of strokes) {
    const n = s.pts.length;
    const base = m.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const p = s.pts[i];
      const nn = grad(p);
      const t = nrm(sub(s.pts[Math.min(n - 1, i + 1)], s.pts[Math.max(0, i - 1)]));
      const side = nrm([nn[1] * t[2] - nn[2] * t[1], nn[2] * t[0] - nn[0] * t[2], nn[0] * t[1] - nn[1] * t[0]]);
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0.12, (i + 0.5) / n))) ** 0.6;
      const part = handSDF(p).part;
      const [si, sw] = skinWeights(p, part);
      for (const v of [-1, 1]) {
        m.positions.push(p[0] + nn[0] * 0.35, p[1] + nn[1] * 0.35, p[2] + nn[2] * 0.35);
        m.normals.push(...nn);
        m.sides.push(...side);
        m.offs.push(v * taper * s.width);
        m.alpha.push(s.strength);
        m.skinIdx.push(...si);
        m.skinW.push(...sw);
      }
      if (i < n - 1) { const a = base + i * 2; m.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  return m;
}
