// Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002) plus an onset tracker.
// Pure functions: tested in tests/pitch.test.ts on synthesized signals.
// LIMITATION: monophonic. It reports ONE fundamental; it cannot transcribe chords.

export interface PitchEstimate {
  freq: number;       // Hz, 0 if none
  confidence: number; // 0..1 (1 - aperiodicity)
  rms: number;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function yin(buf: Float32Array, sampleRate: number, minFreq = 50, maxFreq = 2000, threshold = 0.15): PitchEstimate {
  const level = rms(buf);
  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const W = buf.length - maxTau;
  if (W <= 0) return { freq: 0, confidence: 0, rms: level };
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // cumulative mean normalized difference
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  let tauEst = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) {
    // no dip under threshold: take global minimum but report low confidence
    let best = minTau;
    for (let tau = minTau; tau <= maxTau; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    tauEst = best;
  }
  // parabolic interpolation
  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < maxTau) {
    const s0 = cmnd[tauEst - 1], s1 = cmnd[tauEst], s2 = cmnd[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }
  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEst]));
  return { freq: sampleRate / betterTau, confidence, rms: level };
}

/**
 * Turns a stream of frame estimates into discrete note-on events.
 * - Requires `stableFrames` consecutive confident frames on the same MIDI note (debounce).
 * - Emits a note only once per sustained tone (prevents duplicate detections).
 * - Re-arms on silence, on a pitch change, or on a fresh attack (RMS jump) for repeated notes.
 * - Frames below `minConfidence` are reported as "uncertain", never as notes.
 */
export class OnsetTracker {
  private candidate = -1;
  private count = 0;
  private emitted = -1;
  private lastRms = 0;
  uncertainFrames = 0;
  constructor(
    public noiseGate = 0.01,
    public minConfidence = 0.85,
    public stableFrames = 3,
    public attackRatio = 1.8
  ) {}

  /** midi = nearest note for this frame (or -1). Returns emitted MIDI note or null. */
  push(midi: number, confidence: number, level: number): { midi: number; confidence: number } | null {
    const attack = level > this.noiseGate && level > this.lastRms * this.attackRatio && this.lastRms < this.noiseGate * 3;
    this.lastRms = level;
    if (level < this.noiseGate) {
      this.candidate = -1; this.count = 0; this.emitted = -1;
      return null;
    }
    if (confidence < this.minConfidence || midi < 0) {
      this.uncertainFrames++;
      this.count = 0;
      return null;
    }
    if (attack) this.emitted = -1; // repeated note re-articulated
    if (midi === this.candidate) this.count++;
    else { this.candidate = midi; this.count = 1; }
    if (this.count >= this.stableFrames && midi !== this.emitted) {
      this.emitted = midi;
      return { midi, confidence };
    }
    return null;
  }

  reset() { this.candidate = -1; this.count = 0; this.emitted = -1; this.lastRms = 0; this.uncertainFrames = 0; }
}

/** Amplitude of one frequency in a Hann-windowed buffer (a single DFT bin). */
function toneAmp(buf: Float32Array, sampleRate: number, f: number): number {
  const n = buf.length, w = 2 * Math.PI * f / sampleRate;
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
  }
  return Math.hypot(re, im) / n;
}

/**
 * Octave check for voices. A soft vowel can have a fundamental much weaker than its second harmonic, and
 * then the period finder reports the note an octave too high. If there is real energy at half the found
 * frequency (and at one and a half times it), those are the voice's 1st and 3rd harmonics: the true note
 * is an octave lower.
 */
export function fixOctave(buf: Float32Array, sampleRate: number, freq: number, minFreq = 70): number {
  if (!(freq > 0) || freq / 2 < minFreq) return freq;
  const main = Math.hypot(toneAmp(buf, sampleRate, freq), toneAmp(buf, sampleRate, freq * 2));
  if (main <= 0) return freq;
  const sub = Math.hypot(toneAmp(buf, sampleRate, freq / 2), toneAmp(buf, sampleRate, freq * 1.5));
  return sub / main > 0.14 ? freq / 2 : freq;
}
