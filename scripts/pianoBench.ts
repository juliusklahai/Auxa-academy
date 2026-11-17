// Acoustic piano microphone benchmark.
//
// Builds labelled performances from Auxa's recorded concert grand samples (three velocity layers, real
// piano recordings), puts them in a room (reverb, a phone-like microphone, background noise), and runs the
// live piano detector over them exactly as the app does (the newest 4096 samples every 23 ms).
//
//   npx vite-node scripts/pianoBench.ts            all scenarios, free play and lesson mode
//   npx vite-node scripts/pianoBench.ts fast soft   only some scenarios
//
// Needs the decoded samples in /tmp/pbench/s/<layer>/<root>.f32 (48 kHz mono float), made with ffmpeg:
//   for f in public/sounds/grand-?/*.mp3; do ffmpeg -i $f -ac 1 -ar 48000 -f f32le /tmp/pbench/s/...; done
// Real recordings of a real piano in a real room are the final word; this is the repeatable baseline.
import { readFileSync, existsSync } from 'fs';
import { analyzerFor, type Analyzer } from './benchAnalyzer';

export const SR = 48000;
const DIR = process.env.PBENCH ?? '/tmp/pbench/s';
const LAYERS = ['grand-p', 'grand-m', 'grand-f'];
const ROOTS = Array.from({ length: 30 }, (_, i) => 21 + i * 3);
const cache = new Map<string, Float32Array>();
function sample(layer: string, root: number): Float32Array {
  const k = `${layer}/${root}`;
  let s = cache.get(k);
  if (!s) {
    const p = `${DIR}/${k}.f32`;
    if (!existsSync(p)) throw new Error(`missing ${p}: decode the samples first (see the top of this file)`);
    const b = readFileSync(p);
    s = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
    cache.set(k, s);
  }
  return s;
}

export interface Note { midi: number; t: number; dur: number; vel: number }
export interface Scenario { name: string; notes: Note[]; len: number; pedal?: boolean; gain?: number; noise?: number }

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Render notes with the real samples: velocity picks the layer, the nearest sampled key is re-pitched. */
export function render(sc: Scenario): Float32Array {
  const out = new Float32Array(Math.ceil(sc.len * SR));
  for (const n of sc.notes) {
    const layer = LAYERS[n.vel < 0.4 ? 0 : n.vel < 0.75 ? 1 : 2];
    const root = ROOTS.reduce((a, b) => (Math.abs(b - n.midi) < Math.abs(a - n.midi) ? b : a));
    const s = sample(layer, root);
    const rate = Math.pow(2, (n.midi - root) / 12);
    const g = 0.35 + 0.65 * (n.vel - (n.vel < 0.4 ? 0 : n.vel < 0.75 ? 0.4 : 0.75)) / 0.4;
    const s0 = Math.floor(n.t * SR);
    // with the pedal down the strings keep ringing; the same key struck again stops the old vibration
    const again = sc.notes.find((m) => m !== n && m.midi === n.midi && m.t > n.t);
    const off = Math.min(sc.pedal ? 3.0 : n.dur, again ? again.t - n.t : Infinity);
    const relN = Math.floor((again && again.t - n.t <= off + 1e-6 ? 0.015 : 0.05) * SR); // felt dampers stop a string in ~50 ms
    const endN = Math.floor(off * SR);
    for (let i = 0; s0 + i < out.length; i++) {
      const x = i * rate;
      const k = Math.floor(x);
      if (k + 1 >= s.length) break;
      let v = s[k] + (s[k + 1] - s[k]) * (x - k);
      if (i > endN) { const r = Math.exp(-(i - endN) / relN); if (r < 1e-3) break; v *= r; } // damper
      out[s0 + i] += v * g;
    }
  }
  return out;
}

/** A room and a phone: early reflections + diffuse tail, mic band-limits, level, background noise.
 *  wet 0.4 ~ phone on the music stand (direct sound ~8 dB above the room); wet 1 ~ phone across a live room. */
export function room(x: Float32Array, gain = 1, noise = 0.0008, wet = 0.4): Float32Array {
  const y = Float32Array.from(x);
  // early reflections
  for (const [ms, g] of [[11, 0.32], [17, 0.24], [29, 0.18], [41, 0.12]] as const) {
    const d = Math.floor((ms / 1000) * SR);
    for (let i = x.length - 1; i >= d; i--) y[i] += x[i - d] * g;
  }
  // diffuse tail: convolution with decaying noise (a real room's tail is dense and has no pitch; feedback
  // combs would add fake low "notes" at 1/delay)
  const tail = convolve(x, roomIR());
  for (let i = 0; i < y.length; i++) y[i] += tail[i] * wet;
  // phone microphone: rolls off below ~100 Hz and above ~8 kHz
  let hp = 0, hpx = 0, lp = 0;
  const a = Math.exp((-2 * Math.PI * 100) / SR), b = Math.exp((-2 * Math.PI * 8000) / SR);
  // background: pink-ish noise plus a little mains hum
  let p0 = 0, p1 = 0;
  for (let i = 0; i < y.length; i++) {
    const v = y[i];
    hp = a * (hp + v - hpx); hpx = v;
    lp = (1 - b) * hp + b * lp;
    const w = rnd() * 2 - 1;
    p0 = 0.97 * p0 + 0.03 * w; p1 = 0.6 * p1 + 0.4 * w;
    y[i] = lp * gain + noise * (p0 * 3 + p1 * 0.5) + noise * 0.4 * Math.sin((2 * Math.PI * 50 * i) / SR);
  }
  return y;
}

