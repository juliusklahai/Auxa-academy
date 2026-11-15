// Animated rhythm on the staff. The bar is drawn with VexFlow, then every note waits hidden until its
// moment: it pops in as it sounds, glows while it is held, and its syllable appears under it and grows
// with the hold ("ta" -> "ta-a" -> "ta-a-a"). The beat numbers light up as the count goes by and a
// playhead sweeps across. One bar of clicks counts in first. Nothing is shown as a pile all at once.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveNote, Tuplet, Voice } from 'vexflow';
import { audio } from '../audio/engine';
import { midiToVexKey } from '../core/music';
import type { RhythmDemo as Demo } from '../core/types';
import { Icon } from './Icon';

const THIRD = 1 / 3;
function vexDuration(beats: number): { d: string; dots: number; trip: boolean } {
  const table: [number, string, number, boolean][] = [[4, 'w', 0, false], [3, 'h', 1, false], [2, 'h', 0, false], [1.5, 'q', 1, false], [1, 'q', 0, false], [0.75, '8', 1, false],
    [0.5, '8', 0, false], [THIRD, '8', 0, true], [0.25, '16', 0, false]];
  const hit = table.find(([b]) => Math.abs(b - beats) < 1e-3) ?? [1, 'q', 0, false];
  return { d: hit[1], dots: hit[2], trip: hit[3] };
}

/** the syllable split into what is said at each beat of the hold: "ta-a-a" -> ["ta", "-a", "-a"] */
const holdParts = (say: string) => say.split('-').map((p, i) => (i ? `-${p}` : p));

export interface PlayHandle { play: () => void }

