// The piano listener: every microphone sample goes in (from an AudioWorklet, in a worker), and the
// polyphonic detector runs on a fixed hop of the SAMPLE clock, never skipping a frame because the screen
// was busy. Pure TypeScript: the same code runs in the audio worker, in tests and in the benchmark.
import { PolyTracker, type PolyEvent, type SoundProfile } from './poly';

export class PianoListener {
  /** analysis hop in samples (~21 ms at 48 kHz) */
  readonly hop: number;
  /** samples the detector sees each hop */
  readonly window: number;
  private ring: Float32Array;
  private filled = 0;
  private sinceHop = 0;
  /** total samples received (the sample clock) */
  private clock = 0;
  readonly tracker: PolyTracker;
  /** current target notes at a time (ms on this listener's clock) */
  getExpected: (ms: number) => number[] | null = () => null;
  /** notes the app itself started near a time (echo gate) */
  getMasked: (ms: number) => number[] = () => [];
  private nowMs = 0;

  constructor(public sampleRate: number, opts: { window?: number; hopMs?: number } = {}) {
    this.window = opts.window ?? 4096;
    this.hop = Math.round(((opts.hopMs ?? 23) / 1000) * sampleRate);
    this.ring = new Float32Array(this.window);
    this.tracker = new PolyTracker(sampleRate, () => this.getExpected(this.nowMs), (t) => this.getMasked(t));
    // the improved detector: every key A0-C8, per-band noise floors, real string stretch, fast-note and
    // repeated-note handling (see tests/pianoBench and scripts/pianoBench.ts for the numbers)
    this.tracker.whiten = true;
    this.tracker.lo = 21;
    this.tracker.hi = 108;
  }

  set sensitivity(v: number) { this.tracker.sensitivity = v; }
  set profile(p: SoundProfile) { this.tracker.profile = p; }
  set noiseGate(v: number) { this.tracker.noiseGate = v; }

  /** ms on the sample clock for a sample index */
  msAt(sample: number) { return (sample / this.sampleRate) * 1000; }

  /** Feed samples; returns any note events that became ready. */
  push(x: Float32Array): PolyEvent[] {
    const out: PolyEvent[] = [];
    let i = 0;
    while (i < x.length) {
      const n = Math.min(x.length - i, this.hop - this.sinceHop);
      // shift the ring left and append (windows are small, a copy is cheap)
      if (n >= this.window) this.ring.set(x.subarray(i + n - this.window, i + n));
      else { this.ring.copyWithin(0, n); this.ring.set(x.subarray(i, i + n), this.window - n); }
      this.filled = Math.min(this.window, this.filled + n);
      this.sinceHop += n; this.clock += n; i += n;
      if (this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        if (this.filled < this.window) continue;
        this.nowMs = this.msAt(this.clock);
        const ev = this.tracker.process(this.ring, this.nowMs);
        if (ev) out.push(ev);
      }
    }
    return out;
  }
}