let irCache: Float32Array | null = null;
function roomIR(): Float32Array {
  if (irCache) return irCache;
  const n = Math.floor(0.6 * SR), ir = new Float32Array(n);
  let s2 = 99;
  const r = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    lp = 0.75 * lp + 0.25 * r(); // walls absorb the highs
    ir[i] = t < 0.02 ? 0 : lp * Math.exp(-t / 0.13) * 0.09;
  }
  return (irCache = ir);
}
function fft(re: Float64Array, im: Float64Array, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc; } }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
/** overlap-add FFT convolution */
function convolve(x: Float32Array, h: Float32Array): Float32Array {
  const B = 32768, N = 65536, out = new Float32Array(x.length);
  const hr = new Float64Array(N), hi = new Float64Array(N); hr.set(h.subarray(0, N - B)); fft(hr, hi);
  for (let s0 = 0; s0 < x.length; s0 += B) {
    const re = new Float64Array(N), im = new Float64Array(N);
    re.set(x.subarray(s0, Math.min(x.length, s0 + B)));
    fft(re, im);
    for (let k = 0; k < N; k++) { const a = re[k] * hr[k] - im[k] * hi[k], b = re[k] * hi[k] + im[k] * hr[k]; re[k] = a; im[k] = b; }
    fft(re, im, true);
    for (let i = 0; i < N && s0 + i < out.length; i++) out[s0 + i] += re[i];
  }
  return out;
}

// ---------- scenarios ----------
const iv = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
function singles(name: string, n: number, lo: number, hi: number, vel: [number, number], gap = 0.6): Scenario {
  const notes = Array.from({ length: n }, (_, i) => ({ midi: iv(lo, hi), t: 0.5 + i * gap, dur: gap * 0.9, vel: vel[0] + rnd() * (vel[1] - vel[0]) }));
  return { name, notes, len: 1.5 + n * gap };
}
function run(name: string, start: number, steps: number[], gap: number, vel = 0.55, reps = 3): Scenario {
  const notes: Note[] = [];
  let t = 0.5;
  for (let r = 0; r < reps; r++) {
    for (const s of [...steps, ...[...steps].reverse().slice(1)]) { notes.push({ midi: start + s, t, dur: gap * 0.95, vel: vel + (rnd() - 0.5) * 0.1 }); t += gap; }
    t += gap * 2;
  }
  return { name, notes, len: t + 1.5 };
}
function repeated(name: string, gap: number, vel = 0.55): Scenario {
  const notes: Note[] = [];
  let t = 0.5;
  for (const m of [48, 55, 60, 64, 67, 72, 76, 84]) { for (let k = 0; k < 4; k++) { notes.push({ midi: m, t, dur: gap * 0.85, vel: vel + (rnd() - 0.5) * 0.15 }); t += gap; } t += 0.4; }
  return { name, notes, len: t + 1.5 };
}
function chords(name: string, shapes: number[][], gap = 0.9, vel = 0.6): Scenario {
  const notes: Note[] = [];
  let t = 0.5;
  for (let k = 0; k < 24; k++) {
    const sh = shapes[k % shapes.length], root = iv(43, 64);
    sh.forEach((d) => notes.push({ midi: root + d, t: t + rnd() * 0.012, dur: gap * 0.9, vel: vel + (rnd() - 0.5) * 0.2 }));
    t += gap;
  }
  return { name, notes, len: t + 1.5 };
}
const MAJ = [0, 2, 4, 5, 7, 9, 11, 12];

export function scenarios(): Scenario[] {
  seed = 7;
  return [
    singles('single notes, middle', 60, 48, 84, [0.45, 0.7]),
    singles('single notes, whole range', 60, 24, 100, [0.45, 0.7]),
    { ...singles('soft notes (pp)', 50, 48, 84, [0.12, 0.3]), gain: 0.5 },
    singles('bass notes (A0 to B2)', 40, 21, 47, [0.45, 0.75], 0.8),
    singles('high notes (C6 up)', 30, 84, 105, [0.45, 0.75], 0.5),
    run('scale, eighths at 100', 60, MAJ, 0.3),
    run('scale, eighths at 140', 60, MAJ, 0.214),
    run('scale, sixteenths at 100', 60, MAJ, 0.15),
    run('scale, sixteenths at 130', 60, MAJ, 0.115),
    run('left-hand scale, eighths at 120', 36, MAJ, 0.25),
    repeated('repeated notes, 300 ms', 0.3),
    repeated('repeated notes, 180 ms', 0.18),
    chords('triads', [[0, 4, 7], [0, 3, 7], [0, 5, 9], [0, 4, 9]]),
    chords('four-note chords', [[0, 4, 7, 12], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 10, 14]]),
    chords('octaves and fifths', [[0, 12], [0, 7], [0, 7, 12], [-12, 0]]),
    chords('two hands: bass + triad', [[-12, 4, 7, 12], [-12, 3, 7, 12], [-24, 4, 7, 12]]),
    { ...run('legato melody with pedal', 60, [0, 4, 7, 4, 2, 5, 9, 5, 4, 7, 12, 7], 0.35), pedal: true },
  ];
}