export function RhythmDemo({ demo, playKey = 0, compact = false, onDone }: { demo: Demo; playKey?: number; compact?: boolean; onDone?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const els = useRef<(SVGElement | undefined)[]>([]);
  const xs = useRef<number[]>([]);
  const [width, setWidth] = useState(0);
  const [geom, setGeom] = useState<{ x: number; w: number; row: number }[]>([]);
  const [now, setNow] = useState<number | null>(null); // beats since the downbeat (negative during the count-in)
  const ts = demo.timeSig ?? [4, 4];
  const beatsPerBar = ts[0] * (4 / ts[1]);
  const bpm = demo.bpm ?? 80;
  const items = demo.items;
  const starts = items.reduce<number[]>((a, it, i) => { a.push(i ? a[i - 1] + items[i - 1].beats : 0); return a; }, []);
  const total = items.reduce((s, it) => s + it.beats, 0);
  const bars = Math.max(1, Math.ceil(total / beatsPerBar - 1e-6));

  // ---- draw the bar(s) once; keep each note's SVG element and position
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const syls = useRef<(SVGTextElement | null)[]>([]);
  const rows = useRef<{ top: number; h: number }[]>([]);
  useEffect(() => {
    const el = host.current;
    if (!el || width < 50) return;
    el.querySelector('svg')?.remove();
    const notes: StaveNote[] = [];
    const perBar: StaveNote[][] = Array.from({ length: bars }, () => []);
    const trips: StaveNote[][] = [];
    let run: StaveNote[] = [];
    items.forEach((it, i) => {
      const { d, dots, trip } = vexDuration(it.beats);
      const key = it.rest ? 'b/4' : midiToVexKey(it.midi ?? 72, false);
      const n = new StaveNote({ clef: 'treble', keys: [key], duration: d + (it.rest ? 'r' : ''), auto_stem: !it.rest, stem_direction: (it.midi ?? 72) >= 71 ? -1 : 1 });
      if (dots) Dot.buildAndAttach([n], { all: true });
      notes.push(n);
      perBar[Math.min(bars - 1, Math.floor(starts[i] / beatsPerBar + 1e-6))].push(n);
      if (trip) { run.push(n); if (run.length === 3) { trips.push(run); run = []; } }
    });
    // bars wrap onto more lines on narrow screens; each bar's width follows how many notes it holds
    const left = compact ? 4 : 8, clefW = compact ? 0 : 64;
    const barNeed = perBar.map((bn) => (compact ? 30 : 44) + bn.length * (compact ? 26 : 38));
    const lines: number[][] = [[]];
    let used = clefW;
    perBar.forEach((_, b) => {
      const line = lines[lines.length - 1];
      if (line.length && used + barNeed[b] > width - left - 6) { lines.push([b]); used = barNeed[b]; } else { line.push(b); used += barNeed[b]; }
    });
    const rowH = compact ? 84 : 122, sayGap = compact ? 0 : 26;
    const H = lines.length * (rowH + sayGap);
    const r = new Renderer(el, Renderer.Backends.SVG);
    r.resize(width, H);
    const ctx = r.getContext();
    const beams: Beam[] = [];
    rows.current = [];
    const noteRow: number[] = new Array(items.length).fill(0);
    lines.forEach((line, li) => {
      const y = li * (rowH + sayGap) + (compact ? 0 : 6);
      rows.current.push({ top: y, h: rowH });
      const total = line.reduce((a, b) => a + barNeed[b], 0);
      const avail = width - left - 6 - (li === 0 ? clefW : 0);
      let x = left;
      line.forEach((b, k) => {
        const w = (barNeed[b] / total) * avail + (li === 0 && k === 0 ? clefW : 0);
        const stave = new Stave(x, y, w);
        if (li === 0 && k === 0 && !compact) stave.addClef('treble').addTimeSignature(`${ts[0]}/${ts[1]}`);
        stave.setContext(ctx).draw();
        x += w;
        const bn = perBar[b];
        if (!bn.length) return;
        bn.forEach((n) => { noteRow[notes.indexOf(n)] = li; });
        const v = new Voice({ num_beats: ts[0], beat_value: ts[1] }).setMode(Voice.Mode.SOFT).addTickables(bn);
        new Formatter().joinVoices([v]).format([v], Math.max(20, stave.getNoteEndX() - stave.getNoteStartX() - 12));
        v.draw(ctx, stave);
        const straight = bn.filter((n) => !trips.some((t) => t.includes(n)));
        try { beams.push(...Beam.generateBeams(straight, { groups: [new Fraction(1, 4)] })); } catch { /* unbeamable */ }
      });
    });
    trips.forEach((t) => { try { beams.push(new Beam(t)); new Tuplet(t, { num_notes: 3, notes_occupied: 2 }).setContext(ctx).draw(); } catch { /* skip */ } });
    beams.forEach((b) => b.setContext(ctx).draw());
    els.current = notes.map((n) => n.getSVGElement() as SVGElement | undefined);
    xs.current = notes.map((n) => n.getAbsoluteX());
    setGeom(notes.map((n, i) => ({ x: n.getAbsoluteX(), w: n.getWidth(), row: noteRow[i] })));
    els.current.forEach((e) => e?.classList.add('rd-note'));
    // the syllables live in the score, under each note's own line
    const svg = el.querySelector('svg');
    syls.current = items.map((it, i) => {
      if (compact || !it.say || !svg) return null;
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(notes[i].getAbsoluteX() - 1));
      t.setAttribute('y', String(rows.current[noteRow[i]].top + rowH + 8));
      t.setAttribute('class', `rd-syl${it.rest ? ' rest' : ''}`);
      svg.appendChild(t);
      return t;
    });
  }, [width, demo]); // eslint-disable-line

  // ---- playback: count-in clicks, the notes, and the animation clock
  const raf = useRef(0);
  const timers = useRef<number[]>([]);
  const stop = () => { cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout); timers.current = []; setNow(null); };
  const play = () => {
    stop();
    audio.stopAll();
    const beatMs = 60000 / bpm;
    const count = demo.countIn === false ? 0 : beatsPerBar;
    for (let k = 0; k < count + Math.ceil(total); k++) audio.click(k % beatsPerBar === 0, k >= count, k * beatMs);
    const sounds = items.flatMap((it, i) => (it.rest ? [] : [{ midi: it.midi ?? 72, startMs: (count + starts[i]) * beatMs, durMs: Math.max(120, it.beats * beatMs * 0.92) }]));
    audio.playNotes(sounds, 0.7);
    const t0 = performance.now() + 50;
    const tick = () => {
      const b = (performance.now() - t0) / beatMs - count;
      setNow(b);
      if (b < total + 0.4) raf.current = requestAnimationFrame(tick);
      else { setNow(null); onDone?.(); }
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => { if (playKey) play(); }, [playKey]); // eslint-disable-line
  useEffect(() => () => stop(), []); // eslint-disable-line

  // reveal / glow the notes as the clock passes them
  useEffect(() => {
    els.current.forEach((e, i) => {
      if (!e) return;
      const shown = now === null || now >= starts[i] - 0.02;
      const on = now !== null && now >= starts[i] - 0.02 && now < starts[i] + items[i].beats - 0.05;
      e.classList.toggle('rd-hidden', !shown);
      e.classList.toggle('rd-on', on);
      const t = syls.current[i], it = items[i];
      if (t && it.say) {
        const parts = it.rest ? [it.say] : holdParts(it.say);
        const per = it.beats / Math.max(1, parts.length);
        const k = now === null ? parts.length : now < starts[i] - 0.02 ? 0 : Math.min(parts.length, Math.floor((now - starts[i]) / per) + 1);
        t.textContent = parts.slice(0, k).join('');
        t.classList.toggle('on', on);
      }
    });
  }, [now, geom]); // eslint-disable-line

  const beatNow = now === null ? null : Math.floor(now + 1e-6);
  const head = (() => {
    if (now === null || now < 0 || !geom.length) return null;
    let i = starts.findIndex((s, k) => now >= s && now < s + items[k].beats);
    if (i < 0) i = items.length - 1;
    const f = Math.min(1, (now - starts[i]) / items[i].beats);
    const x0 = geom[i].x, sameRow = i + 1 < geom.length && geom[i + 1].row === geom[i].row;
    const x1 = sameRow ? geom[i + 1].x : x0 + Math.max(40, geom[i].w * 3);
    const row = rows.current[geom[i].row] ?? { top: 0, h: 120 };
    return { x: x0 + (x1 - x0) * f, top: row.top + 14, h: row.h - 30 };
  })();
  return (
    <div className={`rhythm-demo ${compact ? 'compact' : ''}`}>
      <div className="rd-stage" ref={host}>
        {head !== null && <span className="rd-head" style={{ left: head.x, top: head.top, height: head.h }} />}
        {now !== null && now < 0 && <span className="rd-count">{Math.floor(now + beatsPerBar) + 1}</span>}
      </div>
      {!compact && (
        <div className="rd-beats">
          {Array.from({ length: bars * beatsPerBar }, (_, b) => (
            <span key={b} className={`rd-b ${beatNow === b ? 'on' : ''} ${b % beatsPerBar === 0 ? 'rd-down' : ''}`}>{(b % beatsPerBar) + 1}</span>
          ))}
          <button className="btn small rd-play" onClick={play} aria-label="Play the rhythm"><Icon name="play" size={13} />{now !== null ? 'Again' : 'Play'}</button>
        </div>
      )}
    </div>
  );
}

/** A small static picture of a rhythm (for answer buttons). */
export function RhythmGlyph({ cells }: { cells: Demo['items'] }) {
  return <RhythmDemo demo={{ items: cells, countIn: false }} compact />;
}
