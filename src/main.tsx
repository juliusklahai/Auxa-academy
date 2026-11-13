import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import fontUrl from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';
import App from './App';
import { audio } from './audio/engine';
// diagnostics hook (read-only use in tests and the browser console)
(window as unknown as { maestroAudio: typeof audio }).maestroAudio = audio;
import './styles.css';
import './landing.css';
import './app-theme.css';
import './ui/theme';
import { installTooltips } from './ui/tooltip';
installTooltips();

// Bundled font (works offline, inlined in the single-file build)
try {
  const face = new FontFace('Manrope', `url(${fontUrl}) format('woff2')`, { weight: '200 800' });
  face.load().then((f) => document.fonts.add(f)).catch(() => {});
} catch { /* older browsers fall back to system fonts */ }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline support when served over http(s) (npm run build / preview). The single-file build needs no service worker.
// (not inside the phone app: it carries its own copy of every file)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV && !location.hostname.startsWith('appassets.')) {
  fetch('./sw.js', { method: 'HEAD' }).then((r) => { if (r.ok) navigator.serviceWorker.register('./sw.js').catch(() => {}); }).catch(() => {});
}
