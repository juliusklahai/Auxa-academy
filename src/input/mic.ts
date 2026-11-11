// Live microphone listener: AnalyserNode frames -> YIN -> OnsetTracker -> note events.
// Suppresses detections while the app itself is sounding notes (echo contamination guard).

import { audio } from '../audio/engine';
import { freqToNote } from '../core/music';
import { fixOctave, OnsetTracker, yin } from './pitch';
import { PolyTracker, type SoundProfile } from './poly';
import { getExpected } from './expect';

export interface MicFrame { freq: number; midi: number; cents: number; confidence: number; rms: number; suppressed: boolean }
export interface MicNote { midi: number; confidence: number; at: number /* performance.now() */; cents?: number }
/** All notes struck together at one onset (a chord is ONE event). */
export interface MicChord { notes: { midi: number; confidence: number }[]; at: number }

export interface MicSettings {
  noiseGate: number;
  minConfidence: number;
  latencyMs: number;  // subtracted from detection time
  mode: 'piano' | 'voice';
}

export class MicListener {
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private cap: { node: ScriptProcessorNode; chunks: Float32Array[]; startPerf: number | null; sink: GainNode } | null = null;
  private buf = new Float32Array(4096);
  private poly: PolyTracker | null = null;
  private timer = 0;
  tracker = new OnsetTracker();
  settings: MicSettings = { noiseGate: 0.002, minConfidence: 0.85, latencyMs: 60, mode: 'piano' };
  onFrame: ((f: MicFrame) => void) | null = null;
  /** additional frame subscribers (pitch roll, voice studio) */
  frameListeners = new Set<(f: MicFrame) => void>();
  /** Sing to score is listening: use the voice octave check even in piano mode */
  singing = false;
  private centsHist: number[] = [];
  onNote: ((n: MicNote) => void) | null = null;
  onChord: ((c: MicChord) => void) | null = null;
  sensitivity = 1;
  /** keyboard sound type for chord detection */
  profile: SoundProfile = 'piano';
  /** last start-up problem, shown on the Setup page */
  lastError = '';
  /** chosen input device (empty = system default) */
  deviceId = '';
  onUncertain: (() => void) | null = null;
  get active() { return !!this.stream; }
  /** the live microphone stream (for recording a take), null when off */
  get mediaStream(): MediaStream | null { return this.stream; }

  async start(): Promise<void> {
    if (this.stream) return;
    const ctx = audio.ensure();
    this.stream = await navigator.mediaDevices.getUserMedia({
      // all browser voice processing off: echo cancellation and noise suppression treat a held musical note
      // as noise and fade it out (and on phones switch the mic to a call mode). The app's own sounds are
      // removed by the echo gate instead.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}) },
    });
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    // echo gate: what the app played near this onset (as heard at the mic) is not the learner
    this.poly = new PolyTracker(ctx.sampleRate, getExpected, (t) => audio.appOnsetsNear(t + this.settings.latencyMs * 0, 130));
    src.connect(this.analyser);
    this.src = src;
    this.timer = window.setInterval(() => this.process(), 23);
  }

