// Footer wordmark drawn as a field of small dashes. Dashes inside the letters are bright, the rest faint.
// Near the pointer (mouse or finger) they turn to point away from it, light up and grow, then ease back.
import { useEffect, useRef } from 'react';
import { AUXA_PATHS, WORD_BOX } from './brandPaths';

const REST = -Math.PI / 3; // "/" at rest

/** text: a word to draw; 'auxa-logo' draws the Auxa wordmark (swoosh dashes in cyan) */
export function DashField({ text, dark }: { text: string; dark: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let W = 0, H = 0, cell = 13, cols = 0, rows = 0;
    let inside: Uint8Array = new Uint8Array(0);
    let ang: Float32Array = new Float32Array(0), glow: Float32Array = new Float32Array(0);
    const ptr = { x: -9999, y: -9999, on: false };
    let raf = 0, running = false, visible = false;

    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = W < 600 ? 9 : W < 1000 ? 11 : 13;
      cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);
      // the wordmark shape, sampled once per cell
      const off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      const o = off.getContext('2d')!;
      if (text === 'auxa-logo') {
        // the Auxa wordmark alone, as big as the strip allows
        const ar = WORD_BOX.w / WORD_BOX.h;
        const h = Math.min(rows * 0.84, (cols * 0.92) / ar);
        const x = (cols - ar * h) / 2, y = (rows - h) / 2, k = h / WORD_BOX.h;
        o.setTransform(k, 0, 0, k, x - WORD_BOX.x * k, y - WORD_BOX.y * k);
        o.fillStyle = 'rgb(0,0,255)'; o.fill(new Path2D(AUXA_PATHS.dark_word), 'evenodd');
        o.fillStyle = 'rgb(255,0,0)'; o.fill(new Path2D(AUXA_PATHS.word_cyan), 'evenodd');
        o.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        o.fillStyle = '#000';
        let size = rows * 0.92;
        o.font = `600 ${size}px Geist, 'Helvetica Neue', Arial, sans-serif`;
        const wGoal = cols * 0.92;
        const m = o.measureText(text).width;
        if (m > wGoal) { size *= wGoal / m; o.font = `600 ${size}px Geist, 'Helvetica Neue', Arial, sans-serif`; }
        o.textAlign = 'center'; o.textBaseline = 'alphabetic';
        o.fillText(text, cols / 2, rows * 0.5 + size * 0.36);
      }
      const px = o.getImageData(0, 0, cols, rows).data;
      inside = new Uint8Array(cols * rows);
      // 1 = ink (navy) part, 2 = the cyan swoosh
      for (let i = 0; i < cols * rows; i++) inside[i] = px[i * 4 + 3] > 110 ? (px[i * 4] > 140 ? 2 : 1) : 0;
      ang = new Float32Array(cols * rows).fill(REST);
      glow = new Float32Array(cols * rows);
      draw(true);
    };

    /** one frame; returns true while anything is still moving. Dashes are grouped into a few
     *  brightness levels and each level is drawn as ONE path (thousands of strokes → ~16). */
    const LEVELS = 16;
    const paths: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
    const cyanPaths: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
    const draw = (force = false) => {
      const dk = darkRef.current;
      const ink = dk ? '255,255,255' : '24,24,27';
      ctx.clearRect(0, 0, W, H);
      const R = Math.max(110, Math.min(200, W * 0.13));
      const R2 = R * R;
      let moving = force;
      for (let k = 0; k < LEVELS; k++) { paths[k] = new Path2D(); cyanPaths[k] = new Path2D(); }
      const half = cell * 0.24;        // short dashes at rest
      const grow = cell * 0.1;         // a little longer near the pointer
      for (let r = 0; r < rows; r++) {
        const y = r * cell + cell / 2;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = c * cell + cell / 2;
          let target = REST, g = 0;
          if (ptr.on) {
            const dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy;
            if (d2 < R2) { const w = 1 - Math.sqrt(d2) / R; g = w * w * (3 - 2 * w); target = Math.atan2(dy, dx); }
          }
          // turn the short way round (a dash looks the same every half turn)
          let da = target - ang[i];
          da = ((da + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
          if (da > 0.003 || da < -0.003) { ang[i] += da * (g > 0 ? 0.22 : 0.1); moving = true; }
          const dg = g - glow[i];
          if (dg > 0.004 || dg < -0.004) { glow[i] += dg * (dg > 0 ? 0.3 : 0.09); moving = true; }
          const gl = glow[i];
          const base = inside[i] ? (dk ? 0.6 : 0.68) : (dk ? 0.07 : 0.09);
          const a = Math.min(1, base + gl * (inside[i] ? 0.4 : 0.7));
          if (a < 0.03) continue;
          const len = half + gl * grow;
          const cx = Math.cos(ang[i]) * len, cy = Math.sin(ang[i]) * len;
          const path = (inside[i] === 2 ? cyanPaths : paths)[Math.min(LEVELS - 1, Math.round(a * (LEVELS - 1)))];
          path.moveTo(x - cx, y - cy); path.lineTo(x + cx, y + cy);
        }
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = cell < 11 ? 1.1 : 1.3;
      for (let k = 1; k < LEVELS; k++) {
        ctx.strokeStyle = `rgba(${ink},${(k / (LEVELS - 1)).toFixed(3)})`;
        ctx.stroke(paths[k]);
        ctx.strokeStyle = `rgba(${dk ? '20,226,220' : '0,150,170'},${Math.min(1, (k / (LEVELS - 1)) * 1.15).toFixed(3)})`;
        ctx.stroke(cyanPaths[k]);
      }
      return moving;
    };

    const loop = () => {
      const moving = draw();
      if (moving && visible) raf = requestAnimationFrame(loop);
      else running = false;
    };
    const kick = () => { if (!running && visible) { running = true; raf = requestAnimationFrame(loop); } };

    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true; kick(); };
    const leave = () => { ptr.on = false; kick(); };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', move);
    cv.addEventListener('pointerleave', leave);
    cv.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); });
    cv.addEventListener('pointercancel', leave);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); });
    io.observe(cv);
    const ro = new ResizeObserver(() => layout());
    ro.observe(cv);
    document.fonts?.ready.then(() => layout()).catch(() => {});
    layout();
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerdown', move); cv.removeEventListener('pointerleave', leave); };
  }, [text]);

  // redraw in the new colours when the theme changes
  useEffect(() => { ref.current?.dispatchEvent(new PointerEvent('pointerleave')); }, [dark]);

  return <canvas ref={ref} className="lp-dashfield" aria-hidden />;
}
