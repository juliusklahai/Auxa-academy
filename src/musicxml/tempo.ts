// Tempo timeline: converts score positions (quarter notes) to milliseconds and back,
// following every tempo change, scaled by the practice tempo percentage.

export interface TempoPoint { q: number; bpm: number }

export class Timeline {
  private pts: { q: number; ms: number; mspq: number }[] = [];
  constructor(map: TempoPoint[], public q0 = 0, pct = 100, follow = true) {
    const m = follow && map.length ? map : [{ q: 0, bpm: map[0]?.bpm ?? 90 }];
    const k = 100 / Math.max(20, Math.min(150, pct));
    // tempo in force at q0
    let cur = m[0].bpm;
    for (const p of m) if (p.q <= q0 + 1e-9) cur = p.bpm;
    this.pts.push({ q: q0, ms: 0, mspq: (60000 / cur) * k });
    for (const p of m) {
      if (p.q <= q0 + 1e-9) continue;
      const last = this.pts[this.pts.length - 1];
      this.pts.push({ q: p.q, ms: last.ms + (p.q - last.q) * last.mspq, mspq: (60000 / p.bpm) * k });
    }
  }
  /** ms after the start (q0) at which score position q sounds */
  msAt(q: number): number {
    let i = this.pts.length - 1;
    while (i > 0 && this.pts[i].q > q) i--;
    const p = this.pts[i];
    return p.ms + (q - p.q) * p.mspq;
  }
  /** score position sounding at ms after the start */
  qAt(ms: number): number {
    let i = this.pts.length - 1;
    while (i > 0 && this.pts[i].ms > ms) i--;
    const p = this.pts[i];
    return p.q + (ms - p.ms) / p.mspq;
  }
  /** ms per quarter at q */
  mspqAt(q: number): number {
    let i = this.pts.length - 1;
    while (i > 0 && this.pts[i].q > q) i--;
    return this.pts[i].mspq;
  }
  bpmAt(q: number): number { return 60000 / this.mspqAt(q); }
}
