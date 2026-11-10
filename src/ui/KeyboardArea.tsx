// The on-screen keyboard block used by lessons and My Music: a slim toolbar with a drag handle
// (resize the keyboard against the score), keyboard size (Auto, 25 to 88 keys), the Hands panel and
// a button to hide the keyboard entirely (handy with a MIDI keyboard or acoustic piano).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Select } from './Select';
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
  const [tuck, setTuck] = useState(0); // 0..1 while pulling past the smallest size
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
    const limit = vh * (short ? 0.38 : inFocus ? 0.4 : 0.62);
    const min = short ? 0.3 : 0.45;
    const h = el.offsetHeight;
    if (h > limit + 4 && scale > min + 0.01) setScale(Math.max(min, scale * (limit / h)));
  });

  if (!s.keyboard) {
    return (
      <div className="card keys-card kb-hidden" onPointerUp={(e) => { if (!(e.target as HTMLElement).closest('button')) setSettings({ keyboard: true }); }}>
        <span className="kb-handle static"><i /></span>
        <span className="muted small">Keyboard tucked away. Play on your MIDI keyboard or piano, or tap here to bring it back.</span>
        <button className="kb-btn" onClick={() => setSettings({ keyboard: true })}><Icon name="keys" size={14} /> Show keyboard</button>
      </div>
    );
  }
  const handsOn = !!hands && s.hands && handsVisible;
  const fit = Math.min(1, scale);
  // Drag the handle: down makes the keyboard (and hands) smaller and gives the notes room; keep pulling
  // down past the smallest size to tuck the keyboard away completely. Up makes it bigger again.
  const MIN = 0.25;
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, .hands-panel')) return;
    drag.current = { y: e.clientY, s: scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const want = drag.current.s - (e.clientY - drag.current.y) / Math.max(160, baseHeight * 1.2);
    setScale(Math.max(MIN, Math.min(1.6, want)));
    setTuck(want < MIN ? Math.min(1, (MIN - want) / 0.3) : 0);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (tuck >= 1) { setTuck(0); setSettings({ keyboard: false }); return; }
    setTuck(0);
    setSettings({ kbScale: Math.round(scale * 100) / 100 });
  };
  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };
  return (
    <div className="card keys-card" ref={card} style={tuck ? { opacity: 1 - tuck * 0.6, transform: `translateY(${tuck * 30}px)` } : undefined}>
      <div className="kb-handle" {...dragProps} role="separator" aria-orientation="horizontal" aria-label="Drag to resize or hide the keyboard" title="Drag down for more room for the notes, up for a bigger keyboard">
        <i />{tuck > 0.5 && <span>Let go to hide the keyboard</span>}
      </div>
      <div className="kb-bar" {...dragProps} title="Drag up or down to resize the keyboard">
        <span className="kb-grip" aria-hidden><i /><i /><i /></span>
        <label className="kb-size">Keys
          <Select value={String(s.kbKeys)} onChange={(e) => setSettings({ kbKeys: (e.target.value === 'auto' ? 'auto' : +e.target.value) as typeof s.kbKeys })} aria-label="Keyboard size">
            {SIZES.map((k) => <option key={k} value={String(k)}>{k === 'auto' ? 'Auto' : `${k} keys`}</option>)}
          </Select>
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
