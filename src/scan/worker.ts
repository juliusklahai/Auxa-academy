/// <reference lib="webworker" />
// Runs the sheet reader off the main thread: page clean-up, finding the lines of music, and the
// neural reader (Sheet Music Transformer, MIT licence) through ONNX Runtime Web. Nothing leaves the device.
import * as ort from 'onnxruntime-web/wasm';
import { crop, prepare, type Gray, type System } from './segment';

export type ToWorker =
  | { type: 'init'; base: string }
  | { type: 'page'; id: number; gray: Uint8Array; w: number; h: number }
  | { type: 'cancel' };
export type FromWorker =
  | { type: 'loading'; got: number; total: number }
  | { type: 'ready' }
  | { type: 'layout'; id: number; systems: (Omit<System, 'staves'> & { staves: number; gap: number })[]; page: { w: number; h: number; px: Uint8Array } }
  | { type: 'progress'; id: number; system: number; tokens: number }
  | { type: 'system'; id: number; system: number; kern: string; ms: number }
  | { type: 'done'; id: number }
  | { type: 'error'; id?: number; message: string };

const post = (m: FromWorker, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t ?? []);
let enc: ort.InferenceSession | null = null;
let step: ort.InferenceSession | null = null;
let vocab: { i2w: string[]; bos: number; maxlen: number } | null = null;
let cancelled = false;
const MAX_TOKENS = 2500; // one line of music is rarely over 1000

async function fetchAll(urls: string[]): Promise<ArrayBuffer[]> {
  // download with progress so the first scan can show how much is left
  const res = await Promise.all(urls.map((u) => fetch(u)));
  res.forEach((r, i) => { if (!r.ok) throw new Error(`Could not download the reader (${urls[i].split('/').pop()}: ${r.status})`); });
  const total = res.reduce((a, r) => a + Number(r.headers.get('content-length') || 0), 0);
  let got = 0;
  return Promise.all(res.map(async (r) => {
    if (!r.body) return r.arrayBuffer();
    const rd = r.body.getReader(), parts: Uint8Array[] = [];
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; post({ type: 'loading', got, total }); }
    const n = parts.reduce((a, p) => a + p.length, 0), all = new Uint8Array(n);
    let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    return all.buffer;
  }));
}

async function init(base: string) {
  if (enc) { post({ type: 'ready' }); return; }
  ort.env.wasm.wasmPaths = base + 'omr/';
  ort.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const [e, s, v] = await fetchAll([base + 'omr/v1/enc.onnx', base + 'omr/v1/step.onnx', base + 'omr/v1/vocab.json']);
  vocab = JSON.parse(new TextDecoder().decode(v));
  const opt: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  enc = await ort.InferenceSession.create(new Uint8Array(e), opt);
  step = await ort.InferenceSession.create(new Uint8Array(s), opt);
  post({ type: 'ready' });
}

async function readSystem(img: Gray, onTick: (n: number) => void): Promise<string> {
  const px = new Float32Array(img.w * img.h);
  for (let i = 0; i < px.length; i++) px[i] = img.px[i] / 255;
  const eo = await enc!.run({ image: new ort.Tensor('float32', px, [1, 1, img.h, img.w]) });
  const ck = eo.ck, cv = eo.cv;
  let pk: ort.Tensor = new ort.Tensor('float32', new Float32Array(0), [8, 4, 0, 64]);
  let pv: ort.Tensor = new ort.Tensor('float32', new Float32Array(0), [8, 4, 0, 64]);
  const V = vocab!;
  let tok = V.bos;
  const out: string[] = [];
  for (let pos = 0; pos < Math.min(V.maxlen - 1, MAX_TOKENS); pos++) {
    if (cancelled) throw new Error('cancelled');
    const r = await step!.run({ tok: new ort.Tensor('int64', BigInt64Array.from([BigInt(tok)]), [1]), pos: new ort.Tensor('int64', BigInt64Array.from([BigInt(pos)]), [1]), ck, cv, pk, pv });
    const lg = r.logits.data as Float32Array;
    let best = 0;
    for (let i = 1; i < lg.length; i++) if (lg[i] > lg[best]) best = i;
    pk.dispose?.(); pv.dispose?.();
    pk = r.nk as ort.Tensor; pv = r.nv as ort.Tensor;
    r.logits.dispose?.();
    tok = best;
    const w = V.i2w[best];
    if (w === '<eos>') break;
    out.push(w);
    if (pos % 16 === 0) onTick(pos);
  }
  ck.dispose?.(); cv.dispose?.(); pk.dispose?.(); pv.dispose?.();
  return out.join('').replace(/<b>/g, '\n').replace(/<s>/g, ' ').replace(/<t>/g, '\t');
}

async function page(id: number, g: Gray) {
  const prep = prepare(g);
  const sys = prep.systems;
  const view = { w: prep.page.w, h: prep.page.h, px: prep.page.px.slice() };
  post({ type: 'layout', id, systems: sys.map((s) => ({ ...s, staves: s.staves.length, gap: s.staves[0].gap })), page: view }, [view.px.buffer]);
  for (let i = 0; i < sys.length; i++) {
    const t0 = performance.now();
    const kern = await readSystem(crop(prep.page, sys[i]), (n) => post({ type: 'progress', id, system: i, tokens: n }));
    post({ type: 'system', id, system: i, kern, ms: Math.round(performance.now() - t0) });
  }
  post({ type: 'done', id });
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    if (m.type === 'init') await init(m.base);
    else if (m.type === 'cancel') cancelled = true;
    else if (m.type === 'page') { cancelled = false; await page(m.id, { w: m.w, h: m.h, px: m.gray }); }
  } catch (e) {
    post({ type: 'error', id: m.type === 'page' ? m.id : undefined, message: (e as Error).message });
  }
};
