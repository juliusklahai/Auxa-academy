// Every microphone sample, off the main thread: an AudioWorklet copies the input in 1024-sample blocks
// and sends them through a MessagePort directly to the piano worker. Falls back to null when the browser
// has no AudioWorklet or module workers (the older in-page detector is used then).
import PianoWorker from './pianoWorker?worker&inline';
import type { SoundProfile } from './poly';

const WORKLET = `
class AuxaCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; this.out = null;
    this.port.onmessage = (e) => { if (e.data && e.data.port) this.out = e.data.port; }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && this.out) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === 1024) {
          const data = this.buf; this.buf = new Float32Array(1024); this.n = 0;
          this.out.postMessage({ frame: currentFrame + i + 1 - 1024, data }, [data.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor('auxa-capture', AuxaCapture);
`;

export interface WorkerNoteEvent { at: number /* audio-clock ms */; notes: { midi: number; confidence: number; expected: boolean }[] }

export class PianoCapture {
  private node: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private sink: GainNode | null = null;
  onEvent: ((e: WorkerNoteEvent) => void) | null = null;
  /** share of real time the detector needs (1 = it cannot keep up) */
  load = 0;
  private lastCfg = '';

  static supported(ctx: AudioContext) { return typeof AudioWorkletNode !== 'undefined' && !!ctx.audioWorklet && typeof Worker !== 'undefined'; }

  async start(ctx: AudioContext, src: AudioNode): Promise<boolean> {
    if (!PianoCapture.supported(ctx)) return false;
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.node = new AudioWorkletNode(ctx, 'auxa-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      // a silent path to the speakers keeps the node running in every browser
      this.sink = ctx.createGain(); this.sink.gain.value = 0;
      this.node.connect(this.sink).connect(ctx.destination);
      this.worker = new PianoWorker();
      const ch = new MessageChannel();
      this.worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'event') this.onEvent?.(m as WorkerNoteEvent);
        else if (m.type === 'load') this.load = m.ratio;
      };
      this.worker.postMessage({ type: 'init', sampleRate: ctx.sampleRate, port: ch.port2 }, [ch.port2]);
      this.node.port.postMessage({ port: ch.port1 }, [ch.port1]);
      src.connect(this.node);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  setExpected(notes: number[] | null) { this.worker?.postMessage({ type: 'expected', notes }); }
  setAppNotes(notes: { midi: number; at: number }[]) { this.worker?.postMessage({ type: 'app', notes }); }
  config(sensitivity: number, profile: SoundProfile, noiseGate: number) {
    const k = `${sensitivity}|${profile}|${noiseGate}`;
    if (k === this.lastCfg) return;
    this.lastCfg = k;
    this.worker?.postMessage({ type: 'config', sensitivity, profile, noiseGate });
  }
  reset() { this.worker?.postMessage({ type: 'reset' }); }

  stop() {
    try { this.node?.disconnect(); this.sink?.disconnect(); } catch { /* gone */ }
    this.node = null; this.sink = null;
    this.worker?.terminate();
    this.worker = null;
    this.lastCfg = '';
  }
}
