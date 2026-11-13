// Audio playback: piano notes + metronome, scheduled on the AudioContext clock.
//
// Why pre-rendered buffers: building every note from ~12 live audio nodes (oscillators, gains,
// filters) overloads the audio thread when a four-part score plays, which is heard as crackling
// that comes and goes. Each piano note is now synthesized ONCE into an AudioBuffer (additive
// partials with inharmonicity, per-partial decay and a soft hammer) and replayed with a single
// AudioBufferSourceNode + one gain. That is ~10x cheaper, so playback stays clean.
// Tempo changes never alter pitch: notes are rendered at their own frequency.

import { midiToFreq } from '../core/music';

type Listener = (midi: number, on: boolean) => void;
interface Voice { src: AudioBufferSourceNode; gain: GainNode; startMs: number; endMs: number; midi: number }

export type Instrument = 'piano' | 'violin' | 'viola' | 'cello' | 'flute' | 'strings' | 'bass' | 'choir';
export const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' }, { id: 'violin', label: 'Violin' }, { id: 'viola', label: 'Viola' }, { id: 'cello', label: 'Cello' },
  { id: 'flute', label: 'Flute' }, { id: 'strings', label: 'Strings' }, { id: 'bass', label: 'Bass' }, { id: 'choir', label: 'Choir "aah"' },
];
export type Drum = 'kick' | 'snare' | 'hat';

