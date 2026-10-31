import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isBlackKey, midiToName, midiToSolfege } from '../core/music';
import { emit, midiToKeyHint } from '../input/bus';

export type KeyMark = 'target' | 'correct' | 'wrong' | 'partial' | 'played' | 'demo' | 'show';
export interface PianoGeom { whites: number[]; width: number; height: number; whiteW: number; keyX: (midi: number) => number }

interface Props {
  lo: number;
  hi: number;
  marks?: Map<number, KeyMark>;
  labels?: 'letters' | 'solfege' | 'none';
  fingers?: Map<number, number>;
  showKeyHints?: boolean;
  height?: number;
  scrollTo?: number;
  overlay?: (g: PianoGeom) => ReactNode;
  minKeyWidth?: number;
  /** extra space under the keys (for the guide hands' palms) */
  below?: number;
}

const MARK_TEXT: Record<KeyMark, string> = { target: '', correct: '✓', wrong: '✗', partial: '~', played: '', demo: '', show: '' };

/** Interactive keyboard. Mouse, touch and pen via pointer events; correct white/black key geometry. */
export function Piano({ lo, hi, marks, labels = 'letters', fingers, showKeyHints, height = 170, scrollTo, overlay, minKeyWidth = 34, below = 0 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pressed = useRef(new Map<number, number>());
  const [width, setWidth] = useState(0);

  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const ww = 100 / whites.length;

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollTo === undefined || !wrap.current || !inner.current) return;
    const idx = whites.indexOf(isBlackKey(scrollTo) ? scrollTo - 1 : scrollTo);
    const el = wrap.current;
    if (idx >= 0) el.scrollTo({ left: (idx / whites.length) * inner.current.offsetWidth - el.clientWidth / 2, behavior: 'smooth' });
  }, [scrollTo, lo, hi]); // eslint-disable-line

  const down = (midi: number, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pressed.current.set(e.pointerId, midi);
    emit({ midi, on: true, velocity: 0.75, at: performance.now(), source: 'screen', confidence: 1 });
  };
  const up = (e: React.PointerEvent) => {
    const m = pressed.current.get(e.pointerId);
    if (m === undefined) return;
    pressed.current.delete(e.pointerId);
    emit({ midi: m, on: false, velocity: 0, at: performance.now(), source: 'screen', confidence: 1 });
  };
  const label = (m: number) => {
    if (labels === 'none') return '';
    if (labels === 'solfege') return midiToSolfege(m);
    return m % 12 === 0 ? midiToName(m) : midiToName(m).replace(/-?\d+$/, '');
  };

  const whiteW = width / whites.length;
  const keyX = (m: number) => {
    if (!isBlackKey(m)) return (whites.indexOf(m) + 0.5) * whiteW;
    return (whites.indexOf(m - 1) + 1) * whiteW;
  };

  return (
    <div className="piano-scroll" ref={wrap} style={below ? { paddingBottom: below } : undefined}>
      <div className="piano" ref={inner} style={{ height, minWidth: whites.length * minKeyWidth }} role="group" aria-label="Piano keyboard">
        {whites.map((m, i) => {
          const mk = marks?.get(m);
          return (
            <button key={m} className={`key white ${mk ?? ''} ${m === 60 ? 'middle-c' : ''}`} style={{ left: `${i * ww}%`, width: `${ww}%` }}
              aria-label={`${midiToName(m)}${mk ? ' ' + mk : ''}`} onPointerDown={(e) => down(m, e)} onPointerUp={up} onPointerCancel={up}>
              {fingers?.get(m) && <span className="finger">{fingers.get(m)}</span>}
              {mk && MARK_TEXT[mk] && <span className="mark">{MARK_TEXT[mk]}</span>}
              {showKeyHints && midiToKeyHint(m) && <span className="kbd">{midiToKeyHint(m)}</span>}
              <span className="lbl">{label(m)}</span>
            </button>
          );
        })}
        {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter(isBlackKey).map((m) => {
          const leftWhite = whites.indexOf(m - 1);
          const mk = marks?.get(m);
          return (
            <button key={m} className={`key black ${mk ?? ''}`} style={{ left: `${(leftWhite + 1) * ww - ww * 0.3}%`, width: `${ww * 0.6}%` }}
              aria-label={`${midiToName(m)}${mk ? ' ' + mk : ''}`} onPointerDown={(e) => down(m, e)} onPointerUp={up} onPointerCancel={up}>
              {fingers?.get(m) && <span className="finger">{fingers.get(m)}</span>}
              {mk && MARK_TEXT[mk] && <span className="mark">{MARK_TEXT[mk]}</span>}
              {showKeyHints && midiToKeyHint(m) && <span className="kbd">{midiToKeyHint(m)}</span>}
            </button>
          );
        })}
        {overlay && width > 0 && overlay({ whites, width, height, whiteW, keyX })}
      </div>
    </div>
  );
}
