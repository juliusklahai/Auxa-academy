// Main-thread side of the sheet scanner: turn PDFs and photos into grey pages and talk to the worker.
import { isNativeApp } from '../native/bridge';
import type { FromWorker, ToWorker } from './worker';
import type { Gray } from './segment';

const LIVE_SITE = 'https://juliusklahai.github.io/Auxa-academy/';
/** The Android app loads the reader from the website, so the app download stays small. */
export const readerBase = () => (isNativeApp ? LIVE_SITE : new URL(import.meta.env.BASE_URL, location.href).href);
export const PAGE_WIDTH = 2100; // an A4 page at 10 px per mm, the size the reader was trained on

export interface PageImage { name: string; gray: Gray; thumb: string }

function toGray(src: CanvasImageSource, w0: number, h0: number): { gray: Gray; thumb: string } {
  const s = PAGE_WIDTH / w0, w = PAGE_WIDTH, h = Math.round(h0 * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, px = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  const t = document.createElement('canvas'); t.width = 360; t.height = Math.round((h * 360) / w);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return { gray: { w, h, px }, thumb: t.toDataURL('image/jpeg', 0.7) };
}

/** Every page of every file, as grey pictures 2100 px wide. */
export async function loadPages(files: File[], onPage?: (n: number) => void): Promise<PageImage[]> {
  const out: PageImage[] = [];
  for (const f of files) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
        const page = await doc.getPage(p);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: PAGE_WIDTH / vp0.width });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: x, viewport: vp }).promise;
        out.push({ name: `${f.name} p${p}`, ...toGray(c, c.width, c.height) });
        onPage?.(out.length);
      }
    } else {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      out.push({ name: f.name, ...toGray(bmp, bmp.width, bmp.height) });
      bmp.close();
      onPage?.(out.length);
    }
  }
  return out;
}

export interface ScanEvents {
  onLoading?: (got: number, total: number) => void;
  onLayout?: (e: Extract<FromWorker, { type: 'layout' }>) => void;
  onProgress?: (system: number, tokens: number) => void;
  onSystem?: (system: number, kern: string, ms: number) => void;
}

/** One worker for the whole scanning session; the reader is downloaded once and then cached. */
export class Scanner {
  private w: Worker | null = null;
  private ready: Promise<void> | null = null;
  private ev: ScanEvents = {};
  private waiters = new Map<number, { res: () => void; rej: (e: Error) => void }>();
  private n = 0;

  private worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'loading') this.ev.onLoading?.(m.got, m.total);
      else if (m.type === 'layout') this.ev.onLayout?.(m);
      else if (m.type === 'progress') this.ev.onProgress?.(m.system, m.tokens);
      else if (m.type === 'system') this.ev.onSystem?.(m.system, m.kern, m.ms);
      else if (m.type === 'done') { this.waiters.get(m.id)?.res(); this.waiters.delete(m.id); }
      else if (m.type === 'error') {
        const err = new Error(m.message);
        if (m.id !== undefined) { this.waiters.get(m.id)?.rej(err); this.waiters.delete(m.id); }
        else this.waiters.get(-1)?.rej(err);
      } else if (m.type === 'ready') { this.waiters.get(-1)?.res(); this.waiters.delete(-1); }
    };
    return this.w;
  }
  private send(m: ToWorker, t: Transferable[] = []) { this.worker().postMessage(m, t); }

  load(ev: ScanEvents = {}): Promise<void> {
    this.ev = { ...this.ev, ...ev };
    if (!this.ready) {
      this.ready = new Promise<void>((res, rej) => { this.waiters.set(-1, { res, rej }); this.send({ type: 'init', base: readerBase() }); });
      this.ready.catch(() => { this.ready = null; });
    }
    return this.ready;
  }

  async read(page: Gray, ev: ScanEvents): Promise<void> {
    await this.load();
    this.ev = { ...this.ev, ...ev };
    const id = ++this.n;
    const px = page.px.slice();
    return new Promise<void>((res, rej) => { this.waiters.set(id, { res, rej }); this.send({ type: 'page', id, gray: px, w: page.w, h: page.h }, [px.buffer]); });
  }

  cancel() { this.send({ type: 'cancel' }); }
  dispose() { this.w?.terminate(); this.w = null; this.ready = null; }
}
