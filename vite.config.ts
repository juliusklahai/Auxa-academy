import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { writeFile } from 'node:fs/promises';
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
      if (process.env.MAESTRO_APK !== '1' && !process.env.GITHUB_ACTIONS) return;
      try {
        const r = await fetch(APK_URL, { redirect: 'follow' });
        if (!r.ok) return;
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 10000 && b[0] === 0x50 && b[1] === 0x4b) { await writeFile(join(out, 'Maestro.apk'), b); await writeFile(join(out, 'Auxa.apk'), b); }
      } catch { /* offline: no APK in this build */ }
    },
  };
}

// `npm run build`        -> dist/ (installable PWA with service worker, for hosting or localhost)
// `npm run build:single` -> dist-single/index.html (one self-contained file, opens offline)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), androidApk()],
  publicDir: mode === 'single' ? false : 'public',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
  test: { globals: true, environment: 'node' },
}));
