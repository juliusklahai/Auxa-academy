// Live pitch curve for singing: your voice as a line against the target notes.
// Green inside the tolerance, amber close, red off; grey when the pitch is unclear.

import { useEffect, useRef } from 'react';
import { freqToMidiFloat, midiToName } from '../core/music';
import { audio } from '../audio/engine';
import { mic, type MicFrame } from '../input/mic';

export interface RollTarget { midi: number; startMs: number; endMs: number } // perf.now() based

interface Props {
  /** Targets in absolute performance.now() ms; or a single "hold" target for wait mode / pitch matching. */
  targets: () => RollTarget[];
  hold?: () => number | null;
  octaveFree?: boolean;
  height?: number;
  tolerance?: number; // cents
}

export function PitchRoll({ targets, hold, octaveFree = true, height = 170, tolerance = 30 }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const trace = useRef<{ t: number; m: number | null; ok: number }[]>([]);
  const latest = useRef({ targets, hold });
  latest.current = { targets, hold };

  useEffect(() => {
    const onFrame = (f: MicFrame) => {
      const t = performance.now();
      let m: number | null = f.freq > 0 && f.confidence >= 0.8 && f.rms > mic.settings.noiseGate ? freqToMidiFloat(f.freq, audio.a4) : null;
      let ok = -1;
      if (m !== null) {
        const h = latest.current.hold?.();
        const tg = h ?? latest.current.targets().find((x) => t >= x.startMs - 150 && t <= x.endMs + 150)?.midi;
        if (tg !== undefined && tg !== null) {
          if (octaveFree) m = m + 12 * Math.round((tg - m) / 12);
          const c = Math.abs(m - tg) * 100;
          ok = c <= tolerance ? 2 : c <= 60 ? 1 : 0;
        }
      }
      trace.current.push({ t, m, ok });
      if (trace.current.length > 600) trace.current.shift();
    };
    mic.frameListeners.add(onFrame);
    let raf = 0;
    const draw = () => {
      const c = cv.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const W = c.clientWidth, H = height;
        if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
        const x = c.getContext('2d')!;
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, W, H);
        const now = performance.now();
        const past = 4000, future = 2000, nowX = W * (past / (past + future));
        const tx = (t: number) => nowX + ((t - now) / (past + future)) * W;
        const h = latest.current.hold?.();
        const tg = latest.current.targets();
        const ms = [...tg.map((t) => t.midi), ...(h ? [h] : [])];
        const center = ms.length ? (Math.min(...ms) + Math.max(...ms)) / 2 : 62;
        const span = Math.max(14, ms.length ? Math.max(...ms) - Math.min(...ms) + 8 : 14);
        const lo = center - span / 2;
        const ty = (m: number) => H - ((m - lo) / span) * H;
        // grid: semitone lines, C labelled
        x.font = '600 10px Manrope, system-ui, sans-serif';
        for (let m = Math.ceil(lo); m <= lo + span; m++) {
          x.strokeStyle = m % 12 === 0 ? 'rgba(31,31,29,.18)' : 'rgba(31,31,29,.06)';
          x.beginPath(); x.moveTo(0, ty(m)); x.lineTo(W, ty(m)); x.stroke();
          if (m % 12 === 0) { x.fillStyle = 'rgba(31,31,29,.45)'; x.fillText(midiToName(m), 6, ty(m) - 3); }
        }
        // targets
        const bar = (m: number, a: number, b: number, live: boolean) => {
          const y = ty(m), bh = Math.max(8, H / span * 0.9);
          x.fillStyle = live ? 'rgba(227,245,58,.85)' : 'rgba(31,31,29,.12)';
          x.strokeStyle = 'rgba(31,31,29,.55)';
          const r = bh / 2;
          x.beginPath(); x.roundRect?.(a, y - r, Math.max(bh, b - a), bh, r); x.fill(); x.stroke();
          x.fillStyle = '#1f1f1d'; x.fillText(midiToName(m), a + 6, y + 3.5);
        };
        if (h) bar(h, 0, W, true);
        for (const t of tg) { const a = tx(t.startMs), b = tx(t.endMs); if (b > 0 && a < W) bar(t.midi, a, b, now >= t.startMs && now <= t.endMs); }
        // now line
        x.strokeStyle = 'rgba(20,184,166,.9)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(nowX, 0); x.lineTo(nowX, H); x.stroke();
        // your voice
        x.lineWidth = 3; x.lineCap = 'round';
        const pts = trace.current.filter((p) => p.t > now - past);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (a.m === null || b.m === null || Math.abs(a.m - b.m) > 1.5) continue;
          x.strokeStyle = b.ok === 2 ? '#1e8a4c' : b.ok === 1 ? '#d69e2e' : b.ok === 0 ? '#c53030' : '#6b6b66';
          x.beginPath(); x.moveTo(tx(a.t), ty(a.m)); x.lineTo(tx(b.t), ty(b.m)); x.stroke();
        }
        const lastP = pts[pts.length - 1];
        if (lastP && lastP.m !== null && now - lastP.t < 200) {
          x.fillStyle = lastP.ok === 2 ? '#1e8a4c' : lastP.ok === 1 ? '#d69e2e' : lastP.ok === 0 ? '#c53030' : '#6b6b66';
          x.beginPath(); x.arc(nowX, ty(lastP.m), 6, 0, Math.PI * 2); x.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { mic.frameListeners.delete(onFrame); cancelAnimationFrame(raf); };
  }, [height, octaveFree, tolerance]);

  return <canvas ref={cv} className="pitch-roll" style={{ height }} aria-label="Live pitch of your voice against the target notes" />;
}
