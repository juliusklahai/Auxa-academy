// A looping hand demonstration on a keyboard, for teaching steps about the body (hand shape, arm
// weight, thumb under...). Silent while the coach talks; "Hear it" restarts it with sound in sync.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { demoScript, type DemoId } from '../hands3d/demos';
import { audio } from '../audio/engine';
import { Piano, type KeyMark } from './Piano';
import { HANDS_MIN_ASPECT, handsBelow } from './HandsLayer';
import { useSettings } from './settings';

const Hands3D = lazy(() => import('./Hands3D'));

/** Notes of a demo as audio events (velocity per note when the script has one). */
export function playDemo(id: DemoId) {
  const d = demoScript(id);
  audio.stopAll();
  let i = 0;
  for (const e of d.events) {
    const v = d.vel?.(i++) ?? 0.7;
    audio.playNotes(e.pitches.map((m) => ({ midi: m, startMs: e.beat * 1000, durMs: Math.max(80, e.beats * 1000) })), v);
  }
}

export function TeachDemo({ id, restart }: { id: DemoId; restart: number }) {
  const s = useSettings();
  const d = useMemo(() => demoScript(id), [id]);
  const start = useRef(performance.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => { start.current = performance.now(); }, [id, restart]);
  const clock = () => ((performance.now() - start.current) / 1000) % d.loop;
  // keys go down with the fingers, sound or not
  const [down, setDown] = useState<number[]>([]);
  useEffect(() => {
    let raf = 0, last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock();
      const now = d.events.filter((e) => t >= e.beat && t < e.beat + e.beats).flatMap((e) => e.pitches);
      const k = now.join(',');
      if (k !== last) { last = k; setDown(now); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [d]); // eslint-disable-line
  const marks = new Map<number, KeyMark>(down.map((m) => [m, 'demo']));
  const webgl = !failed;
  return (
    <div className="teach-demo">
      <p className="teach-demo-cap"><b>Watch the hands.</b> {d.caption}</p>
      <Piano lo={d.lo} hi={d.hi} scrollTo={Math.round((d.lo + d.hi) / 2)} marks={marks} labels={s.labels} maxKeyWidth={58} minKeyWidth={20}
        below={webgl ? (w) => handsBelow(w) : 0} minAspect={webgl ? HANDS_MIN_ASPECT : 0}
        overlay={webgl ? (g) => (
          <Suspense fallback={null}>
            <Hands3D g={g} below={handsBelow(g.whiteW)} events={d.events} fingering={d.fingering} timeOf={(b) => b} timeKey={id} clock={clock}
              index={0} demo={false} correction={false} style={{ opacity: s.handOpacity, color: s.handColor, stroke: s.handStroke, outline: true }}
              show="both" showFingering={d.labels || s.fingers} onFail={() => setFailed(true)} lift={d.lift} />
          </Suspense>
        ) : undefined} />
    </div>
  );
}
