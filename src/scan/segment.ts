// Page picture -> clean, straight, right-sized grey image -> the lines of music (systems) on it.
// Pure functions on 8-bit grey pixels so they run in a worker and in tests.

export interface Gray { w: number; h: number; px: Uint8Array }
export interface Staff { top: number; bottom: number; gap: number }
export interface System { top: number; bottom: number; staves: Staff[]; bars: number; barXs: number[]; left: number; right: number }

export const TARGET_GAP = 18; // the reader was trained on pages where staff lines are 18 px apart

/** Even out shadows and uneven light: divide by a smooth estimate of the paper's brightness. */
export function flatten(g: Gray): Gray {
  const T = 32, gw = Math.ceil(g.w / T), gh = Math.ceil(g.h / T);
  const bg = new Float32Array(gw * gh);
  for (let ty = 0; ty < gh; ty++) for (let tx = 0; tx < gw; tx++) {
    // the brightest pixels in the tile are paper; take a high percentile, not the max (dust, glare)
    const hist = new Uint32Array(256); let n = 0;
    for (let y = ty * T; y < Math.min(g.h, ty * T + T); y += 2) for (let x = tx * T; x < Math.min(g.w, tx * T + T); x += 2) { hist[g.px[y * g.w + x]]++; n++; }
    let c = 0, v = 255; const want = n * 0.1;
    for (let k = 255; k >= 0; k--) { c += hist[k]; if (c >= want) { v = k; break; } }
    bg[ty * gw + tx] = Math.max(v, 40);
  }
  // smooth the grid so tiles full of notes borrow from their neighbours
  const sm = new Float32Array(bg.length);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) best = Math.max(best, bg[yy * gw + xx]); }
    sm[y * gw + x] = best;
  }
  const out = new Uint8Array(g.px.length);
  for (let y = 0; y < g.h; y++) {
    const fy = Math.min(gh - 1.001, Math.max(0, y / T - 0.5)), y0 = Math.floor(fy), ay = fy - y0;
    for (let x = 0; x < g.w; x++) {
      const fx = Math.min(gw - 1.001, Math.max(0, x / T - 0.5)), x0 = Math.floor(fx), ax = fx - x0;
      const i = y0 * gw + x0;
      const b = (sm[i] * (1 - ax) + sm[i + 1 < sm.length ? i + 1 : i] * ax) * (1 - ay) + (sm[Math.min(sm.length - 1, i + gw)] * (1 - ax) + sm[Math.min(sm.length - 1, i + gw + 1)] * ax) * ay;
      out[y * g.w + x] = Math.min(255, Math.round((g.px[y * g.w + x] * 255) / b));
    }
  }
  return { w: g.w, h: g.h, px: out };
}

/** Small rotation of a photo, in degrees, found where staff lines make the sharpest horizontal stripes. */
export function skewAngle(g: Gray): number {
  // sample points along long horizontal dark runs: those are staff lines (and beams); notes are ignored
  const pts: number[] = [];
  for (let y = 0; y < g.h; y += 2) {
    let run = 0;
    for (let x = 0; x <= g.w; x++) {
      if (x < g.w && g.px[y * g.w + x] < 150) { run++; continue; }
      if (run >= 40) for (let k = x - run; k < x; k += 10) pts.push(k, y);
      run = 0;
    }
  }
  if (pts.length < 400) return 0;
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180), off = g.w * 0.08, hist = new Float32Array(g.h + Math.ceil(off * 2) + 4);
    for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i + 1] - (pts[i] - g.w / 2) * t + off); if (yy >= 0 && yy < hist.length) hist[yy]++; }
    let s = 0; for (const v of hist) s += v * v; return s;
  };
  let best = 0, bs = score(0);
  const flat = bs;
  for (let a = -4; a <= 4.001; a += 0.1) { const s = score(a); if (s > bs) { bs = s; best = a; } }
  const c = best;
  for (let a = c - 0.1; a <= c + 0.1; a += 0.02) { const s = score(a); if (s > bs) { bs = s; best = a; } }
  return Math.abs(best) < 0.12 || bs < flat * 1.03 ? 0 : best;
}

/** Rotate and/or scale with bilinear sampling, filling with white. */
export function transform(g: Gray, deg: number, scale: number): Gray {
  if (Math.abs(deg) < 0.05 && Math.abs(scale - 1) < 0.01) return g;
  const w = Math.round(g.w * scale), h = Math.round(g.h * scale), out = new Uint8Array(w * h);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), cx = g.w / 2, cy = g.h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ux = x / scale - cx, uy = y / scale - cy;
    const sx = c * ux - s * uy + cx, sy = s * ux + c * uy + cy;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) { out[y * w + x] = 255; continue; }
    const ax = sx - x0, ay = sy - y0, i = y0 * g.w + x0;
    out[y * w + x] = Math.round((g.px[i] * (1 - ax) + g.px[i + 1] * ax) * (1 - ay) + (g.px[i + g.w] * (1 - ax) + g.px[i + g.w + 1] * ax) * ay);
  }
  return { w, h, px: out };
}

