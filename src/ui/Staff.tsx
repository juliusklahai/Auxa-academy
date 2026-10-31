import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { midiToVexKey } from '../core/music';
import type { Clef, NoteStatus, ScoreEvent } from '../core/types';

const COLORS: Record<NoteStatus | 'current', string> = {
  pending: '#2a2a27', correct: '#1e8a4c', partial: '#b7791f', wrong: '#c53030', missed: '#c53030', current: '#1f1f1d',
};

function duration(beats: number): { d: string; dots: number } {
  const table: [number, string, number][] = [[4, 'w', 0], [3, 'h', 1], [2, 'h', 0], [1.5, 'q', 1], [1, 'q', 0], [0.75, '8', 1], [0.5, '8', 0], [0.25, '16', 0]];
  const hit = table.find(([b]) => Math.abs(b - beats) < 1e-6) ?? [1, 'q', 0];
  return { d: hit[1], dots: hit[2] };
}

interface Props {
  events: ScoreEvent[];
  clef: Clef;
  timeSig: [number, number];
  statuses?: NoteStatus[];
  current?: number;
  /** Live beat position for the moving playhead (timed playback / performance). null = hidden. */
  playhead?: React.MutableRefObject<number | null>;
  highContrast?: boolean;
  measureWidth?: number;
  height?: number;
  showTime?: boolean;
}

interface Layout { mx: [number, number][]; ex: number[]; total: number }

/**
 * Notation as one continuous strip of measures. It turns the page automatically:
 * when you reach the last measure on screen, the strip slides so that measure moves to the left
 * and the next ones come into view. A playhead follows the beat in timed mode.
 */
export function Staff({ events, clef, timeSig, statuses, current = -1, playhead, highContrast, measureWidth = 250, height = 168, showTime = true }: Props) {
  const view = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const svgHost = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const layout = useRef<Layout>({ mx: [], ex: [], total: 0 });
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [glow, setGlow] = useState<number | null>(null);
  const bpb = timeSig[0];

  // draw
  useLayoutEffect(() => {
    const host = svgHost.current;
    if (!host) return;
    host.innerHTML = '';
    const measures: { ev: ScoreEvent; i: number }[][] = [];
    events.forEach((ev, i) => { const m = Math.floor(ev.beat / bpb + 1e-9); (measures[m] ??= []).push({ ev, i }); });
    for (let m = 0; m < measures.length; m++) measures[m] ??= [];
    const first = 78;
    const total = first + measures.length * measureWidth + 12;
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(total, height);
    const ctx = renderer.getContext();
    const mx: [number, number][] = [];
    const ex: number[] = new Array(events.length).fill(0);
    measures.forEach((items, mi) => {
      const x = mi === 0 ? 6 : first + mi * measureWidth;
      const w = mi === 0 ? first + measureWidth - 6 : measureWidth;
      const stave = new Stave(x, Math.round(height / 2 - 62), w);
      if (mi === 0) { stave.addClef(clef); if (showTime) stave.addTimeSignature(`${timeSig[0]}/${timeSig[1]}`); }
      if (mi === measures.length - 1) stave.setEndBarType(3);
      stave.setContext(ctx).draw();
      mx.push([x, x + w]);
      if (!items.length) return;
      const notes = items.map(({ ev, i }) => {
        const { d, dots } = duration(ev.beats);
        const rest = ev.pitches.length === 0;
        const sorted = [...ev.pitches].sort((a, b) => a - b);
        const keys = rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : sorted.map(midiToVexKey);
        const n = new StaveNote({ clef, keys, duration: d + (rest ? 'r' : ''), auto_stem: true });
        if (!rest) sorted.forEach((p, k) => { if (midiToVexKey(p).includes('#')) n.addModifier(new Accidental('#'), k); });
        if (dots) Dot.buildAndAttach([n], { all: true });
        const st = statuses?.[i] ?? 'pending';
        const c = highContrast && st === 'pending' ? '#000' : COLORS[st];
        n.setStyle({ fillStyle: c, strokeStyle: c });
        return { n, i };
      });
      const voice = new Voice({ num_beats: timeSig[0], beat_value: timeSig[1] }).setMode(Voice.Mode.SOFT);
      voice.addTickables(notes.map((x) => x.n));
      new Formatter().joinVoices([voice]).format([voice], w - (mi === 0 ? first + 10 : 30));
      voice.draw(ctx, stave);
      notes.forEach(({ n, i }) => { ex[i] = n.getAbsoluteX() + 7; });
    });
    layout.current = { mx, ex, total };
    if (strip.current) strip.current.style.width = `${total}px`;
  }, [events, clef, timeSig, statuses, highContrast, measureWidth, height, bpb, showTime]);

  // page turning
  const ensureVisible = (beat: number) => {
    const v = view.current, L = layout.current;
    if (!v || !L.mx.length) return;
    const vw = v.clientWidth;
    const m = Math.max(0, Math.min(L.mx.length - 1, Math.floor(beat / bpb + 1e-9)));
    const [x0, x1] = L.mx[m];
    let off = offsetRef.current;
    const maxOff = Math.max(0, L.total - vw);
    if (m === 0) off = 0;
    else if (x0 < off) off = Math.min(maxOff, x0 - 20);
    else {
      // last measure that is fully on screen
      let lastFull = 0;
      L.mx.forEach(([, e], k) => { if (e <= off + vw + 1) lastFull = k; });
      if (x1 > off + vw || (m >= lastFull && m < L.mx.length - 1)) off = Math.min(maxOff, x0 - 20);
    }
    if (off !== offsetRef.current) { offsetRef.current = off; setOffset(off); }
  };

  useEffect(() => {
    if (current >= 0 && events[current]) {
      ensureVisible(events[current].beat);
      setGlow(layout.current.ex[current] ?? null);
    } else setGlow(null);
    if (current === -1 && !playhead?.current) { offsetRef.current = 0; setOffset(0); }
  }, [current, events]); // eslint-disable-line

  // playhead animation
  useEffect(() => {
    if (!playhead) return;
    let raf = 0;
    const loop = () => {
      const beat = playhead.current;
      const el = head.current;
      if (el) {
        if (beat === null || beat === undefined) el.style.opacity = '0';
        else {
          const L = layout.current;
          let x = L.ex[0] ?? 0;
          if (beat >= 0 && events.length) {
            let i = events.findIndex((e, k) => beat >= e.beat && (k === events.length - 1 || beat < events[k + 1].beat));
            if (i < 0) i = 0;
            const e = events[i];
            const nextX = i < events.length - 1 ? L.ex[i + 1] : (L.mx[L.mx.length - 1]?.[1] ?? L.ex[i]) - 8;
            const nextBeat = i < events.length - 1 ? events[i + 1].beat : e.beat + e.beats;
            x = L.ex[i] + (nextX - L.ex[i]) * Math.min(1, (beat - e.beat) / Math.max(1e-6, nextBeat - e.beat));
            ensureVisible(beat);
          }
          el.style.opacity = '1';
          el.style.transform = `translateX(${x}px)`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playhead, events]); // eslint-disable-line

  return (
    <div className="staff-view" ref={view} aria-label={`${clef} clef notation`}>
      <div className="staff-strip" ref={strip} style={{ transform: `translateX(${-offset}px)`, height }}>
        {glow !== null && <div className="note-glow" style={{ left: glow }} />}
        <div ref={svgHost} className="staff-svg" />
        {playhead && <div className="playhead" ref={head} />}
      </div>
    </div>
  );
}
