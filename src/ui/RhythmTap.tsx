// Prepare: tap (or clap) the rhythm of a piece before playing it. Tap the pad, press Space, or any piano key.
// One bar of count-in, then the clicks carry on while you tap; each note's onset is marked on time, close, or missed.
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { clickBpm, msPerBeat } from '../audio/timing';
import type { ScoreEvent } from '../core/types';
import { onLearnerNote } from '../input/bus';
import { Icon } from './Icon';

type Mark = 'hit' | 'near' | 'miss' | 'wait';

export function RhythmTap({ events, bpm, timeSig, onClose }: { events: ScoreEvent[]; bpm: number; timeSig: [number, number]; onClose: () => void }) {
  const onsets = [...new Set(events.filter((e) => e.pitches.length).map((e) => Math.round(e.beat * 1000) / 1000))].sort((a, b) => a - b);
  const [marks, setMarks] = useState<Mark[]>(onsets.map(() => 'wait'));
  const [phase, setPhase] = useState<'ready' | 'count' | 'tap' | 'done'>('ready');
  const [extra, setExtra] = useState(0);
  const [flash, setFlash] = useState(false);
  const t0 = useRef(0);
  const taken = useRef<boolean[]>([]);
  const timers = useRef<number[]>([]);
  const mspb = msPerBeat(bpm);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const start = () => {
    clear();
    const cms = msPerBeat(clickBpm(bpm, timeSig)), lead = 150, n = timeSig[0];
    const inMs = n * cms;
    const last = onsets[onsets.length - 1] ?? 0;
    const endMs = (last + 1.5) * mspb;
    t0.current = performance.now() + lead + inMs;
    taken.current = onsets.map(() => false);
    setMarks(onsets.map(() => 'wait')); setExtra(0); setPhase('count');
    for (let i = 0; i * cms < inMs + endMs; i++) audio.click(i % n === 0, false, lead + i * cms);
    timers.current.push(window.setTimeout(() => setPhase('tap'), lead + inMs - 200));
    timers.current.push(window.setTimeout(() => {
      setMarks((m) => m.map((x) => (x === 'wait' ? 'miss' : x)));
      setPhase('done');
    }, lead + inMs + endMs));
  };

  const tap = () => {
    setFlash(true); window.setTimeout(() => setFlash(false), 90);
    if (phase !== 'tap' && phase !== 'count') return;
    const beat = (performance.now() - t0.current) / mspb;
    const win = Math.max(0.12, 110 / mspb) * 2.2;
    let best = -1, bestD = Infinity;
    onsets.forEach((o, i) => { const d = Math.abs(o - beat); if (!taken.current[i] && d < bestD) { best = i; bestD = d; } });
    if (best < 0 || bestD > win) { setExtra((x) => x + 1); return; }
    taken.current[best] = true;
    const ms = bestD * mspb;
    setMarks((m) => m.map((x, i) => (i === best ? (ms <= 110 ? 'hit' : 'near') : x)));
  };
  const tapRef = useRef(tap); tapRef.current = tap;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); tapRef.current(); } };
    window.addEventListener('keydown', key);
    const off = onLearnerNote((n) => { if (n.on) tapRef.current(); });
    return () => { window.removeEventListener('keydown', key); off(); };
  }, []);

  const hits = marks.filter((m) => m === 'hit').length, near = marks.filter((m) => m === 'near').length;
  const score = onsets.length ? Math.round(((hits + near * 0.6) / onsets.length) * 100) : 0;
  return (
    <div className="rtap" role="dialog" aria-label="Tap the rhythm first">
      <div className="rtap-head">
        <div><small className="muted">Prepare</small><b>Tap the rhythm first</b></div>
        <button className="icon-btn" onClick={() => { clear(); onClose(); }} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <p className="muted">Say the rhythm words as you tap. One bar of clicks counts you in. Tap the pad, press Space, or play any key.</p>
      <div className="rtap-dots" aria-hidden>{marks.map((m, i) => <i key={i} className={m} />)}</div>
      <button className={`rtap-pad ${flash ? 'hit' : ''} ${phase}`} onPointerDown={(e) => { e.preventDefault(); tap(); }}>
        {phase === 'ready' ? 'Tap here' : phase === 'count' ? 'Get ready…' : phase === 'tap' ? 'Tap!' : `${score}%`}
      </button>
      {phase === 'done' && <p className="rtap-sum">{score >= 80 ? 'Your rhythm is ready. Now play it.' : 'Listen to the demo once more, say the words, and tap again.'}{extra > 0 && ` (${extra} extra tap${extra > 1 ? 's' : ''})`}</p>}
      <div className="rtap-actions">
        <button className="btn lime" onClick={start} disabled={phase === 'count' || phase === 'tap'}><Icon name={phase === 'done' ? 'restart' : 'play'} size={15} />{phase === 'done' ? 'Tap again' : 'Start'}</button>
        {phase === 'done' && score >= 80 && <button className="btn" onClick={() => { clear(); onClose(); }}>Now play it<Icon name="next" size={14} /></button>}
      </div>
    </div>
  );
}