/** Five evenly spaced long dark rows make a staff. */
export function findStaves(g: Gray): Staff[] {
  const rows: number[] = [];
  let maxRow = 0;
  const frac = new Float32Array(g.h);
  for (let y = 0; y < g.h; y++) { let n = 0; for (let x = 0; x < g.w; x++) if (g.px[y * g.w + x] < 160) n++; frac[y] = n / g.w; maxRow = Math.max(maxRow, frac[y]); }
  const thr = Math.max(0.25, maxRow * 0.55);
  for (let y = 0; y < g.h; y++) if (frac[y] > thr) rows.push(y);
  const lines: number[][] = [];
  for (const r of rows) { const l = lines[lines.length - 1]; if (l && r - l[l.length - 1] <= 1) l.push(r); else lines.push([r]); }
  const ys = lines.map((l) => l.reduce((a, b) => a + b, 0) / l.length);
  const st: Staff[] = [];
  let i = 0;
  while (i + 4 < ys.length) {
    const d = [1, 2, 3, 4].map((k) => ys[i + k] - ys[i + k - 1]);
    const mn = Math.min(...d), mx = Math.max(...d);
    if (mn > 4 && mx < 1.5 * mn + 2) { st.push({ top: ys[i], bottom: ys[i + 4], gap: d.reduce((a, b) => a + b, 0) / 4 }); i += 5; } else i++;
  }
  return st;
}

/** Group staves into systems (staves joined by barlines), crop margins and count the bars in each. */
export function findSystems(g: Gray, staves = findStaves(g)): System[] {
  const dark = (x: number, y: number) => g.px[y * g.w + x] < 160;
  const colRun = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y <= y1; y++) if (dark(x, y)) n++; return n / Math.max(1, y1 - y0 + 1); };
  const groups: Staff[][] = [];
  for (const s of staves) {
    const p = groups.length ? groups[groups.length - 1][groups[groups.length - 1].length - 1] : null;
    if (p) {
      const y0 = Math.ceil(p.bottom) + 2, y1 = Math.floor(s.top) - 2;
      let joined = 0;
      if (y1 > y0) for (let x = 0; x < g.w; x++) if (colRun(x, y0, y1) > 0.97) joined++;
      if (joined >= 2) { groups[groups.length - 1].push(s); continue; }
    }
    groups.push([s]);
  }
  return groups.map((gr, k) => {
    const gap = gr[0].gap;
    let top = Math.round(gr[0].top - gap * 5), bottom = Math.round(gr[gr.length - 1].bottom + gap * 5);
    if (k > 0) top = Math.max(top, Math.round((groups[k - 1][groups[k - 1].length - 1].bottom + gr[0].top) / 2));
    if (k + 1 < groups.length) bottom = Math.min(bottom, Math.round((gr[gr.length - 1].bottom + groups[k + 1][0].top) / 2));
    top = Math.max(0, top); bottom = Math.min(g.h, bottom);
    // where the staff lines start and end
    const ly = Math.round(gr[0].top);
    let left = 0, right = g.w - 1;
    while (left < g.w && !dark(left, ly)) left++;
    while (right > 0 && !dark(right, ly)) right--;
    // barlines: thin dark columns running from the top line of the first staff to the bottom line of the last
    const y0 = Math.round(gr[0].top), y1 = Math.round(gr[gr.length - 1].bottom);
    const cols: number[] = [];
    for (let x = left; x <= right; x++) if (colRun(x, y0, y1) > 0.92) cols.push(x);
    const clusters: number[][] = [];
    for (const x of cols) { const c = clusters[clusters.length - 1]; if (c && x - c[c.length - 1] <= gap * 0.8) c.push(x); else clusters.push([x]); }
    const lines = clusters.filter((c) => c[c.length - 1] - c[0] < gap * 1.2 && c[0] > left + gap * 1.5);
    return { top, bottom, staves: gr, bars: lines.length, barXs: lines.map((c) => (c[0] + c[c.length - 1]) / 2), left, right };
  });
}

/** Cut out one system, trimmed to the staff width plus a margin. */
export function cropX(s: Pick<System, 'left' | 'right'>, gap: number, w: number) { return [Math.max(0, Math.round(s.left - gap * 2)), Math.min(w, Math.round(s.right + gap * 2))]; }
export function crop(g: Gray, s: Pick<System, 'top' | 'bottom' | 'left' | 'right' | 'staves'>): Gray {
  const gap = s.staves[0]?.gap ?? TARGET_GAP;
  const [x0, x1] = cropX(s, gap, g.w);
  const w = x1 - x0, h = s.bottom - s.top, px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) px.set(g.px.subarray((s.top + y) * g.w + x0, (s.top + y) * g.w + x1), y * w);
  return { w, h, px };
}

/** The whole clean-up: light, straighten, scale so staff lines sit 18 px apart. */
export function prepare(input: Gray): { page: Gray; systems: System[]; angle: number; scale: number } {
  let g = flatten(input);
  const angle = skewAngle(g);
  g = transform(g, angle, 1);
  let st = findStaves(g);
  let scale = 1;
  if (st.length) {
    const gaps = st.map((s) => s.gap).sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1];
    scale = TARGET_GAP / med;
    if (Math.abs(scale - 1) > 0.04) { g = transform(g, 0, scale); st = findStaves(g); } else scale = 1;
  }
  return { page: g, systems: st.length ? findSystems(g, st) : [], angle, scale };
}