// ---------- scoring ----------
export interface Det { midi: number; confidence: number; at: number }
export interface Score { name: string; labelled: number; confident: number; uncertain: number; missed: number; wrong: number; latency: number[] }

/** Match detections to labelled notes: same key, within -50..+150 ms of the real onset. */
export function score(name: string, labels: Note[], dets: Det[], minConf: number): Score {
  const used = new Set<number>();
  let confident = 0, uncertain = 0;
  const latency: number[] = [];
  for (const l of labels) {
    const t = l.t * 1000;
    let best = -1;
    dets.forEach((d, i) => { if (!used.has(i) && d.midi === l.midi && d.at >= t - 50 && d.at <= t + 150 && (best < 0 || d.confidence > dets[best].confidence)) best = i; });
    if (best < 0) continue;
    used.add(best);
    if (dets[best].confidence >= minConf) { confident++; latency.push(dets[best].at - t); } else uncertain++;
  }
  // a confident note that matches nothing played: the learner would be told they played a wrong note
  const wrong = dets.filter((d, i) => !used.has(i) && d.confidence >= minConf && !labels.some((l) => l.midi === d.midi && Math.abs(d.at - l.t * 1000) < 400)).length;
  return { name, labelled: labels.length, confident, uncertain, missed: labels.length - confident - uncertain, wrong, latency };
}

export function detect(x: Float32Array, an: Analyzer, expectedAt?: (ms: number) => number[] | null): Det[] {
  const out: Det[] = [];
  an.reset(expectedAt);
  for (const d of an.feed(x)) out.push(d);
  return out;
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const which = process.argv.find((a) => a.startsWith('--analyzer='))?.split('=')[1] ?? 'live';
  const minConf = 0.85;
  const rows: { cond: string; mode: string; s: Score }[] = [];
  for (const sc of scenarios().filter((s) => !only.length || only.some((o) => s.name.includes(o)))) {
    const dry = render(sc);
    for (const [cond, noise, wet] of [['quiet room', 0.0006, 0.4], ['noisy room', 0.004, 0.4], ['far, echoey', 0.0015, 1]] as const) {
      const x = room(dry, sc.gain ?? 1, (sc.noise ?? 1) * noise, wet);
      // free play (no lesson expectation) and lesson mode (the detector knows the next notes)
      for (const mode of ['free', 'lesson'] as const) {
        const an = analyzerFor(which, SR);
        const exp = mode === 'lesson' ? (ms: number) => {
          const next = sc.notes.filter((n) => n.t * 1000 >= ms - 220).sort((a, b) => a.t - b.t);
          if (!next.length) return null;
          const t0 = next[0].t;
          return next.filter((n) => Math.abs(n.t - t0) < 0.03).map((n) => n.midi);
        } : undefined;
        rows.push({ cond, mode, s: score(sc.name, sc.notes, detect(x, an, exp), minConf) });
      }
    }
  }
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
  const med = (v: number[]) => (v.length ? Math.round([...v].sort((a, b) => a - b)[v.length >> 1]) : NaN);
  console.log(`analyzer: ${which}`);
  console.log('scenario'.padEnd(34), 'room'.padEnd(11), 'mode'.padEnd(7), 'heard'.padStart(7), 'unsure'.padStart(7), 'missed'.padStart(7), 'wrong'.padStart(6), ' onset ms');
  for (const { cond, mode, s } of rows) console.log(s.name.padEnd(34), cond.padEnd(11), mode.padEnd(7), pct(s.confident, s.labelled).padStart(7), pct(s.uncertain, s.labelled).padStart(7), pct(s.missed, s.labelled).padStart(7), String(s.wrong).padStart(6), ` ${med(s.latency)}`);
  for (const mode of ['free', 'lesson']) for (const cond of ['quiet room', 'noisy room', 'far, echoey']) {
    const r = rows.filter((x) => x.mode === mode && x.cond === cond).map((x) => x.s);
    const singlesOnly = r.filter((s) => !/chord|triad|octave|hands/.test(s.name));
    const L = r.reduce((a, s) => a + s.labelled, 0), C = r.reduce((a, s) => a + s.confident, 0), U = r.reduce((a, s) => a + s.uncertain, 0), W = r.reduce((a, s) => a + s.wrong, 0);
    const Ls = singlesOnly.reduce((a, s) => a + s.labelled, 0), Cs = singlesOnly.reduce((a, s) => a + s.confident, 0);
    console.log(`TOTAL ${mode.padEnd(6)} ${cond.padEnd(10)}  all notes heard ${pct(C, L)} (unsure ${pct(U, L)}, wrong ${W})   single-note passages heard ${pct(Cs, Ls)}`);
  }
}
if (!process.env.NO_MAIN) void main();
