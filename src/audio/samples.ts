// Recorded instrument sounds (multisamples), played back pitched to the exact key.
//
// Sources (both allow commercial use; credited in the app's legal page):
//  - Grand piano: Salamander Grand Piano V3 by Alexander Holm (Yamaha C5), CC BY 3.0
//    (the author has since placed it in the public domain). Three loudness layers.
//  - Everything else: FluidR3_GM by Frank Wen, CC BY 3.0, as rendered by gleitz/midi-js-soundfonts.
// Every third key is recorded (A, C, D#, F#); notes in between are the nearest recording, pitched.

export type SoundId =
  | 'grand' | 'epiano' | 'fmpiano' | 'harpsichord' | 'organ' | 'jazzorgan' | 'vibes'
  | 'nylon' | 'steel' | 'eguitar' | 'abass' | 'ebass'
  | 'strings-s' | 'violin-s' | 'cello-s' | 'flute-s' | 'choir-s';

export interface SoundDef {
  id: SoundId;
  label: string;
  group: 'Pianos & keys' | 'Guitars & bass' | 'Orchestra';
  /** sample folders under /sounds, quietest layer first */
  layers: string[];
  lo: number; hi: number;
  /** held sounds loop while the note is down (organ, strings, voices) */
  sustain: boolean;
  /** release time (s) after the note ends */
  release: number;
  /** level trim against the other sounds */
  gain: number;
}

export const SOUNDS: SoundDef[] = [
  { id: 'grand', label: 'Concert grand', group: 'Pianos & keys', layers: ['grand-p', 'grand-m', 'grand-f'], lo: 21, hi: 108, sustain: false, release: 0.3, gain: 1 },
  { id: 'epiano', label: 'Electric piano (tine)', group: 'Pianos & keys', layers: ['epiano'], lo: 21, hi: 108, sustain: false, release: 0.35, gain: 1 },
  { id: 'fmpiano', label: 'FM electric piano', group: 'Pianos & keys', layers: ['fmpiano'], lo: 21, hi: 108, sustain: false, release: 0.35, gain: 1 },
  { id: 'harpsichord', label: 'Harpsichord', group: 'Pianos & keys', layers: ['harpsichord'], lo: 21, hi: 108, sustain: false, release: 0.2, gain: 0.85 },
  { id: 'organ', label: 'Church organ', group: 'Pianos & keys', layers: ['organ'], lo: 21, hi: 108, sustain: true, release: 0.25, gain: 0.7 },
  { id: 'jazzorgan', label: 'Jazz organ', group: 'Pianos & keys', layers: ['jazzorgan'], lo: 21, hi: 108, sustain: true, release: 0.12, gain: 0.7 },
  { id: 'vibes', label: 'Vibraphone', group: 'Pianos & keys', layers: ['vibes'], lo: 48, hi: 96, sustain: false, release: 0.5, gain: 0.9 },
  { id: 'nylon', label: 'Nylon guitar', group: 'Guitars & bass', layers: ['nylon'], lo: 36, hi: 90, sustain: false, release: 0.25, gain: 1 },
  { id: 'steel', label: 'Steel guitar', group: 'Guitars & bass', layers: ['steel'], lo: 36, hi: 90, sustain: false, release: 0.25, gain: 1 },
  { id: 'eguitar', label: 'Clean electric guitar', group: 'Guitars & bass', layers: ['eguitar'], lo: 36, hi: 90, sustain: false, release: 0.2, gain: 0.95 },
  { id: 'abass', label: 'Upright bass', group: 'Guitars & bass', layers: ['abass'], lo: 24, hi: 72, sustain: false, release: 0.15, gain: 1 },
  { id: 'ebass', label: 'Electric bass', group: 'Guitars & bass', layers: ['ebass'], lo: 24, hi: 72, sustain: false, release: 0.12, gain: 1 },
  { id: 'strings-s', label: 'String section', group: 'Orchestra', layers: ['strings-s'], lo: 27, hi: 105, sustain: true, release: 0.35, gain: 0.8 },
  { id: 'violin-s', label: 'Violin', group: 'Orchestra', layers: ['violin-s'], lo: 54, hi: 105, sustain: true, release: 0.25, gain: 0.75 },
  { id: 'cello-s', label: 'Cello', group: 'Orchestra', layers: ['cello-s'], lo: 33, hi: 84, sustain: true, release: 0.3, gain: 0.8 },
  { id: 'flute-s', label: 'Flute', group: 'Orchestra', layers: ['flute-s'], lo: 57, hi: 99, sustain: true, release: 0.2, gain: 0.75 },
  { id: 'choir-s', label: 'Choir "aah"', group: 'Orchestra', layers: ['choir-s'], lo: 39, hi: 84, sustain: true, release: 0.4, gain: 0.75 },
];
export const soundDef = (id: string) => SOUNDS.find((s) => s.id === id);

