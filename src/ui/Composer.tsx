// Create: play a short tune with the metronome and Maestro writes it down. Then hear it, try again, or add
// four-part harmony with the arranger and open it in My Music to keep, print or share.
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { clickBpm, msPerBeat } from '../audio/timing';
import { satbXml, melodyXml } from '../compose/score';
import { detectKey, quantize, type Melody, type SungNote } from '../compose/transcribe';
import type { ScoreEvent } from '../core/types';
import { onLearnerNote } from '../input/bus';
import { Icon } from './Icon';
import { Piano } from './Piano';
import { Staff } from './Staff';

const PROMPTS = [
  'Use only C D E F G and end on C.',
  'Start on G, climb by steps, and come home to C.',
  'Ask a question in bars 1 and 2 (end high), answer it in bars 3 and 4 (end on C).',
  'Repeat bar 1 in bar 3, then change the ending.',
  'Use one long note in every bar.',
];

export function Composer({ openScore }: { openScore?: (xml: string) => void }) {
  const [bpm, setBpm] = useState(80);
  const [ts, setTs] = useState<[number, number]>([4, 4]);
  const [bars, setBars] = useState(4);
  const [phase, setPhase] = useState<'ready' | 'count' | 'rec' | 'done'>('ready');
  const [beat, setBeat] = useState(-1);
  const [melody, setMelody] = useState<Melody | null>(null);
  const [title, setTitle] = useState('My tune');
  const [marks, setMarks] = useState(new Map<number, 'played'>());
  const [prompt, setPrompt] = useState(0);
  const sung = useRef<SungNote[]>([]);
  const open = useRef(new Map<number, number>());
  const t0 = useRef(0);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  useEffect(() => onLearnerNote((n) => {
    setMarks((m) => { const x = new Map(m); if (n.on) x.set(n.midi, 'played'); else x.delete(n.midi); return x; });
    if (phaseRef.current !== 'rec' && phaseRef.current !== 'count') return;
    if (n.on) {
      // a melody: a new note ends the one before
      for (const [m, s] of open.current) { sung.current.push({ midi: m, start: s, end: n.at, cents: 0 }); open.current.delete(m); }
      open.current.set(n.midi, n.at);
    } else if (open.current.has(n.midi)) {
      sung.current.push({ midi: n.midi, start: open.current.get(n.midi)!, end: n.at, cents: 0 });
      open.current.delete(n.midi);
    }
  }), []);

  const finish = () => {
    const now = performance.now();
    for (const [m, s] of open.current) sung.current.push({ midi: m, start: s, end: now, cents: 0 });
    open.current.clear();
    const notes = sung.current.filter((s) => s.start >= t0.current - msPerBeat(bpm) * 0.5);
    setBeat(-1);
    if (!notes.length) { setMelody(null); setPhase('ready'); return; }
    const q = quantize(notes, bpm, t0.current, ts, 0.5);
    const barBeats = ts[0] * (4 / ts[1]);
    const kept = q.filter((n) => n.beat < bars * barBeats - 1e-6).map((n) => ({ ...n, beats: Math.min(n.beats, bars * barBeats - n.beat) }));
    const key = detectKey(kept.map((n) => ({ midi: n.midi, beats: n.beats })));
    setMelody({ notes: kept, bpm, timeSig: ts, key, bars });
    setPhase('done');
  };

  const record = () => {
    clear(); sung.current = []; open.current.clear(); setMelody(null);
    const cbpm = clickBpm(bpm, ts), cms = msPerBeat(cbpm), n = ts[0], lead = 200;
    const inMs = n * cms, recMs = bars * n * cms;
    t0.current = performance.now() + lead + inMs;
    setPhase('count');
    for (let i = 0; i < n + bars * n; i++) {
      audio.click(i % n === 0, false, lead + i * cms);
      timers.current.push(window.setTimeout(() => setBeat(i < n ? -(n - i) : (i - n) % n), lead + i * cms));
    }
    timers.current.push(window.setTimeout(() => setPhase('rec'), lead + inMs - 120));
    timers.current.push(window.setTimeout(finish, lead + inMs + recMs + 60));
  };

  const play = () => {
    if (!melody) return;
    const b = msPerBeat(melody.bpm);
    audio.playNotes(melody.notes.filter((n) => n.midi !== null).map((n) => ({ midi: n.midi!, startMs: n.beat * b, durMs: n.beats * b * 0.95 })));
  };

  const events: ScoreEvent[] = useMemo(() => (melody?.notes ?? []).filter((n) => n.midi !== null).map((n) => ({ beat: n.beat, beats: n.beats, pitches: [n.midi!], hand: 'RH' as const })), [melody]);
  const lo = 48, hi = 84;
  return (
    <section className="level composer">
      <div className="level-head"><b>Create</b><span className="muted">Make up a tune, and Maestro writes it down</span></div>
      <div className="card comp-card">
        <div className="comp-idea"><Icon name="note" size={16} /><span><b>Idea:</b> {PROMPTS[prompt]}</span><button className="link" onClick={() => setPrompt((p) => (p + 1) % PROMPTS.length)}>Another idea</button></div>
        <div className="comp-set">
          <label>Tempo <input type="range" min={56} max={120} value={bpm} onChange={(e) => setBpm(+e.target.value)} disabled={phase === 'count' || phase === 'rec'} /> <b>{bpm}</b></label>
          <div className="chip-row">
            {([[4, 4], [3, 4]] as [number, number][]).map((x) => <button key={x.join('/')} className={`chip ${ts[0] === x[0] ? 'on' : ''}`} onClick={() => setTs(x)} disabled={phase === 'count' || phase === 'rec'}>{x[0]}/{x[1]}</button>)}
            {[4, 8].map((b) => <button key={b} className={`chip ${bars === b ? 'on' : ''}`} onClick={() => setBars(b)} disabled={phase === 'count' || phase === 'rec'}>{b} bars</button>)}
          </div>
        </div>
        <div className="comp-beats" aria-hidden>{Array.from({ length: ts[0] }, (_, i) => <i key={i} className={beat === i ? 'on' : ''} />)}<span>{phase === 'count' ? `Ready… ${-beat}` : phase === 'rec' ? 'Play your tune' : phase === 'done' ? 'Written down' : 'Press record, wait one bar, then play'}</span></div>
        {melody && (
          <div className="comp-score">
            <Staff events={events} clef={events.some((e) => e.pitches[0] < 57) && events.every((e) => e.pitches[0] < 64) ? 'bass' : 'treble'} timeSig={ts} fifths={melody.key.fifths} measureWidth={200} />
            <small className="muted">{melody.key.name}, {melody.bpm} bpm. Notes are rounded to the nearest half beat.</small>
          </div>
        )}
        <div className="comp-actions">
          <button className="btn lime" onClick={record} disabled={phase === 'count' || phase === 'rec'}><Icon name="mic" size={15} />{phase === 'done' ? 'Record again' : 'Record'}</button>
          {(phase === 'count' || phase === 'rec') && <button className="btn" onClick={() => { clear(); finish(); }}>Stop</button>}
          {melody && <button className="btn" onClick={play}><Icon name="play" size={15} />Hear it</button>}
        </div>
        {melody && openScore && (
          <div className="comp-keep">
            <label>Title<input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
            <button className="btn" onClick={() => openScore(melodyXml(melody, title, undefined, true))}><Icon name="doc" size={15} />Open in My Music</button>
            <button className="btn" onClick={() => openScore(satbXml(melody, title))}><Icon name="chord" size={15} />Add four-part harmony</button>
          </div>
        )}
      </div>
      <div className="comp-piano"><Piano marks={marks} lo={lo} hi={hi} height={150} labels="letters" /></div>
    </section>
  );
}
