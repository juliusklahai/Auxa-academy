// Guide hands for any keyboard: picks the 3D virtual pianist (default) or the older line drawing,
// plans fingering (MusicXML fingering and the learner's corrections win), and offers the Hands panel:
// style, opacity, colour, stroke thickness, which hands, fingering numbers and fingering correction.

import { lazy, Suspense, useMemo, useState, useSyncExternalStore } from 'react';
import type { ScoreEvent } from '../core/types';
import { midiToName } from '../core/music';
import { loadOverrides, overridesToGiven, planFingering, saveOverride, handOfPitch } from '../hands3d/fingering';
import { computeHandStates, HandsOverlay } from './Hands';
import type { PianoGeom } from './Piano';
import { setSettings, useSettings } from './settings';
import { Icon } from './Icon';

const Hands3D = lazy(() => import('./Hands3D'));

/** Palm space under the keys: about 95 mm of hand at the keyboard's scale. */
export const handsBelow = (whiteW: number) => Math.round(Math.max(70, Math.min(190, (78 * whiteW) / 23.5)));
/** Keep keys long enough for real-proportion hands. */
export const HANDS_MIN_ASPECT = 4.4;

// fingering corrections live in localStorage; a tiny store lets the panel and the hands share them
let fingVersion = 0;
const fingSubs = new Set<() => void>();
const bumpFing = () => { fingVersion++; fingSubs.forEach((f) => f()); };
const useFingVersion = () => useSyncExternalStore((cb) => { fingSubs.add(cb); return () => fingSubs.delete(cb); }, () => fingVersion);

export function useFingering(events: ScoreEvent[], exerciseId: string): number[][] {
  const v = useFingVersion();
  return useMemo(() => planFingering(events, overridesToGiven(events, loadOverrides(exerciseId))), [events, exerciseId, v]);
}

