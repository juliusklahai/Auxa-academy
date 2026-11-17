// The detectors the piano benchmark can run. 'live' feeds the app's piano analyzer the same way the
// microphone does (src/input/pianoListen.ts), so the benchmark measures exactly what ships.
import { PianoListener } from '../src/input/pianoListen';
import { PolyTracker } from '../src/input/poly';
import { judgeOnset } from '../src/input/micPolicy';
import type { Det } from './pianoBench';

export interface Analyzer { reset(expectedAt?: (ms: number) => number[] | null): void; feed(x: Float32Array): Det[] }

/** The detector as it was before this work: the newest 4096 samples, every 23 ms (setInterval). */
function legacy(sr: number): Analyzer {
  let exp: ((ms: number) => number[] | null) | undefined;
  let now = 0;
  const tr = new PolyTracker(sr, () => exp?.(now) ?? null);
  return {
    reset(e) { exp = e; tr.reset(); },
    feed(x) {
      const out: Det[] = [];
      const hop = Math.round(0.023 * sr), W = 4096;
      for (let end = W; end <= x.length; end += hop) {
        now = (end / sr) * 1000;
        const ev = tr.process(x.subarray(end - W, end), now);
        if (ev) for (const n of ev.notes) out.push({ midi: n.midi, confidence: n.confidence, at: ev.onsetMs });
      }
      return out;
    },
  };
}

/** The shipped listener: every sample, fixed hop on the sample clock (as in the audio worker). */
function live(sr: number, window?: number): Analyzer {
  let exp: ((ms: number) => number[] | null) | undefined;
  let L = new PianoListener(sr, { window });
  return {
    reset(e) { exp = e; L = new PianoListener(sr, { window }); L.getExpected = (ms) => exp?.(ms) ?? null; },
    feed(x) {
      const out: Det[] = [];
      for (let i = 0; i < x.length; i += 128) {
        for (const ev of L.push(x.subarray(i, i + 128))) {
          // the same rule the app applies before assessment (src/input/micPolicy.ts)
          for (const n of judgeOnset(ev.notes, exp?.(ev.onsetMs) ?? null, 0.85)) out.push({ midi: n.midi, confidence: n.unsure ? Math.min(n.confidence, 0.6) : Math.max(n.confidence, 0.85), at: ev.onsetMs });
        }
      }
      return out;
    },
  };
}

export function analyzerFor(name: string, sr: number): Analyzer {
  return name === 'legacy' ? legacy(sr) : name === 'w4096' ? live(sr, 4096) : live(sr);
}
