// The on-screen keyboard block used by lessons and My Music: a slim toolbar with a drag handle
// (resize the keyboard against the score), keyboard size (Auto, 25 to 88 keys), the Hands panel and
// a button to hide the keyboard entirely (handy with a MIDI keyboard or acoustic piano).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Piano, type KeyMark } from './Piano';
import { HandControls, HandsLayer, HANDS_MIN_ASPECT, handsBelow, type HandsLayerProps } from './HandsLayer';
import { setSettings, useSettings } from './settings';
import { Icon } from './Icon';

interface Props {
  lo: number;
  hi: number;
  marks?: Map<number, KeyMark>;
  labels?: 'letters' | 'solfege' | 'none';
  showKeyHints?: boolean;
  scrollTo?: number;
  baseHeight: number;
  /** guide hands (omit for voice exercises) */
  hands?: Omit<HandsLayerProps, 'g'>;
  /** show the hands right now (e.g. not while idle in some views) */
  handsVisible?: boolean;
  extra?: ReactNode;
}

const SIZES = ['auto', 25, 37, 49, 61, 88] as const;

export function KeyboardArea({ lo, hi, marks, labels, showKeyHints, scrollTo, baseHeight, hands, handsVisible = true, extra }: Props) {
  const s = useSettings();
  const [scale, setScale] = useState(s.kbScale);
  useEffect(() => setScale(s.kbScale), [s.kbScale]);
  const drag = useRef<{ y: number; s: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  useEffect(() => {
    const on = () => { setVh(window.innerHeight); setScale(s.kbScale); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [s.kbScale]);
  // Until the learner resizes it, the keyboard never takes more than about half the screen in full
  // screen practice, so the notes always have room.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || drag.current || s.kbScale !== 1) return;
    const inFocus = !!el.closest('.practice-root.focus');
    // a phone held sideways is short: the keys get under half of it, the music gets the rest
    const short = inFocus && vh < 520;
    const limit = vh * (short ? 0.44 : inFocus ? 0.42 : 0.62);
    const min = short ? 0.36 : 0.55;
    const h = el.offsetHeight;
    if (h > limit + 4 && scale > min + 0.01) setScale(Math.max(min, scale * (limit / h)));
  });

  if (!s.keyboard) {
    return (
      <div className="card keys-card kb-hidden">
        <span className="muted small">On-screen keyboard hidden. Play on your MIDI keyboard or piano.</span>
        <button className="kb-btn" onClick={() => setSettings({ keyboard: true })}><Icon name="keys" size={14} /> Show keyboard</button>
      </div>
    );
  }
  const handsOn = !!hands && s.hands && handsVisible;
  const fit = Math.min(1, scale);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, .hands-panel')) return;
    drag.current = { y: e.clientY, s: scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setScale(Math.max(0.5, Math.min(1.6, drag.current.s - (e.clientY - drag.current.y) / 260)));
  };
  const onUp = () => { if (drag.current) { drag.current = null; setSettings({ kbScale: Math.round(scale * 100) / 100 }); } };
  return (
    <div className="card keys-card" ref={card}>
      <div className="kb-bar" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} title="Drag up or down to resize the keyboard">
        <span className="kb-grip" aria-hidden><i /><i /><i /></span>
        <label className="kb-size">Keys
          <select value={String(s.kbKeys)} onChange={(e) => setSettings({ kbKeys: (e.target.value === 'auto' ? 'auto' : +e.target.value) as typeof s.kbKeys })} aria-label="Keyboard size">
            {SIZES.map((k) => <option key={k} value={String(k)}>{k === 'auto' ? 'Auto' : `${k} keys`}</option>)}
          </select>
        </label>
        <span className="kb-fill" />
        {extra}
        {hands && <HandControls events={hands.events} exerciseId={hands.exerciseId} index={hands.index} />}
        <button className="kb-btn" onClick={() => setSettings({ keyboard: false })} aria-label="Hide keyboard" title="Hide the on-screen keyboard"><Icon name="close" size={13} /><span>Hide keys</span></button>
      </div>
      <Piano lo={lo} hi={hi} marks={marks} labels={labels} showKeyHints={showKeyHints} height={Math.round(baseHeight * scale)} scrollTo={scrollTo}
        keys={s.kbKeys} maxKeyWidth={56}
        below={handsOn ? (w) => Math.round(handsBelow(w) * fit) : 0}
        minAspect={handsOn && s.handStyle === '3d' ? HANDS_MIN_ASPECT * fit : 0}
        overlay={handsOn ? (g) => <HandsLayer g={g} {...hands!} /> : undefined} />
    </div>
  );
}
