// Faithful notation for imported MusicXML (OpenSheetMusicDisplay, bundled for offline use),
// with a cursor that follows playback/practice, automatic scrolling to the next system,
// and per-note coloring (green / amber / red) of the learner's results.

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import type { OpenSheetMusicDisplay as OSMDType } from 'opensheetmusicdisplay';

export interface ScoreViewHandle {
  /** Move the cursor to a written-score position (quarters). */
  moveTo: (srcQ: number) => void;
  hideCursor: () => void;
  /** Color notes: key = `${srcQ.toFixed(3)}|${midi}` */
  color: (colors: Map<string, string>) => void;
}

interface Props { xml: string; zoom?: number; transpose?: number; onError?: (msg: string) => void; onReady?: () => void }

export const noteKey = (srcQ: number, midi: number) => `${srcQ.toFixed(3)}|${midi}`;

export const ScoreView = forwardRef<ScoreViewHandle, Props>(function ScoreView({ xml, zoom = 1, transpose = 0, onError, onReady }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const osmd = useRef<OSMDType | null>(null);
  const stamps = useRef<number[]>([]);
  const curIdx = useRef(0);
  const noteEls = useRef(new Map<string, SVGElement[]>());
  const colored = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);

  const indexNotes = () => {
    noteEls.current.clear();
    try {
      const sheet = (osmd.current as unknown as { GraphicSheet: { MeasureList: unknown[][] } }).GraphicSheet;
      for (const row of sheet.MeasureList) for (const gm of row as { staffEntries: { graphicalVoiceEntries: { notes: unknown[] }[] }[] }[]) {
        if (!gm) continue;
        for (const se of gm.staffEntries) for (const gve of se.graphicalVoiceEntries) for (const gn of gve.notes as { sourceNote: { Pitch?: { getHalfTone: () => number }; getAbsoluteTimestamp: () => { RealValue: number }; isRest: () => boolean }; getSVGGElement?: () => SVGElement }[]) {
          const src = gn.sourceNote;
          if (!src || src.isRest() || !src.Pitch) continue;
          const midi = src.Pitch.getHalfTone() + 12;
          const q = src.getAbsoluteTimestamp().RealValue * 4;
          const el = gn.getSVGGElement?.();
          if (!el) continue;
          for (const m of new Set([midi, midi - trRef.current])) { const k = noteKey(q, m); (noteEls.current.get(k) ?? noteEls.current.set(k, []).get(k)!).push(el); }
        }
      }
    } catch { /* coloring is best-effort */ }
  };

  const collectStamps = () => {
    const c = osmd.current!.cursor;
    c.reset();
    const out: number[] = [];
    let guard = 0;
    while (!c.Iterator.EndReached && guard++ < 100000) { out.push(c.Iterator.currentTimeStamp.RealValue * 4); c.next(); }
    c.reset();
    stamps.current = out;
    curIdx.current = 0;
  };

  const trRef = useRef(0);
  const render = () => {
    if (!osmd.current) return;
    osmd.current.Zoom = zoom;
    try {
      const sheet = osmd.current.Sheet as unknown as { Transpose: number };
      if (sheet.Transpose !== transpose) { sheet.Transpose = transpose; osmd.current.updateGraphic(); }
      trRef.current = transpose;
    } catch { /* transposition unavailable: notation stays in the written key */ }
    osmd.current.render();
    collectStamps();
    indexNotes();
    colored.current.clear();
  };

  useEffect(() => {
    let dead = false;
    setLoading(true);
    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (dead || !host.current) return;
        host.current.innerHTML = '';
        const mod = await import('opensheetmusicdisplay');
        const o = new OpenSheetMusicDisplay(host.current, { autoResize: false, backend: 'svg', drawTitle: true, drawComposer: true, drawPartNames: true, followCursor: false, cursorsOptions: [{ type: 0, color: '#14b8a6', alpha: 0.55, follow: false }] });
        try { (o as unknown as { TransposeCalculator: unknown }).TransposeCalculator = new (mod as unknown as { TransposeCalculator: new () => unknown }).TransposeCalculator(); } catch { /* optional */ }
        await o.load(xml);
        if (dead) return;
        osmd.current = o;
        render();
        o.cursor.hide();
        setLoading(false);
        onReady?.();
      } catch (e) {
        setLoading(false);
        onError?.(`Could not draw this score: ${(e as Error).message}`);
      }
    })();
    return () => { dead = true; };
  }, [xml]); // eslint-disable-line

  useEffect(() => { if (osmd.current) render(); }, [zoom, transpose]); // eslint-disable-line

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let w = el.clientWidth, t = 0;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) < 40) return;
      w = el.clientWidth;
      clearTimeout(t);
      t = window.setTimeout(() => render(), 250);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line

  useImperativeHandle(ref, () => ({
    moveTo(srcQ: number) {
      const o = osmd.current;
      if (!o || !stamps.current.length) return;
      let i = 0;
      while (i + 1 < stamps.current.length && stamps.current[i + 1] <= srcQ + 1e-6) i++;
      const c = o.cursor;
      if (c.hidden) c.show();
      if (i < curIdx.current) { c.reset(); curIdx.current = 0; }
      while (curIdx.current < i) { c.next(); curIdx.current++; }
      // page turn: scroll the next system into view as the current one finishes
      const ce = c.cursorElement as HTMLElement | undefined;
      const sc = scroller.current;
      if (ce && sc) {
        const top = ce.offsetTop, h = ce.offsetHeight;
        if (top + h > sc.scrollTop + sc.clientHeight - 20 || top < sc.scrollTop) sc.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
      }
    },
    hideCursor() { osmd.current?.cursor.hide(); if (scroller.current) scroller.current.scrollTo({ top: 0, behavior: 'smooth' }); },
    color(colors) {
      for (const k of colored.current) if (!colors.has(k)) paint(noteEls.current.get(k), null);
      colored.current = new Set(colors.keys());
      colors.forEach((c, k) => paint(noteEls.current.get(k), c));
    },
  }));

  return (
    <div className="score-scroll" ref={scroller}>
      {loading && <div className="score-loading">Drawing the score…</div>}
      <div ref={host} className="osmd-host" />
    </div>
  );
});

function paint(els: SVGElement[] | undefined, color: string | null) {
  els?.forEach((g) => g.querySelectorAll('path, ellipse, rect').forEach((p) => {
    const el = p as SVGElement;
    if (color) { el.style.fill = color; el.style.stroke = color; } else { el.style.fill = ''; el.style.stroke = ''; }
  }));
}