/** the recorded keys of a sound (every third key from A0, within its range) */
export function rootsOf(d: SoundDef): number[] {
  const out: number[] = [];
  for (let m = 21; m <= 108; m += 3) if (m >= d.lo - 1 && m <= d.hi + 1) out.push(m);
  return out;
}
/** nearest recorded key to a note */
export function nearestRoot(roots: number[], midi: number): number {
  let best = roots[0];
  for (const r of roots) if (Math.abs(r - midi) < Math.abs(best - midi)) best = r;
  return best;
}
/** which loudness layer a velocity (0..1) plays from */
// three layers: soft below 0.35, medium up to 0.85 (where most taps and the app's own playback sit), loud above
export const layerFor = (n: number, velocity: number) => (n <= 1 ? 0 : n === 3 ? (velocity < 0.35 ? 0 : velocity < 0.85 ? 1 : 2) : Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.999, velocity)) * n)));

export interface Sample { buf: AudioBuffer; start: number; loopStart: number; loopEnd: number }
export interface Bank { def: SoundDef; roots: number[]; layers: Map<number, Sample>[]; norm: number }

const base = () => {
  try { return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'; } catch { return '/'; }
};

/**
 * Decode one recording and make it ready to play: find where the sound really starts (mp3s carry a
 * little silence at the front), fade out the very end, and for held sounds build a seamless loop
 * (the end of the loop is crossfaded into the audio just before its start).
 */
export function prepare(ctx: BaseAudioContext, buf: AudioBuffer, sustain: boolean): Sample {
  const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels;
  const d0 = buf.getChannelData(0);
  let first = 0;
  while (first < n && Math.abs(d0[first]) < 1e-4) first++;
  const start = Math.max(0, first - Math.floor(sr * 0.001)) / sr;
  const out = ctx.createBuffer(ch, n, sr);
  let loopStart = 0, loopEnd = 0;
  const xf = Math.floor(sr * 0.25);
  const ls = Math.min(n - 1, first + Math.floor(sr * 0.9)), le = n - Math.floor(sr * 0.15);
  const canLoop = sustain && le - ls > xf * 2 && ls - xf > first;
  for (let c = 0; c < ch; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src);
    if (canLoop) {
      // equal-power crossfade: the last xf samples before le blend into the xf samples before ls
      for (let i = 0; i < xf; i++) {
        const k = i / xf;
        dst[le - xf + i] = src[le - xf + i] * Math.cos(k * Math.PI / 2) + src[ls - xf + i] * Math.sin(k * Math.PI / 2);
      }
    } else {
      const fade = Math.min(Math.floor(sr * 0.3), n);
      for (let i = 0; i < fade; i++) dst[n - 1 - i] *= i / fade;
    }
  }
  if (canLoop) { loopStart = ls / sr; loopEnd = le / sr; }
  return { buf: out, start, loopStart, loopEnd };
}

function peakOf(b: AudioBuffer) {
  let p = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i += 4) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  return p;
}

function rmsOf(s: Sample) {
  const d = s.buf.getChannelData(0), sr = s.buf.sampleRate;
  const a = Math.floor(s.start * sr), b = Math.min(d.length, a + Math.floor(sr * 0.4));
  let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i];
  return Math.sqrt(e / Math.max(1, b - a));
}

const banks = new Map<string, Promise<Bank>>();
const ready = new Map<string, Bank>();

/** Load (once) and decode a sound. Resolves when every recording is ready. */
export function loadBank(ctx: BaseAudioContext, id: SoundId): Promise<Bank> {
  const key = `${id}@${ctx.sampleRate}`;
  let p = banks.get(key);
  if (p) return p;
  const def = soundDef(id)!;
  const roots = rootsOf(def);
  p = (async () => {
    const layers = await Promise.all(def.layers.map(async (dir) => {
      const m = new Map<number, Sample>();
      await Promise.all(roots.map(async (r) => {
        const res = await fetch(`${base()}sounds/${dir}/${r}.mp3`);
        if (!res.ok) throw new Error(`sound ${dir}/${r} missing`);
        const raw = await ctx.decodeAudioData(await res.arrayBuffer());
        m.set(r, prepare(ctx, raw, def.sustain));
      }));
      return m;
    }));
    // one level for the whole sound, so soft and loud layers stay in proportion: every sound is
    // matched by how loud its middle layer sounds near middle C (its first 0.4 s), so switching
    // sounds keeps the same volume
    const mid = layers[Math.floor((layers.length - 1) / 2)];
    const ref = mid.get(nearestRoot(roots, Math.max(def.lo, Math.min(def.hi, 64))))!;
    let peak = 0;
    for (const L of layers) for (const s of L.values()) peak = Math.max(peak, peakOf(s.buf));
    const loud = rmsOf(ref);
    const bank: Bank = { def, roots, layers, norm: Math.min(0.18 / (loud || 1), 0.95 / (peak || 1)) };
    ready.set(key, bank);
    return bank;
  })();
  p.catch(() => banks.delete(key)); // try again next time (offline, for example)
  banks.set(key, p);
  return p;
}

/** A sound that has finished loading, or null (play the built-in synth meanwhile). */
export const readyBank = (ctx: BaseAudioContext, id: SoundId) => ready.get(`${id}@${ctx.sampleRate}`) ?? null;