  /**
   * Record every sample from the microphone (not just the snapshots the live display reads every 23 ms),
   * so a take can be analysed again in full after singing. Returns false if capture is not possible.
   */
  startCapture(): boolean {
    const ctx = audio.ctx;
    if (!ctx || !this.src) return false;
    this.stopCapture();
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0;
    const cap = { node, chunks: [] as Float32Array[], startPerf: null as number | null, sink };
    node.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      if (cap.startPerf === null) {
        // when the first sample of this block was captured, on the performance.now() clock
        cap.startPerf = performance.now() - (d.length / ctx.sampleRate) * 1000 - ((ctx.baseLatency || 0) * 1000);
      }
      cap.chunks.push(new Float32Array(d));
    };
    this.src.connect(node); node.connect(sink); sink.connect(ctx.destination);
    this.cap = cap;
    return true;
  }

  /** Stop recording; the samples, their rate and when the first one was heard (performance.now ms). */
  stopCapture(): { samples: Float32Array; sampleRate: number; startPerf: number } | null {
    const cap = this.cap;
    if (!cap) return null;
    this.cap = null;
    try { this.src?.disconnect(cap.node); } catch { /* already gone */ }
    cap.node.disconnect(); cap.sink.disconnect(); cap.node.onaudioprocess = null;
    const n = cap.chunks.reduce((a, c) => a + c.length, 0);
    const samples = new Float32Array(n);
    let o = 0;
    for (const c of cap.chunks) { samples.set(c, o); o += c.length; }
    return { samples, sampleRate: audio.ctx?.sampleRate ?? 48000, startPerf: cap.startPerf ?? performance.now() };
  }

  stop() {
    this.stopCapture();
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.src = null;
    this.tracker.reset();
  }

  private process() {
    if (!this.analyser || !audio.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const now = performance.now();
    const suppressed = now < audio.appPlayingUntil;
    // Tuner / level meter (monophonic YIN on the latest 2048 samples)
    const [minF, maxF] = this.settings.mode === 'voice' ? [70, 1100] : [55, 2100];
    const est = yin(this.buf.subarray(2048), audio.ctx.sampleRate, minF, maxF);
    if (this.settings.mode === 'voice' || this.singing) est.freq = fixOctave(this.buf.subarray(2048), audio.ctx.sampleRate, est.freq, 70);
    const { midi, cents } = est.freq > 0 ? freqToNote(est.freq, audio.a4) : { midi: -1, cents: 0 };
    const frame = { freq: est.freq, midi, cents, confidence: est.confidence, rms: est.rms, suppressed };
    this.onFrame?.(frame);
    this.frameListeners.forEach((l) => l(frame));
    if (suppressed) { this.tracker.reset(); this.poly?.reset(); return; }

    if (this.settings.mode === 'voice') {
      // Singing: one note at a time with intonation
      this.tracker.noiseGate = this.settings.noiseGate;
      this.tracker.minConfidence = Math.min(this.settings.minConfidence, 0.82);
      this.tracker.stableFrames = 7; // ~160 ms: ignore the scoop into a sung note
      const before = this.tracker.uncertainFrames;
      if (est.confidence >= 0.8 && midi > 0) { this.centsHist.push(cents); if (this.centsHist.length > 7) this.centsHist.shift(); }
      const hit = this.tracker.push(midi, est.confidence, est.rms);
      if (this.tracker.uncertainFrames > before && est.rms > this.settings.noiseGate * 2) this.onUncertain?.();
      if (hit && audio.appSoundingAt(now).includes(hit.midi) && !(getExpected() ?? []).some((e) => (e - hit.midi) % 12 === 0)) {
        this.tracker.reset(); // that pitch is the accompaniment, not the singer
        return;
      }
      if (hit) {
        const c = [...this.centsHist].sort((a, b) => a - b)[this.centsHist.length >> 1] ?? 0;
        this.onNote?.({ midi: hit.midi, confidence: hit.confidence, at: now - this.settings.latencyMs - 7 * 23, cents: c });
      }
      return;
    }
    // Piano: polyphonic, chords and several notes at once
    if (!this.poly) return;
    // the piano listener adapts to the room by itself; this is only an absolute floor (soft playing counts)
    this.poly.noiseGate = Math.min(0.0015, Math.max(0.0003, this.settings.noiseGate * 0.3));
    this.poly.sensitivity = this.sensitivity;
    this.poly.profile = this.profile;
    const ev = this.poly.process(this.buf, now);
    if (!ev) return;
    const at = ev.onsetMs - this.settings.latencyMs;
    const notes = ev.notes.map((n) => ({ midi: n.midi, confidence: n.confidence }));
    this.onChord?.({ notes, at });
    if (notes.every((n) => n.confidence < this.settings.minConfidence)) this.onUncertain?.();
    // expected notes first, so a correct chord with one unclear extra is matched before the extra
    [...ev.notes].sort((a, b) => Number(b.expected) - Number(a.expected))
      .forEach((n) => this.onNote?.({ midi: n.midi, confidence: n.confidence, at }));
  }

  /** Measure ambient level for ~1.5 s and set the noise gate above it. */
  async calibrateNoise(): Promise<number> {
    await this.start();
    const samples: number[] = [];
    const prev = this.onFrame;
    this.onFrame = (f) => { samples.push(f.rms); prev?.(f); };
    await new Promise((r) => setTimeout(r, 1500));
    this.onFrame = prev;
    samples.sort((a, b) => a - b);
    const p90 = samples[Math.floor(samples.length * 0.9)] ?? 0.005;
    this.settings.noiseGate = Math.max(0.0015, p90 * 2);
    return this.settings.noiseGate;
  }
}

export const mic = new MicListener();

/** A plain-language explanation of why the microphone could not start, and how to fix it. */
export function micHelp(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  let inFrame = false;
  try { inFrame = window.self !== window.top; } catch { inFrame = true; }
  if (inFrame) return 'This copy is running inside a preview window that does not allow microphones. Download Maestro.html and open it in Chrome or Edge, or run "npm run preview" and open http://localhost:4173.';
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return 'This browser only allows the microphone on https or localhost pages. Run "npm run preview" and open http://localhost:4173, or open Maestro.html in Chrome or Edge.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The microphone was blocked. Click the lock (or settings) icon at the left of the address bar, set Microphone to "Allow", then reload the page. On Windows also check Settings > Privacy > Microphone; on Mac, System Settings > Privacy & Security > Microphone (allow your browser).';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Plug one in, or in Setup choose "System default" under "Microphone to use".';
  if (name === 'NotReadableError') return 'The microphone is busy in another app (Zoom, Teams, WhatsApp...). Close that app, then try again.';
  return `The microphone could not start (${(e as Error)?.message ?? 'unknown error'}).`;
}
