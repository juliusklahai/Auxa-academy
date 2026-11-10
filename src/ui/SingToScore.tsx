// Sing to score: sing into the microphone, Maestro writes down each note with its pitch and timing,
// then shows it as a score: the melody alone, or arranged for four voices (SATB) with chord names.
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { metronome } from '../audio/metronome';
import { freqToMidiFloat, midiToName } from '../core/music';
import { harmonize } from '../compose/harmony';
import { melodyXml, playbackNotes, satbXml } from '../compose/score';
import { keyInfo, transcribe, type Melody, type PitchFrame } from '../compose/transcribe';
import { mic, type MicFrame } from '../input/mic';
import { Icon } from './Icon';
import { ScoreView } from './ScoreView';
import { Select } from './Select';

type Phase = 'idle' | 'countin' | 'rec' | 'done';
const KEYS = [0, 7, 2, 9, 4, 11, 5, 10, 3, 8, 1, 6];

export function SingToScore({ micOn, startMic, openScore, onRecording }: { micOn: boolean; startMic: () => Promise<void>; openScore: (xml: string) => void; onRecording?: (on: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bpm, setBpm] = useState(84);
  const [free, setFree] = useState(false);
  const [click, setClick] = useState(true);
  const [meter, setMeter] = useState<'4/4' | '3/4'>('4/4');
  const [grid, setGrid] = useState('0.5');
  const [view, setView] = useState<'melody' | 'satb'>('melody');
  const [title, setTitle] = useState('My song');
  const [mel, setMel] = useState<Melody | null>(null);
  const [keyOverride, setKeyOverride] = useState('');
  const [count, setCount] = useState(0);
  const [live, setLive] = useState<{ name: string; cents: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const frames = useRef<PitchFrame[]>([]);
  const origin = useRef(0);
  const timers = useRef<number[]>([]);
  const trace = useRef<SVGPolylineElement>(null);
  const ts: [number, number] = meter === '3/4' ? [3, 4] : [4, 4];

  // collect pitch readings while recording
  useEffect(() => {
    if (phase !== 'rec' && phase !== 'countin') return;
    const l = (f: MicFrame) => {
      if (f.suppressed) return; // the app's own click: skip, do not count as silence
      const t = performance.now();
      const clear = f.freq > 0 && f.confidence >= 0.75 && f.rms > mic.settings.noiseGate * 0.8;
      const m = clear ? freqToMidiFloat(f.freq, audio.a4) : null;
      frames.current.push({ t, midi: m, rms: f.rms });
      setLive(m === null ? null : { name: midiToName(Math.round(m)), cents: Math.round((m - Math.round(m)) * 100) });
      // live trace: the last 8 seconds
      const pts = frames.current.filter((x) => x.t > t - 8000);
      if (trace.current) trace.current.setAttribute('points', pts.map((x) => x.midi === null ? '' : `${((x.t - (t - 8000)) / 8000 * 600).toFixed(1)},${(120 - (x.midi - 40) * 2.6).toFixed(1)}`).filter(Boolean).join(' '));
    };
    mic.frameListeners.add(l);
    return () => { mic.frameListeners.delete(l); };
  }, [phase]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); metronome.stop(); audio.stopAll(); onRecording?.(false); }, []); // eslint-disable-line
  useEffect(() => { onRecording?.(phase === 'rec' || phase === 'countin'); }, [phase]); // eslint-disable-line

  const record = async () => {
    if (!micOn) { try { await startMic(); } catch { return; } }
    audio.stopAll(); setPlaying(false);
    frames.current = []; setMel(null); setKeyOverride('');
    const beatMs = 60000 / bpm;
    if (free) { setPhase('rec'); return; }
    metronome.start(bpm, ts[0]);
    origin.current = performance.now() + 80 + ts[0] * beatMs;
    setPhase('countin');
    for (let i = 0; i < ts[0]; i++) timers.current.push(window.setTimeout(() => setCount(ts[0] - i), 80 + i * beatMs));
    timers.current.push(window.setTimeout(() => { setPhase('rec'); setCount(0); if (!click) metronome.stop(); }, 80 + ts[0] * beatMs));
  };

  const stop = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    metronome.stop();
    (window as unknown as { __s2s?: PitchFrame[] }).__s2s = frames.current; // for troubleshooting
    const m = transcribe(frames.current, free ? { timeSig: ts, grid: +grid } : { bpm, origin: origin.current, timeSig: ts, grid: +grid });
    setMel(m); setPhase('done'); setLive(null);
    if (m && free) setBpm(m.bpm);
  };

  const melody = useMemo(() => {
    if (!mel) return null;
    if (!keyOverride) return mel;
    const [pc, mode] = keyOverride.split(':');
    return { ...mel, key: keyInfo(+pc, mode as 'major' | 'minor') };
  }, [mel, keyOverride]);
  const harmony = useMemo(() => (melody ? harmonize(melody) : null), [melody]);
  const xml = useMemo(() => (!melody ? '' : view === 'satb' ? satbXml(melody, title, harmony!) : melodyXml(melody, title)), [melody, view, title, harmony]);
  const noteCount = melody?.notes.filter((n) => n.midi !== null).length ?? 0;

  const play = () => {
    if (!melody) return;
    if (playing) { audio.stopAll(); setPlaying(false); return; }
    const voices = view === 'satb' && harmony ? harmony.voices : [{ notes: melody.notes }];
    const notes = playbackNotes(voices, melody.bpm);
    audio.playNotes(notes, view === 'satb' ? 0.55 : 0.75);
    setPlaying(true);
    const end = Math.max(0, ...notes.map((n) => n.startMs + n.durMs));
    timers.current.push(window.setTimeout(() => setPlaying(false), end + 200));
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
    a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'song'}${view === 'satb' ? ' (SATB)' : ''}.musicxml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const recording = phase === 'rec' || phase === 'countin';
  return (
    <section className="card s2s">
      <div className="s2s-head">
        <div>
          <span className="s2s-kicker"><i />New</span>
          <b className="s2s-title">Sing to score</b>
          <p className="muted small">Sing a tune. Maestro writes down every note and how long you held it, then can arrange it for four voices.</p>
        </div>
        {!recording && (
          <button className="btn lime s2s-rec" onClick={() => void record()}><span className="rec-dot" />{phase === 'done' ? 'Sing again' : 'Start singing'}</button>
        )}
        {recording && <button className="btn dark s2s-rec" onClick={stop}><span className="stop-sq" />Stop</button>}
      </div>

      {!recording && phase !== 'done' && (
        <div className="s2s-opts">
          <label className="s2s-opt"><span>Tempo</span>
            <Select value={free ? 'free' : 'fixed'} aria-label="Tempo" onChange={(e) => setFree(e.target.value === 'free')}>
              <option value="fixed">With a click</option><option value="free">Free: find my tempo</option>
            </Select>
          </label>
          {!free && <label className="s2s-opt"><span>Speed {bpm} bpm</span><input type="range" min={50} max={150} value={bpm} onChange={(e) => setBpm(+e.target.value)} /></label>}
          <label className="s2s-opt"><span>Time</span>
            <Select value={meter} aria-label="Time signature" onChange={(e) => setMeter(e.target.value as '4/4')}><option value="4/4">4/4</option><option value="3/4">3/4</option></Select>
          </label>
          <label className="s2s-opt"><span>Shortest note</span>
            <Select value={grid} aria-label="Shortest note" onChange={(e) => setGrid(e.target.value)}><option value="1">Quarter</option><option value="0.5">Eighth</option><option value="0.25">Sixteenth</option></Select>
          </label>
          {!free && <label className="s2s-check"><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> Click while I sing</label>}
        </div>
      )}

      {recording && (
        <div className="s2s-live">
          <div className="s2s-now">
            {phase === 'countin' ? <><small>Get ready</small><b>{count || '…'}</b></> : <><small>{live ? `${live.cents > 0 ? '+' : ''}${live.cents} cents` : 'Listening'}</small><b>{live?.name ?? '·'}</b></>}
          </div>
          <svg className="s2s-trace" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="0" x2="600" y1={20 + i * 20} y2={20 + i * 20} />)}
            <polyline ref={trace} />
          </svg>
          <p className="muted small">{free ? 'Sing at your own speed. Press Stop when you finish.' : click ? 'Sing with the click. Press Stop when you finish.' : 'Keep the count you heard. Press Stop when you finish.'} Use headphones if the click is on.</p>
        </div>
      )}

      {phase === 'done' && !melody && <p className="tip small">No clear notes heard. Sing a little louder, closer to the microphone, on “la” or “loo”.</p>}

      {phase === 'done' && melody && (
        <>
          <div className="s2s-bar">
            <div className="seg">
              <button className={view === 'melody' ? 'on' : ''} onClick={() => setView('melody')}>Melody</button>
              <button className={view === 'satb' ? 'on' : ''} onClick={() => setView('satb')}>Four parts (SATB)</button>
            </div>
            <Select value={keyOverride || `${melody.key.tonic}:${melody.key.mode}`} aria-label="Key" onChange={(e) => setKeyOverride(e.target.value)}>
              <optgroup label="Major">{KEYS.map((k) => <option key={`M${k}`} value={`${k}:major`}>{keyInfo(k, 'major').name}</option>)}</optgroup>
              <optgroup label="Minor">{KEYS.map((k) => <option key={`m${k}`} value={`${(k + 9) % 12}:minor`}>{keyInfo((k + 9) % 12, 'minor').name}</option>)}</optgroup>
            </Select>
            <input className="s2s-name" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" />
            <span className="muted small s2s-stats">{noteCount} notes · {melody.bars} bars · {melody.bpm} bpm{view === 'satb' && harmony?.melodyShift ? ` · tune written ${harmony.melodyShift > 0 ? 'an octave up' : 'an octave down'} for soprano` : ''}</span>
          </div>
          {view === 'satb' && harmony && (
            <div className="s2s-chords">{harmony.slots.filter((s) => s.chord).map((s, i) => <span key={i}>{s.chord!.degree}</span>)}</div>
          )}
          <div className="s2s-score"><ScoreView xml={xml} zoom={0.85} /></div>
          <div className="s2s-actions">
            <button className="btn dark" onClick={play}><Icon name={playing ? 'pause' : 'play'} size={15} />{playing ? 'Stop' : 'Play it back'}</button>
            <button className="btn" onClick={() => openScore(xml)}><Icon name="note" size={15} />Practice in My Music</button>
            <button className="btn" onClick={download}><Icon name="doc" size={15} />Download MusicXML</button>
          </div>
        </>
      )}
    </section>
  );
}