/** One app-played note, in performance.now() ms at the speakers (for the microphone echo gate). */
export interface AppNote { midi: number; onMs: number; offMs: number }

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private buffers = new Map<number, AudioBuffer>();
  private tap: AnalyserNode | null = null;
  /** Output peak level right now (diagnostics: 1.0 = clipping). */
  peak(): number {
    if (!this.tap) return 0;
    const b = new Float32Array(this.tap.fftSize);
    this.tap.getFloatTimeDomainData(b);
    let p = 0; for (const v of b) p = Math.max(p, Math.abs(v));
    return p;
  }
  /** Number of notes currently scheduled or sounding (diagnostics). */
  get voices(): number { return this.scheduled.size + this.active.size + this.synthNodes.size; }
  private active = new Map<number, Voice>();
  private scheduled = new Set<Voice>();
  private timers: number[] = [];
  /** Notes the APP is sounding. Used to suppress mic self-detection (echo contamination). */
  appPlayingUntil = 0;
  /** Recent and upcoming app notes (echo gate for the microphone). */
  appNotes: AppNote[] = [];
  a4 = 440;
  volume = 0.8;
  metronomeVolume = 0.6;
  latencyMode: 'smooth' | 'low' = 'smooth';
  onAppNote: Listener | null = null;

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      // 'balanced' gives the audio thread a safer buffer (fewer dropouts on phones and busy PCs)
      this.ctx = new Ctx({ latencyHint: this.latencyMode === 'low' ? 'interactive' : 'balanced' });
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.2;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.75;
      this.master.connect(this.limiter).connect(this.ctx.destination);
      this.tap = this.ctx.createAnalyser();
      this.tap.fftSize = 2048;
      this.limiter.connect(this.tap);
      this.buffers.clear();
      this.waves.clear();
      this.drumBufs.clear();
      this.warm(48, 84);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Recreate the audio context with another latency mode (Setup). */
  async setLatencyMode(mode: 'smooth' | 'low') {
    if (mode === this.latencyMode) return;
    this.latencyMode = mode;
    if (this.ctx) { this.stopAll(); const old = this.ctx; this.ctx = null; await old.close().catch(() => {}); }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.75;
  }

  /** Real output latency (seconds) so app notes can be matched to what the mic hears. */
  get outLatency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? (c.outputLatency || 0) + (c.baseLatency || 0) : 0;
  }

  // ---------- note synthesis (cached) ----------
  private render(midi: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const f0 = midiToFreq(midi, this.a4);
    const dur = Math.max(1.4, Math.min(5, 5.2 - (midi - 21) / 22));
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const B = 0.00035 + Math.max(0, midi - 60) * 0.000012;
    const nPart = midi < 40 ? 12 : midi < 60 ? 10 : midi < 80 ? 7 : 4;
    for (let h = 1; h <= nPart; h++) {
      const f = f0 * h * Math.sqrt(1 + B * h * h);
      if (f > sr * 0.45) break;
      let amp = 1 / Math.pow(h, midi < 48 ? 0.75 : 1.05);
      if (h === 1 && midi < 45) amp *= 0.55; // weak bass fundamentals
      if (h === 2 && midi < 45) amp *= 1.15;
      const tauLong = Math.max(0.35, (3.4 - (midi - 21) / 26)) / Math.pow(h, 0.55);
      const tauShort = tauLong * 0.18;
      // two-stage decay (fast initial drop then long sustain), like a struck string
      const w = (2 * Math.PI * f) / sr;
      // recurrence sine (cheap): s[k+1] = 2cos(w) s[k] - s[k-1]
      const c2 = 2 * Math.cos(w);
      let s1 = 0, s0 = Math.sin(-w);
      const kl = -1 / (tauLong * sr), ks = -1 / (tauShort * sr);
      let el = 1, es = 1;
      const dl = Math.exp(kl), ds = Math.exp(ks);
      for (let i = 0; i < n; i++) {
        const s = c2 * s1 - s0;
        s0 = s1; s1 = s;
        out[i] += amp * s1 * (0.55 * el + 0.45 * es);
        el *= dl; es *= ds;
      }
    }
    // hammer: a short filtered noise thump
    let lp = 0, seed = midi * 9301 + 49297;
    const hammerLen = Math.floor(sr * 0.012);
    const a = Math.min(0.9, f0 / 2000);
    for (let i = 0; i < hammerLen; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      lp += a * ((seed / 233280) * 2 - 1 - lp);
      out[i] += lp * 0.25 * (1 - i / hammerLen);
    }
    // attack ramp and normalisation
    let peak = 0;
    const att = Math.floor(sr * 0.003);
    for (let i = 0; i < n; i++) {
      if (i < att) out[i] *= i / att;
      const v = Math.abs(out[i]); if (v > peak) peak = v;
    }
    const tail = Math.floor(sr * 0.05);
    for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
    const norm = 0.5 / (peak || 1);
    for (let i = 0; i < n; i++) out[i] *= norm;
    return buf;
  }

  private bufferFor(midi: number): AudioBuffer {
    let b = this.buffers.get(midi);
    if (!b) { b = this.render(midi); this.buffers.set(midi, b); }
    return b;
  }

  /** Pre-render notes in idle time so the first press never stalls. */
  warm(lo: number, hi: number) {
    if (!this.ctx) return;
    const todo: number[] = [];
    for (let m = lo; m <= hi; m++) if (!this.buffers.has(m)) todo.push(m);
    const step = () => {
      const t = performance.now();
      while (todo.length && performance.now() - t < 12) this.bufferFor(todo.shift()!);
      if (todo.length) setTimeout(step, 16);
    };
    setTimeout(step, 0);
  }

  private startVoice(midi: number, t: number, velocity: number): Voice {
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.bufferFor(Math.max(21, Math.min(108, midi)));
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.05, Math.min(1, velocity)) * 0.55;
    src.connect(gain).connect(this.master);
    src.start(t);
    const now = performance.now();
    const startMs = now + (t - ctx.currentTime + this.outLatency) * 1000;
    return { src, gain, startMs, endMs: startMs + src.buffer.duration * 1000, midi };
  }

  private release(v: Voice, t: number, sec = 0.18) {
    const g = v.gain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, sec / 4); // smooth exponential release, no click
      v.src.stop(t + sec + 0.05);
    } catch { /* already stopped */ }
  }

  /** Start a live piano note (keyboard, MIDI, touch, lesson demos). */
  noteOn(midi: number, velocity = 0.8, when?: number) {
    const ctx = this.ensure();
    const t = when ?? ctx.currentTime;
    const prev = this.active.get(midi);
    if (prev) this.release(prev, t, 0.06);
    const v = this.startVoice(midi, t, velocity);
    this.active.set(midi, v);
  }

  noteOff(midi: number, when?: number) {
    const v = this.active.get(midi);
    if (!v || !this.ctx) return;
    this.release(v, when ?? this.ctx.currentTime);
    this.active.delete(midi);
  }

  /** Play notes for the learner to hear. Marks the app as "sounding" for mic suppression. */
  playNotes(notes: { midi: number; startMs: number; durMs: number }[], velocity = 0.75) {
    const ctx = this.ensure();
    const base = ctx.currentTime + 0.05;
    let end = 0;
    for (const n of notes) {
      const s = base + n.startMs / 1000;
      this.scheduleNote(n.midi, s, n.durMs / 1000, velocity, true);
      end = Math.max(end, n.startMs + n.durMs);
      this.timers.push(window.setTimeout(() => this.onAppNote?.(n.midi, true), n.startMs + 50));
      this.timers.push(window.setTimeout(() => this.onAppNote?.(n.midi, false), n.startMs + n.durMs + 50));
    }
    this.appPlayingUntil = Math.max(this.appPlayingUntil, performance.now() + end + 600);
    return end;
  }

  /**
   * Schedule one independent piano note (score playback, accompaniment, demos).
   * Notes never cut each other off, so voices and chords overlap naturally.
   * `suppressMic`: mute microphone detection while it sounds (lesson demos). For play-along
   * accompaniment it is false; the microphone's echo gate ignores these notes instead.
   */
  scheduleNote(midi: number, whenSec: number, durSec: number, velocity = 0.7, suppressMic = true, instrument: Instrument = 'piano') {
    const ctx = this.ensure();
    const t = Math.max(ctx.currentTime, whenSec);
    const end = t + Math.max(0.08, durSec);
    const now = performance.now();
    if (instrument !== 'piano') {
      const startMs = now + (t - ctx.currentTime + this.outLatency) * 1000;
      this.playSynth(instrument, midi, t, end, velocity);
      this.appNotes.push({ midi, onMs: startMs, offMs: startMs + (end - t + 0.4) * 1000 });
      if (suppressMic) this.appPlayingUntil = Math.max(this.appPlayingUntil, now + (end - ctx.currentTime) * 1000 + 500);
      return;
    }
    const v = this.startVoice(midi, t, velocity);
    this.release(v, end, 0.22);
    v.endMs = v.startMs + (end - t + 0.2) * 1000;
    this.scheduled.add(v);
    v.src.onended = () => this.scheduled.delete(v);
    this.appNotes.push({ midi, onMs: v.startMs, offMs: v.endMs });
    if (this.appNotes.length > 400) this.appNotes = this.appNotes.filter((x) => x.offMs > now - 2000);
    if (suppressMic) this.appPlayingUntil = Math.max(this.appPlayingUntil, now + (end - ctx.currentTime) * 1000 + 400);
  }

  // ---------- play-along instruments (lightweight synthesis, 4-5 nodes per note) ----------
  private waves = new Map<string, PeriodicWave>();
  private synthNodes = new Set<{ stop: (t: number) => void }>();
  private wave(name: string, amps: number[]): PeriodicWave {
    let w = this.waves.get(name);
    if (!w) {
      const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
      amps.forEach((a, i) => (imag[i + 1] = a));
      w = this.ctx!.createPeriodicWave(real, imag);
      this.waves.set(name, w);
    }
    return w;
  }

  private playSynth(inst: Instrument, midi: number, t: number, end: number, velocity: number) {
    const ctx = this.ctx!;
    const f = midiToFreq(midi, this.a4);
    const P: Record<Exclude<Instrument, 'piano'>, { amps: number[]; lp: number; att: number; rel: number; vib: number; vibRate: number; vol: number; detune?: number }> = {
      violin: { amps: [1, 0.62, 0.48, 0.36, 0.3, 0.22, 0.17, 0.12, 0.09, 0.07, 0.05], lp: 4200, att: 0.07, rel: 0.22, vib: 0.0065, vibRate: 5.7, vol: 0.32 },
      viola: { amps: [1, 0.7, 0.5, 0.4, 0.28, 0.2, 0.14, 0.1, 0.07], lp: 3000, att: 0.08, rel: 0.25, vib: 0.006, vibRate: 5.4, vol: 0.34 },
      cello: { amps: [1, 0.8, 0.55, 0.42, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05], lp: 2200, att: 0.09, rel: 0.3, vib: 0.0055, vibRate: 5.0, vol: 0.4 },
      flute: { amps: [1, 0.22, 0.08, 0.04, 0.02], lp: 5000, att: 0.06, rel: 0.15, vib: 0.004, vibRate: 5.2, vol: 0.34 },
      strings: { amps: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.13, 0.11, 0.09], lp: 2600, att: 0.32, rel: 0.6, vib: 0.003, vibRate: 5.5, vol: 0.2, detune: 7 },
      bass: { amps: [1, 0.45, 0.2, 0.1, 0.05], lp: 900, att: 0.006, rel: 0.12, vib: 0, vibRate: 0, vol: 0.55 },
      choir: { amps: [1, 0.55, 0.32, 0.18, 0.12, 0.08, 0.05], lp: 1700, att: 0.18, rel: 0.35, vib: 0.0045, vibRate: 4.8, vol: 0.3, detune: 5 },
    };
    const p = P[inst as Exclude<Instrument, 'piano'>];
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(p.lp, f * 14);
    lp.Q.value = 0.6;
    out.connect(lp).connect(this.master);
    const peak = p.vol * Math.max(0.1, Math.min(1, velocity));
    const g = out.gain;
    g.setValueAtTime(0, t);
    if (inst === 'bass') {
      g.linearRampToValueAtTime(peak, t + p.att);
      g.setTargetAtTime(peak * 0.15, t + p.att, 0.5);
    } else {
      g.linearRampToValueAtTime(peak, t + p.att);
      g.setTargetAtTime(peak * 0.85, t + p.att, 0.2);
    }
    g.setTargetAtTime(0, end, p.rel / 3);
    const oscs: OscillatorNode[] = [];
    const mk = (cents: number) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.wave(inst, p.amps));
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(out);
      oscs.push(o);
      return o;
    };
    mk(0);
    if (p.detune) mk(p.detune);
    let lfo: OscillatorNode | null = null;
    if (p.vib > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = p.vibRate;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * p.vib, t + 0.35); // vibrato blooms after the attack
      lfo.connect(depth);
      oscs.forEach((o) => depth.connect(o.frequency));
      lfo.start(t);
    }
    const stopAt = end + p.rel * 2 + 0.05;
    oscs.forEach((o) => { o.start(t); o.stop(stopAt); });
    lfo?.stop(stopAt);
    const rec = { stop: (at: number) => { try { g.cancelScheduledValues(at); g.setTargetAtTime(0, at, 0.03); oscs.forEach((o) => o.stop(at + 0.15)); lfo?.stop(at + 0.15); } catch { /* done */ } } };
    this.synthNodes.add(rec);
    oscs[0].onended = () => this.synthNodes.delete(rec);
  }

  // ---------- drums for the play-along groove ----------
  private drumBufs = new Map<Drum, AudioBuffer>();
  private drumBuffer(kind: Drum): AudioBuffer {
    let b = this.drumBufs.get(kind);
    if (b) return b;
    const ctx = this.ctx!, sr = ctx.sampleRate;
    const len = Math.floor(sr * (kind === 'kick' ? 0.45 : kind === 'snare' ? 0.25 : 0.08));
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let seed = 12345, prev = 0, ph = 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (kind === 'kick') { const f = 45 + 110 * Math.exp(-t * 28); ph += (2 * Math.PI * f) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 7) * 0.9; }
      else if (kind === 'snare') { ph += (2 * Math.PI * 190) / sr; const n = rnd(); d[i] = (0.55 * (n - prev * 0.6) * Math.exp(-t * 18) + 0.35 * Math.sin(ph) * Math.exp(-t * 30)); prev = n; }
      else { const n = rnd(); d[i] = (n - prev) * 0.5 * Math.exp(-t * 70); prev = n; }
    }
    this.drumBufs.set(kind, b);
    return b;
  }
  drumsVolume = 0.5;
  scheduleDrum(kind: Drum, whenSec: number, velocity = 0.7) {
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.drumBuffer(kind);
    const g = ctx.createGain();
    g.gain.value = this.drumsVolume * velocity * (kind === 'hat' ? 0.35 : kind === 'snare' ? 0.45 : 0.7);
    src.connect(g).connect(this.master);
    src.start(Math.max(ctx.currentTime, whenSec));
    const rec = { stop: (at: number) => { try { src.stop(at); } catch { /* done */ } } };
    this.synthNodes.add(rec);
    src.onended = () => this.synthNodes.delete(rec);
  }

  /** App notes that START within +-win ms of t (performance.now ms at the speakers). */
  appOnsetsNear(t: number, win = 110): number[] {
    return this.appNotes.filter((n) => Math.abs(n.onMs - t) <= win).map((n) => n.midi);
  }
  /** App notes sounding at time t. */
  appSoundingAt(t: number): number[] {
    return this.appNotes.filter((n) => n.onMs - 30 <= t && t <= n.offMs).map((n) => n.midi);
  }

  stopScheduled() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.scheduled.forEach((v) => this.release(v, ctx.currentTime, 0.08));
    this.scheduled.clear();
    this.synthNodes.forEach((n) => n.stop(ctx.currentTime));
    this.synthNodes.clear();
    this.appNotes = [];
    this.appPlayingUntil = 0;
  }

  click(accent: boolean, sub = false, whenMs?: number) {
    const ctx = this.ensure();
    const t = whenMs !== undefined ? ctx.currentTime + Math.max(0, whenMs) / 1000 : ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : sub ? 990 : 1320;
    const peak = this.metronomeVolume * (sub ? 0.15 : accent ? 0.5 : 0.32);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.05);
    o.connect(g).connect(this.limiter);
    o.start(t);
    o.stop(t + 0.06);
    // remember it, so stopAll() can cancel clicks already scheduled for later (restart, exit)
    this.clicks.add(o);
    o.onended = () => { this.clicks.delete(o); try { g.disconnect(); } catch { /* gone */ } };
  }
  private clicks = new Set<OscillatorNode>();
  /** Cancel every metronome click scheduled for the future. */
  stopClicks() {
    this.clicks.forEach((o) => { try { o.stop(0); o.disconnect(); } catch { /* already done */ } });
    this.clicks.clear();
  }

  stopAll() {
    this.stopClicks();
    this.stopScheduled();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    [...this.active.keys()].forEach((m) => this.noteOff(m));
    this.appPlayingUntil = 0;
  }
}

export const audio = new AudioEngine();
