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
  /** extra space under the keys (for the guide hands' palms); may depend on the key width */
  below?: number | ((whiteW: number) => number);
  /** keep keys at least this many key-widths long (real keys are ~6.4x longer than wide) */
  minAspect?: number;
  /** keyboard size: 'auto' fits the music (adding octaves while keys would be wider than maxKeyWidth) */
  keys?: 'auto' | number;
  maxKeyWidth?: number;
}

const FIXED: Record<number, [number, number]> = { 25: [48, 72], 37: [48, 84], 49: [36, 84], 61: [36, 96], 76: [28, 103], 88: [21, 108] };
const whitesIn = (a: number, b: number) => { let n = 0; for (let m = a; m <= b; m++) if (!isBlackKey(m)) n++; return n; };
/** Final keyboard range for a size setting, centred on the music. */
export function keyboardRange(lo: number, hi: number, keys: 'auto' | number = 'auto', avail = 0, maxKeyWidth = 0): [number, number] {
  if (keys !== 'auto' && FIXED[keys]) {
    const [a, b] = FIXED[keys];
    if (keys === 88) return [a, b];
    let shift = Math.round(((lo + hi) / 2 - (a + b) / 2) / 12) * 12;
    shift = Math.max(21 - a, Math.min(108 - b, shift));
    return [a + shift, b + shift];
  }
  let L = lo, H = hi, down = false;
  if (maxKeyWidth && avail) {
    for (let i = 0; i < 8 && whitesIn(L, H) * maxKeyWidth < avail; i++) {
      if (down && L - 12 >= 21) L -= 12; else if (H + 12 <= 108) H += 12; else if (L - 12 >= 21) L -= 12; else break;
      down = !down;
    }
  }
  return [L, H];
}

const MARK_TEXT: Record<KeyMark, string> = { target: '', correct: '✓', wrong: '✗', partial: '~', played: '', demo: '', show: '' };

/** Interactive keyboard. Mouse, touch and pen via pointer events; correct white/black key geometry. */
export function Piano({ marks, labels = 'letters', fingers, showKeyHints, height = 170, scrollTo, overlay, minKeyWidth = 34, below: belowProp = 0, minAspect = 0, keys = 'auto', maxKeyWidth = 0, lo: loIn, hi: hiIn }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pressed = useRef(new Map<number, number>());
  const [width, setWidth] = useState(0);
  const [avail, setAvail] = useState(0);
  const [lo, hi] = keyboardRange(loIn, hiIn, keys, avail, maxKeyWidth);

  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const ww = 100 / whites.length;

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setWidth(el.offsetWidth); setAvail(wrap.current?.clientWidth ?? 0); });
    ro.observe(el);
    if (wrap.current) ro.observe(wrap.current);
    setWidth(el.offsetWidth);
    setAvail(wrap.current?.clientWidth ?? 0);
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
  const below = typeof belowProp === 'function' ? (width ? belowProp(whiteW) : 0) : belowProp;
  if (minAspect && whiteW) height = Math.round(Math.max(height, Math.min(height * 1.35, whiteW * minAspect)));
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
