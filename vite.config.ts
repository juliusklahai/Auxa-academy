import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ (installable PWA with service worker, for hosting or localhost)
// `npm run build:single` -> dist-single/index.html (one self-contained file, opens offline)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  publicDir: mode === 'single' ? false : 'public',
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
  test: { globals: true, environment: 'node' },
}));