let webglOk: boolean | null = null;
function hasWebGL() {
  if (webglOk !== null) return webglOk;
  try { const c = document.createElement('canvas'); webglOk = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { webglOk = false; }
  return webglOk;
}

export interface HandsLayerProps {
  g: PianoGeom;
  events: ScoreEvent[];
  exerciseId: string;
  timeOf: (beat: number) => number;
  timeKey: string | number;
  clock: () => number | null;
  index: number;
  /** fingers move to the keys (2D: highlight the playing finger) */
  active: boolean;
  demo?: boolean;
  correction?: boolean;
}

export function HandsLayer(p: HandsLayerProps) {
  const s = useSettings();
  const [failed, setFailed] = useState(false);
  const fingering = useFingering(p.events, p.exerciseId);
  const evWithFingers = useMemo(() => p.events.map((e, i) => ({ ...e, fingers: fingering[i] })), [p.events, fingering]);
  const states2d = useMemo(() => computeHandStates(evWithFingers), [evWithFingers]);
  const below = handsBelow(p.g.whiteW);
  if (s.handStyle === '2d' || failed || !hasWebGL()) {
    return <HandsOverlay g={p.g} states={states2d} index={p.index} showActive={p.active} />;
  }
  return (
    <Suspense fallback={null}>
      <Hands3D g={p.g} below={below} events={p.events} fingering={fingering} timeOf={p.timeOf} timeKey={p.timeKey} clock={p.clock} index={p.index}
        demo={!!p.demo} correction={!!p.correction} style={{ opacity: s.handOpacity, color: s.handColor, stroke: s.handStroke, outline: true, look: s.handLook }}
        show={s.handsShow} showFingering={s.fingers} onFail={() => setFailed(true)} />
    </Suspense>
  );
}

const SWATCH: Record<string, string> = { white: '#f6f3ee', skin: '#e8c2a4', blue: '#a9c9f5', pink: '#f4bfd0' };

/** Floating "Hands" panel next to the keyboard. */
export function HandControls({ events, exerciseId, index }: { events: ScoreEvent[]; exerciseId: string; index: number }) {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const fingering = useFingering(events, exerciseId);
  const ev = events[Math.max(0, Math.min(index, events.length - 1))];
  const evIdx = Math.max(0, Math.min(index, events.length - 1));
  const overrides = loadOverrides(exerciseId);
  if (!s.hands) {
    return <button className="hands-chip" onClick={() => setSettings({ hands: true })} aria-label="Show guide hands"><Icon name="hand" size={14} /> Hands</button>;
  }
  return (
    <>
      <button className={`hands-chip ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Hand settings"><Icon name="hand" size={14} /> Hands</button>
      {open && (
        <div className="hands-panel float-card" role="dialog" aria-label="Hand settings">
          <div className="hp-head"><b>Hands</b><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={14} /></button></div>
          <div className="hp-row"><span>Style</span>
            <div className="seg">{(['3d', '2d'] as const).map((v) => <button key={v} className={s.handStyle === v ? 'on' : ''} onClick={() => setSettings({ handStyle: v })}>{v === '3d' ? '3D' : 'Line art'}</button>)}</div>
          </div>
          <div className="hp-row"><span>Show</span>
            <div className="seg">{(['both', 'LH', 'RH'] as const).map((v) => <button key={v} className={s.handsShow === v ? 'on' : ''} onClick={() => setSettings({ handsShow: v })}>{v === 'both' ? 'Both' : v === 'LH' ? 'Left' : 'Right'}</button>)}
              <button onClick={() => { setSettings({ hands: false }); setOpen(false); }}>None</button></div>
          </div>
          {s.handStyle === '3d' && <>
            <div className="hp-row"><span>Look</span>
              <div className="seg">{(['real', 'drawn'] as const).map((v) => <button key={v} className={s.handLook === v ? 'on' : ''} onClick={() => setSettings({ handLook: v })}>{v === 'real' ? 'Realistic' : 'Drawn'}</button>)}</div>
            </div>
            <label className="hp-row"><span>Opacity <small>{Math.round(s.handOpacity * 100)}%</small></span>
              <input type="range" min={0.3} max={1} step={0.05} value={s.handOpacity} onChange={(e) => setSettings({ handOpacity: +e.target.value })} /></label>
            {s.handLook === 'drawn' && <><div className="hp-row"><span>Colour</span>
              <div className="swatches">{(Object.keys(SWATCH) as AppColor[]).map((c) => <button key={c} className={`sw ${s.handColor === c ? 'on' : ''}`} style={{ background: SWATCH[c] }} onClick={() => setSettings({ handColor: c })} aria-label={c} title={c} />)}</div>
            </div>
            <label className="hp-row"><span>Line weight</span>
              <input type="range" min={0} max={2} step={0.1} value={s.handStroke} onChange={(e) => setSettings({ handStroke: +e.target.value })} /></label></>}
          </>}
          <label className="hp-row check"><input type="checkbox" checked={s.fingers} onChange={(e) => setSettings({ fingers: e.target.checked })} /> Show finger numbers</label>
          {ev && ev.pitches.length > 0 && (
            <div className="hp-fing">
              <small className="muted">Fingering for the current {ev.pitches.length > 1 ? 'chord' : 'note'} (tap to correct)</small>
              {ev.pitches.map((m, i) => {
                const own = overrides[`${evIdx}:${i}`];
                return (
                  <div key={i} className="hp-note">
                    <b>{midiToName(m)}</b><small>{handOfPitch(ev, m) === 'RH' ? 'R' : 'L'}</small>
                    {[1, 2, 3, 4, 5].map((f) => <button key={f} className={`fing-btn ${fingering[evIdx]?.[i] === f ? 'on' : ''} ${own === f ? 'own' : ''}`} onClick={() => { saveOverride(exerciseId, evIdx, i, own === f ? null : f); bumpFing(); }}>{f}</button>)}
                  </div>
                );
              })}
              {Object.keys(overrides).length > 0 && <button className="link-btn" onClick={() => { Object.keys(overrides).forEach((k) => { const [e, i] = k.split(':').map(Number); saveOverride(exerciseId, e, i, null); }); bumpFing(); }}>Reset to suggested fingering</button>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
type AppColor = 'white' | 'skin' | 'blue' | 'pink';
