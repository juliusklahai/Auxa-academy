// Hear-and-see demos for speed and meter: each tempo word pulses at its own speed while the same little
// tune plays; each time signature lights its strong and weak beats in time.
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { METERS, TEMPOS, meterSound, tempoSound } from '../curriculum/readingDrills';
import { Icon } from './Icon';

function useClock() {
  const raf = useRef(0);
  const [t, setT] = useState<number | null>(null);
  const start = (ms: number, onEnd?: () => void) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now() + 50;
    const tick = () => { const e = performance.now() - t0; setT(e); if (e < ms) raf.current = requestAnimationFrame(tick); else { setT(null); onEnd?.(); } };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(raf.current); setT(null); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { t, start, stop };
}

/** Tempo words side by side. Tap one to hear it; "Hear them all" goes slow to fast. */
export function TempoDemo({ words, playKey = 0 }: { words: string[]; playKey?: number }) {
  const list = TEMPOS.filter((x) => words.includes(x.id));
  const [cur, setCur] = useState<string | null>(null);
  const clock = useClock();
  const queue = useRef<string[]>([]);
  const playOne = (id: string, then?: () => void) => {
    const tp = TEMPOS.find((x) => x.id === id)!;
    const s = tempoSound(tp.bpm);
    audio.stopAll(); audio.playNotes(s, 0.7);
    setCur(id);
    const ms = Math.max(...s.map((n) => n.startMs + n.durMs));
    clock.start(ms, () => { setCur(null); then?.(); });
  };
  const playAll = () => {
    queue.current = list.map((x) => x.id);
    const next = () => { const id = queue.current.shift(); if (id) window.setTimeout(() => playOne(id, next), 350); };
    next();
  };
  useEffect(() => { if (playKey) playAll(); }, [playKey]); // eslint-disable-line
  useEffect(() => () => { queue.current = []; audio.stopAll(); }, []);
  return (
    <div className="pulse-demo">
      <div className="tempo-grid">
        {list.map((x) => {
          const beatMs = 60000 / x.bpm;
          const on = cur === x.id && clock.t !== null;
          const phase = on ? (clock.t! % beatMs) / beatMs : 1;
          return (
            <button key={x.id} className={`tempo-card ${on ? 'on' : ''}`} onClick={() => { queue.current = []; playOne(x.id); }}>
              <span className="tempo-pulse" style={{ transform: `scale(${on ? 1.35 - Math.min(1, phase * 2.2) * 0.35 : 1})`, opacity: on ? 1 - phase * 0.6 : 0.35 }} />
              <b>{x.id}</b>
              <span>{x.means}</span>
              <small>about {x.bpm} beats a minute</small>
            </button>
          );
        })}
      </div>
      <button className="btn small" onClick={playAll}><Icon name="play" size={13} />Hear them all, slow to fast</button>
    </div>
  );
}

/** Time signatures with their beats: big circles are strong beats, lit in time as the bar plays. */
export function MeterDemo({ meters, playKey = 0 }: { meters: string[]; playKey?: number }) {
  const [cur, setCur] = useState<string | null>(null);
  const clock = useClock();
  const queue = useRef<string[]>([]);
  const playOne = (id: string, then?: () => void) => {
    const s = meterSound(id, 2);
    audio.stopAll(); audio.playNotes(s, 0.7);
    setCur(id);
    const ms = Math.max(...s.map((n) => n.startMs + n.durMs));
    clock.start(ms, () => { setCur(null); then?.(); });
  };
  const playAll = () => {
    queue.current = [...meters];
    const next = () => { const id = queue.current.shift(); if (id) window.setTimeout(() => playOne(id, next), 400); };
    next();
  };
  useEffect(() => { if (playKey) playAll(); }, [playKey]); // eslint-disable-line
  useEffect(() => () => { queue.current = []; audio.stopAll(); }, []);
  return (
    <div className="pulse-demo">
      {meters.map((id) => {
        const m = METERS[id];
        if (!m) return null;
        const on = cur === id && clock.t !== null;
        const k = on ? Math.floor(clock.t! / m.beatMs) % m.per : -1;
        return (
          <button key={id} className={`meter-row ${on ? 'on' : ''}`} onClick={() => { queue.current = []; playOne(id); }}>
            <b className="meter-sig"><span>{id.split('/')[0]}</span><span>{id.split('/')[1]}</span></b>
            <span className="meter-beats">
              {m.strong.map((s, i) => <i key={i} className={`${s === 1 ? 'strong' : s ? 'mid' : ''} ${k === i ? 'lit' : ''}`}>{i + 1}</i>)}
            </span>
            <small>{m.how}</small>
          </button>
        );
      })}
      <button className="btn small" onClick={playAll}><Icon name="play" size={13} />Hear each one</button>
    </div>
  );
}
