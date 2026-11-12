import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Accidental, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveConnector, StaveNote, Tuplet, Voice } from 'vexflow';
import { midiToVexKey } from '../core/music';
import type { BackNote, Clef, NoteStatus, ScoreEvent } from '../core/types';

const COLORS: Record<NoteStatus | 'current', string> = {
  pending: '#2a2a27', correct: '#1e8a4c', partial: '#b7791f', wrong: '#c53030', missed: '#c53030', current: '#1f1f1d',
};

const KEY_NAMES: Record<number, string> = { 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#', [-1]: 'F', [-2]: 'Bb', [-3]: 'Eb', [-4]: 'Ab', [-5]: 'Db', [-6]: 'Gb', [-7]: 'Cb' };
/** how the key signature alters a letter: +1 sharp, -1 flat, 0 natural */
export function keyAlter(fifths: number, letter: string): number {
  const L = letter.toLowerCase();
  if (fifths > 0) return 'fcgdaeb'.slice(0, fifths).includes(L) ? 1 : 0;
  if (fifths < 0) return 'beadgcf'.slice(0, -fifths).includes(L) ? -1 : 0;
  return 0;
}
const THIRD = 1 / 3;
function duration(beats: number): { d: string; dots: number; trip: boolean } {
  const table: [number, string, number, boolean][] = [[4, 'w', 0, false], [3, 'h', 1, false], [2, 'h', 0, false], [1.5, 'q', 1, false], [1, 'q', 0, false], [0.75, '8', 1, false],
    [2 * THIRD, 'q', 0, true], [0.5, '8', 0, false], [THIRD, '8', 0, true], [0.25, '16', 0, false]];
  const hit = table.find(([b]) => Math.abs(b - beats) < 1e-3) ?? [1, 'q', 0, false];
  return { d: hit[1], dots: hit[2], trip: hit[3] };
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
  /** play-along notes the app plays: melody notes are drawn in grey */
  backing?: BackNote[];
  /** treble + bass staves (hands together) */
  grand?: boolean;
  /** by ear: notes you have not found yet are invisible (rhythm and barlines stay) */
  hidePending?: boolean;
  /** spell black keys as flats */
  flats?: boolean;
  /** key signature: sharps (+) or flats (-), drawn at the start; accidentals are then shown only against it */
  fifths?: number;
}

interface Layout { mx: [number, number][]; ex: number[]; total: number }

/**
 * Notation as one continuous strip of measures. It turns the page automatically:
 * when you reach the last measure on screen, the strip slides so that measure moves to the left
 * and the next ones come into view. A playhead follows the beat in timed mode.
 */
export function Staff({ events, clef, timeSig, statuses, current = -1, playhead, highContrast, measureWidth = 250, height = 168, showTime = true, backing, grand = false, hidePending = false, flats: flatsProp = false, fifths }: Props) {
  const flats = fifths !== undefined ? fifths < 0 : flatsProp;
  const view = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const svgHost = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const layout = useRef<Layout>({ mx: [], ex: [], total: 0 });
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [glow, setGlow] = useState<number | null>(null);
  // bar length in quarter beats: 6/8 is three quarters long, 2/2 is four
  const bpb = timeSig[0] * (4 / timeSig[1]);

  // draw
  useLayoutEffect(() => {
    const host = svgHost.current;
    if (!host) return;
    host.innerHTML = '';
    const lanesN = grand ? 2 : 1;
    const laneOf = (p: number, hand?: string) => (!grand ? 0 : hand ? (hand === 'RH' ? 0 : 1) : p >= 60 ? 0 : 1);
    type Item = { beat: number; beats: number; pitches: number[]; idx: number | null; ghost: boolean };
    const lanes: Item[][] = Array.from({ length: lanesN }, () => []);
    events.forEach((ev, i) => {
      if (!ev.pitches.length) { if (!grand) lanes[0].push({ beat: ev.beat, beats: ev.beats, pitches: [], idx: i, ghost: false }); return; }
      const by = new Map<number, number[]>();
      ev.pitches.forEach((p, k) => { const l = laneOf(p, ev.hands?.[k] ?? ev.hand); by.set(l, [...(by.get(l) ?? []), p]); });
      by.forEach((ps, l) => lanes[l].push({ beat: ev.beat, beats: (grand ? ev.handBeats?.[l === 0 ? 'RH' : 'LH'] : undefined) ?? ev.beats, pitches: ps, idx: i, ghost: false }));
    });
    for (const n of backing ?? []) if (n.line === 'melody') lanes[laneOf(n.midi, n.hand)].push({ beat: n.beat, beats: n.beats, pitches: [n.midi], idx: null, ghost: true });
    const lastBeat = Math.max(0, ...events.map((e) => e.beat + e.beats), ...(backing ?? []).map((n) => n.beat + n.beats));
    const nMeasures = Math.max(1, Math.ceil(lastBeat / bpb - 1e-9));
    const VALUES = [4, 3, 2, 1.5, 1, 0.75, 2 * THIRD, 0.5, THIRD, 0.25];
    const fit = (len: number) => VALUES.find((v) => v <= len + 1e-3) ?? 0.25;
    // one monophonic sequence of chords and rests per lane and measure
    const perMeasure: Item[][][] = Array.from({ length: nMeasures }, () => Array.from({ length: lanesN }, () => []));
    lanes.forEach((items, l) => {
      const merged: Item[] = [];
      [...items].sort((x, y) => x.beat - y.beat || Number(x.ghost) - Number(y.ghost)).forEach((it) => {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.beat - it.beat) < 1e-6) {
          last.pitches = [...new Set([...last.pitches, ...it.pitches])];
          if (it.idx !== null && last.idx === null) last.idx = it.idx;
          last.ghost = last.ghost && it.ghost;
          last.beats = Math.min(last.beats, it.beats);
        } else merged.push({ ...it });
      });
      for (let m = 0; m < nMeasures; m++) {
        const m0 = m * bpb, m1 = m0 + bpb;
        const out = perMeasure[m][l];
        let t = m0;
        const inM = merged.filter((it) => it.beat >= m0 - 1e-6 && it.beat < m1 - 1e-6);
        const rest = (from: number, to: number) => { let x = from; while (to - x > 1e-6) { const v = fit(to - x); out.push({ beat: x, beats: v, pitches: [], idx: null, ghost: true }); x += v; } };
        inM.forEach((it, k) => {
          if (it.beat > t + 1e-6) rest(t, it.beat);
          const end = Math.min(m1, inM[k + 1]?.beat ?? m1, it.beat + it.beats);
          const v = fit(end - it.beat);
          out.push({ ...it, beats: v });
          t = it.beat + v;
          if (end - t > 1e-6 && it.pitches.length) { rest(t, end); t = end; }
        });
        if (m1 - t > 1e-6 && (grand || inM.length)) rest(t, m1);
      }
    });
    const first = 78;
    const total = first + nMeasures * measureWidth + 12;
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(total, height);
    const ctx = renderer.getContext();
    const mx: [number, number][] = [];
    const ex: number[] = new Array(events.length).fill(0);
    const clefs: Clef[] = grand ? ['treble', 'bass'] : [clef];
    const ys = grand ? [Math.round(height / 2 - 112), Math.round(height / 2 - 10)] : [Math.round(height / 2 - 62)];
    perMeasure.forEach((laneItems, mi) => {
      const x = mi === 0 ? 6 : first + mi * measureWidth;
      const w = mi === 0 ? first + measureWidth - 6 : measureWidth;
      const staves = clefs.map((c, l) => {
        const st = new Stave(x, ys[l], w);
        if (mi === 0) { st.addClef(c); if (fifths) st.addKeySignature(KEY_NAMES[fifths] ?? 'C'); if (showTime) st.addTimeSignature(`${timeSig[0]}/${timeSig[1]}`); }
        if (mi === nMeasures - 1) st.setEndBarType(3);
        st.setContext(ctx).draw();
        return st;
      });
      if (grand && staves.length === 2) {
        if (mi === 0) new StaveConnector(staves[0], staves[1]).setType('brace').setContext(ctx).draw();
        new StaveConnector(staves[0], staves[1]).setType('singleLeft').setContext(ctx).draw();
        if (mi === nMeasures - 1) new StaveConnector(staves[0], staves[1]).setType('boldDoubleRight').setContext(ctx).draw();
      }
      mx.push([x, x + w]);
      const voices: Voice[] = [];
      const built: { n: StaveNote; idx: number | null }[][] = [];
      const extras: (Beam | Tuplet)[] = [];
      laneItems.forEach((items, l) => {
        if (!items.length) return;
        const c = clefs[l];
        // accidentals carry through the bar: remember what each line or space has become
        const barAlter = new Map<string, number>();
        const notes = items.map((it) => {
          const { d, dots } = duration(it.beats);
          const rest = it.pitches.length === 0;
          const sorted = [...it.pitches].sort((a, b2) => a - b2);
          const keys = rest ? [c === 'bass' ? 'd/3' : 'b/4'] : sorted.map((p) => midiToVexKey(p, flats));
          const n = new StaveNote({ clef: c, keys, duration: d + (rest ? 'r' : ''), auto_stem: true });
          if (!rest) sorted.forEach((p, k) => {
            const vk = midiToVexKey(p, flats), [nm, oct] = vk.split('/');
            const letter = nm[0], alter = nm.includes('#') ? 1 : nm.includes('b') ? -1 : 0;
            const was = barAlter.get(letter + oct) ?? keyAlter(fifths ?? 0, letter);
            if (alter !== was) n.addModifier(new Accidental(alter === 1 ? '#' : alter === -1 ? 'b' : 'n'), k);
            barAlter.set(letter + oct, alter);
          });
          if (dots) Dot.buildAndAttach([n], { all: true });
          const st = it.idx !== null ? statuses?.[it.idx] ?? 'pending' : 'pending';
          const hide = hidePending && !it.ghost && !rest && st !== 'correct' && st !== 'partial';
          const col = hide ? 'rgba(0,0,0,0)' : it.ghost ? (rest ? '#c9c7c0' : '#a9a7a0') : highContrast && st === 'pending' ? '#000' : COLORS[st];
          n.setStyle({ fillStyle: col, strokeStyle: col });
          if (hide) n.setLedgerLineStyle({ fillStyle: col, strokeStyle: col });
          // work-it-out notes inside a chord: invisible until found
          const hid = it.idx !== null && !it.ghost ? events[it.idx]?.hidden : undefined;
          if (hid?.length && !rest && st !== 'correct') sorted.forEach((p, k) => { if (hid.includes(p)) n.setKeyStyle(k, { fillStyle: 'rgba(0,0,0,0)', strokeStyle: 'rgba(0,0,0,0)' }); });
          return { n, idx: it.ghost ? null : it.idx };
        });
        // triplets: three equal notes in the time of two, bracketed with a 3
        const trips: boolean[] = items.map((it) => duration(it.beats).trip);
        const straight: StaveNote[] = [];
        for (let k = 0; k < notes.length; k++) {
          if (trips[k] && trips[k + 1] && trips[k + 2]) {
            const grp = notes.slice(k, k + 3).map((q) => q.n);
            extras.push(new Tuplet(grp, { num_notes: 3, notes_occupied: 2 }));
            if (grp.every((g) => g.getDuration() === '8' && !g.isRest())) extras.push(new Beam(grp));
            k += 2;
          } else straight.push(notes[k].n);
        }
        // beam eighths and sixteenths by the beat (dotted quarters in compound time, e.g. 6/8)
        const compound = timeSig[1] === 8 && timeSig[0] % 3 === 0;
        try { extras.push(...Beam.generateBeams(straight, { groups: [compound ? new Fraction(3, 8) : new Fraction(1, 4)] })); } catch { /* unbeamable run */ }
        const voice = new Voice({ num_beats: timeSig[0], beat_value: timeSig[1] }).setMode(Voice.Mode.SOFT);
        voice.addTickables(notes.map((q) => q.n));
        voices.push(voice);
        built.push(notes);
        (voice as unknown as { _lane: number })._lane = l;
      });
      if (!voices.length) return;
      const f = new Formatter();
      voices.forEach((v) => f.joinVoices([v]));
      f.format(voices, w - (mi === 0 ? first + 10 : 30));
      voices.forEach((v) => v.draw(ctx, staves[(v as unknown as { _lane: number })._lane]));
      extras.forEach((e) => e.setContext(ctx).draw());
      built.flat().forEach(({ n, idx }) => { if (idx !== null && !ex[idx]) ex[idx] = n.getAbsoluteX() + 7; });
    });
    layout.current = { mx, ex, total };
    if (strip.current) strip.current.style.width = `${total}px`;
  }, [events, clef, timeSig, statuses, highContrast, measureWidth, height, bpb, showTime, backing, grand, hidePending, flats, fifths]);

  // fit the staff to the space it gets: shrink it when the view is shorter (phones in landscape) and
  // center it when the view is taller
  const [fit, setFit] = useState({ s: 1, top: 0 });
  const fitRef = useRef(1);
  useEffect(() => {
    const v = view.current;
    if (!v || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const h = v.clientHeight;
      if (!h) return;
      const sc = h < height - 1 ? Math.max(0.45, h / height) : 1;
      fitRef.current = sc;
      setFit({ s: sc, top: Math.max(0, (h - height * sc) / 2) });
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, [height]);

  // page turning
  const ensureVisible = (beat: number) => {
    const v = view.current, L = layout.current;
    if (!v || !L.mx.length) return;
    const vw = v.clientWidth / fitRef.current;
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
      <div className="staff-strip" ref={strip} style={{ transform: `translate(${-offset * fit.s}px, ${fit.top}px) scale(${fit.s})`, transformOrigin: '0 0', height }}>
        {glow !== null && <div className="note-glow" style={{ left: glow }} />}
        <div ref={svgHost} className="staff-svg" />
        {playhead && <div className="playhead" ref={head} />}
      </div>
    </div>
  );
}
