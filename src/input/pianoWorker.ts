// Background worker for piano listening. Microphone samples arrive straight from the audio thread (an
// AudioWorklet sends them over a MessagePort), the detector runs here on a fixed hop of the sample clock,
// and note events go back to the page. A busy screen (3D hands, notation) can no longer make the
// detector skip frames, and the page stays smooth while it works.
import { PianoListener } from './pianoListen';
import type { SoundProfile } from './poly';

type In =
  | { type: 'init'; sampleRate: number; port: MessagePort }
  | { type: 'expected'; notes: number[] | null }
  | { type: 'app'; notes: { midi: number; at: number }[] } // app notes, audio-clock ms
  | { type: 'config'; sensitivity: number; profile: SoundProfile; noiseGate: number; echoLag: number }
  | { type: 'reset' };

let L: PianoListener | null = null;
let expected: number[] | null = null;
let appNotes: { midi: number; at: number }[] = [];
/** audio-clock ms of the listener's first sample */
let t0 = -1;
let busyMs = 0, chunks = 0;
/** how late the app's own notes can reach the microphone (output delay, earphones, the room) */
let echoLag = 300;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

function feed(frame: number, data: Float32Array) {
  if (!L) return;
  if (t0 < 0) t0 = (frame / L.sampleRate) * 1000;
  const s = performance.now();
  const evs = L.push(data);
  busyMs += performance.now() - s; chunks++;
  for (const ev of evs) post({ type: 'event', at: ev.onsetMs + t0, notes: ev.notes.map((n) => ({ midi: n.midi, confidence: n.confidence, expected: n.expected })) });
  // load report about twice a second: share of real time the detector needs (diagnostics)
  if (chunks >= 24) { post({ type: 'load', ratio: busyMs / ((chunks * data.length * 1000) / L.sampleRate) }); busyMs = 0; chunks = 0; }
}

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'init') {
    L = new PianoListener(m.sampleRate);
    t0 = -1;
    L.getExpected = () => expected;
    L.getMasked = (ms) => appNotes.filter((n) => { const d = ms - (n.at - t0); return d >= -90 && d <= echoLag; }).map((n) => n.midi);
    m.port.onmessage = (ev: MessageEvent<{ frame: number; data: Float32Array }>) => feed(ev.data.frame, ev.data.data);
    post({ type: 'ready' });
  } else if (m.type === 'expected') expected = m.notes;
  else if (m.type === 'app') appNotes = m.notes;
  else if (m.type === 'config' && L) { L.sensitivity = m.sensitivity; L.profile = m.profile; L.noiseGate = m.noiseGate; echoLag = m.echoLag; }
  else if (m.type === 'reset' && L) L.tracker.reset();
};
