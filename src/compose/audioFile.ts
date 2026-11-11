// Sing to score from a recording: run the same pitch reader over an audio file (mp3, m4a, wav...)
// that the microphone uses live, then hand the readings to transcribe().
import { fixOctave, yin } from '../input/pitch';
import type { PitchFrame } from './transcribe';

/** Pitch readings every ~23 ms from mono samples. a4 = tuning reference. */
/** Down to ~16 kHz for speed (a voice needs nothing above ~2 kHz for pitch): low-pass, then resample. */
export function downsample(x: Float32Array, sr: number, target = 16000): { x: Float32Array; sr: number } {
  if (sr <= target * 1.25) return { x, sr };
  const ratio = sr / target, w = Math.max(2, Math.round(ratio));
  // moving average as a simple low-pass
  const lp = new Float32Array(x.length);
  let acc = 0;
  for (let i = 0; i < x.length; i++) { acc += x[i]; if (i >= w) acc -= x[i - w]; lp[i] = acc / Math.min(i + 1, w); }
  const n = Math.floor(x.length / ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * ratio + (w - 1) / 2, k = Math.floor(p), f = p - k; y[i] = (lp[Math.min(k, lp.length - 1)] ?? 0) * (1 - f) + (lp[Math.min(k + 1, lp.length - 1)] ?? 0) * f; }
  return { x: y, sr: sr / ratio };
}

export function framesFromSamples(input: Float32Array, inputRate: number, a4 = 440): PitchFrame[] {
  const { x, sr: sampleRate } = downsample(input, inputRate);
  const hop = Math.round(sampleRate * 0.01), win = Math.round(sampleRate * 0.0427) & ~1;
  // level of the whole file, so quiet recordings work as well as loud ones
  let peak = 0;
  for (let i = 0; i < x.length; i += 16) peak = Math.max(peak, Math.abs(x[i]));
  const floor = Math.max(0.0004, peak * 0.01);
  const out: PitchFrame[] = [];
  for (let i = win; i <= x.length; i += hop) {
    const w = x.subarray(i - win, i);
    const e = yin(w, sampleRate, 70, 1100);
    if (e.freq > 0) e.freq = fixOctave(w, sampleRate, e.freq);
    const clear = e.freq > 0 && e.confidence >= 0.75 && e.rms > floor;
    const soft = !clear && e.freq > 0 && e.confidence >= 0.5 && e.rms > floor ? 69 + 12 * Math.log2(e.freq / a4) : null;
    out.push({ t: (i / sampleRate) * 1000, midi: clear ? 69 + 12 * Math.log2(e.freq / a4) : null, rms: e.rms, soft });
  }
  return out;
}

/** Decode an audio file in the browser and read its pitch. */
export async function framesFromFile(file: Blob, ctx: BaseAudioContext, a4 = 440): Promise<PitchFrame[]> {
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const n = buf.length, mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  // yield to the page between chunks would be nicer; a minute of audio takes well under a second
  return framesFromSamples(mono, buf.sampleRate, a4);
}
