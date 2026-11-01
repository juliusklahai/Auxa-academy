// The 3D virtual pianist over the keyboard (loaded on demand: it pulls in Three.js).
// One transparent WebGL canvas covers the keys and the palm space below them; the hands are driven by
// the same clock as the audio (seconds on the exercise timeline), so pausing, seeking, looping,
// restarting and tempo changes are followed automatically. Without a running clock (wait mode, before
// start) the hands prepare over the current notes and, when asked, demonstrate the press in a loop.

import { useEffect, useMemo, useRef } from 'react';
import type { Hand, ScoreEvent } from '../core/types';
import { AnimationBridge, HOVER, KEY_DIP, WHITE_MM } from '../hands3d/bridge';
import { HandPoser } from '../hands3d/pose';
import { HandScene, type HandStyle } from '../hands3d/render';
import type { PianoGeom } from './Piano';

export interface Hands3DProps {
  g: PianoGeom;
  below: number;
  events: ScoreEvent[];
  fingering: number[][];
  /** seconds from the exercise start for a beat position */
  timeOf: (beat: number) => number;
  /** changes whenever timeOf changes (tempo, tempo map) */
  timeKey: string | number;
  /** current time on the exercise clock (seconds), or null when nothing is playing */
  clock: () => number | null;
  index: number;
  /** demonstrate the current notes (step mode) */
  demo: boolean;
  /** after a mistake: highlight the correct finger(s) and show the press */
  correction: boolean;
  style: HandStyle;
  show: 'both' | Hand;
  showFingering: boolean;
  onFail: () => void;
}

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export default function Hands3D(p: Hands3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HandScene | null>(null);
  const props = useRef(p);
  props.current = p;
  const k = p.g.whiteW / WHITE_MM;
  const H = p.g.height;
  const dirty = useRef(true);

  const bridge = useMemo(
    () => new AnimationBridge(p.events, p.fingering, p.timeOf, { x: (m) => p.g.keyX(m) / k, whiteLen: H / k, blackLen: (H * 0.62) / k }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.events, p.fingering, p.timeKey, p.g.width, H, p.g.whites[0]],
  );
  const posers = useRef({ RH: new HandPoser(), LH: new HandPoser() });
  const state = useRef({ tv: -1, phase: 0, last: performance.now(), settled: 0 });

  // create the WebGL scene once
  useEffect(() => {
    try {
      sceneRef.current = new HandScene(canvas.current!);
    } catch {
      props.current.onFail();
      return;
    }
    const sc = sceneRef.current;
    const onLost = (e: Event) => { e.preventDefault(); props.current.onFail(); };
    canvas.current!.addEventListener('webglcontextlost', onLost);
    return () => { canvas.current?.removeEventListener('webglcontextlost', onLost); sc.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    sceneRef.current?.resize(p.g.width, H + p.below, H, k);
    sceneRef.current?.setStyle(p.style);
    dirty.current = true;
  }, [p.g.width, H, p.below, k, p.style.opacity, p.style.color, p.style.stroke, p.style.outline]); // eslint-disable-line

  useEffect(() => { dirty.current = true; posers.current.RH.reset(); posers.current.LH.reset(); state.current.tv = -1; }, [bridge]);
  useEffect(() => { dirty.current = true; }, [p.index, p.demo, p.correction, p.show, p.showFingering]);

  // animation loop: 60 fps while something moves, idle otherwise
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const sc = sceneRef.current;
      if (!sc) return;
      const P = props.current;
      const st = state.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - st.last) / 1000);
      st.last = now;
      let t = P.clock();
      let pulse = 0;
      const running = t !== null;
      const evIdx = Math.max(0, Math.min(P.index, P.events.length - 1));
      const evT = bridge.timeOfEvent(evIdx) ?? 0;
      if (t === null) {
        // step mode: glide to "prepared over the current notes"
        const prepared = evT - 0.08;
        if (st.tv < -0.5 || Math.abs(prepared - st.tv) > 2.5) st.tv = prepared - 0.25;
        st.tv += (prepared - st.tv) * Math.min(1, dt * 6);
        t = st.tv;
        const near = Math.abs(prepared - st.tv) < 0.01;
        if ((P.demo || P.correction) && near) {
          st.phase = (st.phase + dt) % 1.6;
          pulse = st.phase < 0.7 ? Math.sin((Math.PI * st.phase) / 0.7) : 0;
          pulse = smooth(pulse * 1.15);
        } else st.phase = 0;
        if (near && !P.demo && !P.correction) st.settled++; else st.settled = 0;
        if (st.settled > 30 && !dirty.current) return; // nothing changes: do not burn the battery
      }
      dirty.current = false;
      const showHand = (h: Hand) => bridge.present[h] && (P.show === 'both' || P.show === h);
      const lab = labels.current;
      (['RH', 'LH'] as Hand[]).forEach((h) => {
        if (!showHand(h)) { sc.update(h, null); if (lab) for (let f = 0; f < 5; f++) (lab.children[(h === 'RH' ? 0 : 5) + f] as HTMLElement).style.opacity = '0'; return; }
        const a = bridge.at(h, t!);
        const cur = new Set(bridge.notes[h].filter((n) => n.ev === evIdx).map((n) => n.finger));
        if (pulse > 0) a.fingers.forEach((f, i) => {
          if (!cur.has(i + 1) || f.w < 0.5) return;
          f.press = Math.max(f.press, pulse);
          f.target = [f.target[0], f.target[1], f.target[2] - (HOVER + KEY_DIP) * pulse];
        });
        const pose = posers.current[h].pose(a, running ? 0.35 : 0.3);
        sc.update(h, pose, a.yaw);
        const fix = [0, 1, 2, 3, 4].map((i) => (P.correction && cur.has(i + 1) ? 0.75 + 0.25 * pulse : 0));
        sc.setHighlight(h, pose.press.map((x, i) => (fix[i] ? 0 : x)), fix);
        if (lab) a.fingers.forEach((f, i) => {
          const el = lab.children[(h === 'RH' ? 0 : 5) + i] as HTMLElement;
          const vis = P.showFingering ? Math.max(f.press, (P.demo || P.correction) && cur.has(i + 1) ? 1 : 0, f.w > 0.6 ? 0.85 : 0) : 0;
          el.style.opacity = vis ? String(Math.min(1, vis)) : '0';
          if (!vis) return;
          const [x, y] = sc.toPx(h, pose.tips[i]);
          el.style.transform = `translate(${x.toFixed(1)}px, ${(y + 14).toFixed(1)}px)`;
          el.classList.toggle('fix', !!fix[i]);
          el.classList.toggle('on', f.press > 0.5);
        });
      });
      sc.render();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bridge]);

  const h = H + p.below;
  return (
    <div className="hands3d" style={{ width: p.g.width, height: h }} aria-hidden>
      <canvas ref={canvas} style={{ width: p.g.width, height: h, WebkitMaskImage: `linear-gradient(#000 ${H + p.below * 0.55}px, transparent ${h}px)`, maskImage: `linear-gradient(#000 ${H + p.below * 0.55}px, transparent ${h}px)` }} />
      <div ref={labels} className="fing-labels">
        {(['RH', 'LH'] as Hand[]).flatMap((hand) => [1, 2, 3, 4, 5].map((f) => <span key={hand + f} className={`fing ${hand}`}>{f}</span>))}
      </div>
    </div>
  );
}
