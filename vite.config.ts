import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { writeFile, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Put the latest Android test build next to the site (…/Maestro.apk), so phones download it from the same
// fast host as the app instead of a redirect. Skipped quietly when offline.
const APK_URL = 'https://github.com/juliusklahai/Auxa-academy/releases/download/android-test/Maestro.apk';
function androidApk(): Plugin {
  let out = 'dist';
  return {
    name: 'maestro-android-apk', apply: 'build',
    configResolved(c) { out = c.build.outDir; },
    async closeBundle() {
      if (process.env.MAESTRO_NO_APK === '1' || (process.env.MAESTRO_APK !== '1' && !process.env.GITHUB_ACTIONS)) return;
      try {
        const r = await fetch(APK_URL, { redirect: 'follow' });
        if (!r.ok) return;
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 10000 && b[0] === 0x50 && b[1] === 0x4b) { await writeFile(join(out, 'Maestro.apk'), b); await writeFile(join(out, 'Auxa.apk'), b); }
      } catch { /* offline: no APK in this build */ }
    },
  };
}

// The sheet scanner's ONNX runtime: serve it in dev and copy it next to the models in builds,
// so it loads only when someone scans (and the Android app fetches it from the website).
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
function ortRuntime(): Plugin {
  let out = 'dist';
  return {
    name: 'auxa-ort-runtime',
    configResolved(c) { out = c.build.outDir; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = ORT_FILES.find((x) => req.url?.split('?')[0].endsWith('/omr/' + x));
        if (!f) return next();
        res.setHeader('Content-Type', f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(join('node_modules/onnxruntime-web/dist', f)).pipe(res);
      });
    },
    async closeBundle() {
      await mkdir(join(out, 'omr'), { recursive: true });
      for (const f of ORT_FILES) await copyFile(join('node_modules/onnxruntime-web/dist', f), join(out, 'omr', f));
      // Vite also copies the runtime into assets/ because ONNX Runtime points at it; the worker loads omr/ instead
      for (const f of await readdir(join(out, 'assets')).catch(() => [] as string[])) if (/^ort-wasm.*\.wasm$/.test(f)) await rm(join(out, 'assets', f));
    },
  };
}

// `npm run build`        -> dist/ (installable PWA with service worker, for hosting or localhost)
// `npm run build:single` -> dist-single/index.html (one self-contained file, opens offline)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), androidApk(), ortRuntime()],
  publicDir: mode === 'single' ? false : 'public',
  worker: { format: 'es' },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
  test: { globals: true, environment: 'node' },
}));
