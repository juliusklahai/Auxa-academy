// Sing to score: sing into the microphone, Maestro writes down each note with its pitch and timing,
// then shows it as a score: the melody alone, or arranged for four voices (SATB) with chord names.
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { metronome } from '../audio/metronome';
import { freqToMidiFloat, midiToName } from '../core/music';
import { chordLabel, harmonize, STYLES, type ArrStyle } from '../compose/harmony';
import { melodyXml, playbackNotes, satbXml } from '../compose/score';
import { keyInfo, transcribe, type Melody, type PitchFrame } from '../compose/transcribe';
import { framesFromFile, framesFromSamples } from '../compose/audioFile';
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
  /** time signature and shortest note are found from the singing; they can be changed on the result */
  const [meter, setMeter] = useState<'auto' | '4/4' | '3/4' | '2/4' | '6/8'>('auto');
  const [grid, setGrid] = useState<'auto' | '1' | '0.5' | '0.25'>('auto');
  const [style, setStyle] = useState<ArrStyle>('hymn');
  /** how to read the rhythm: as heard, or every note twice as long / half as long */
  const [feel, setFeel] = useState<'1' | '0.5' | '2'>('1');
  const [take, setTake] = useState<string | null>(null); // the recording itself, to compare with the score
  const [busy, setBusy] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const takeEl = useRef<HTMLAudioElement | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const heard = useRef<{ free: boolean; bpm: number; origin?: number } | null>(null);
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
  const TS: Record<string, [number, number]> = { '4/4': [4, 4], '3/4': [3, 4], '2/4': [2, 4], '6/8': [6, 8] };
  const ts: [number, number] = TS[meter] ?? [4, 4];
  const fix = (m2 = meter, g2 = grid) => ({ ...(m2 !== 'auto' ? { timeSig: TS[m2] } : {}), ...(g2 !== 'auto' ? { grid: +g2 } : {}) });

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

  useEffect(() => () => { timers.current.forEach(clearTimeout); metronome.stop(); audio.stopAll(); mic.singing = false; if (capturing.current) mic.stopCapture(); if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); onRecording?.(false); }, []); // eslint-disable-line
  useEffect(() => { onRecording?.(phase === 'rec' || phase === 'countin'); }, [phase]); // eslint-disable-line

  const record = async () => {
    if (!micOn) { try { await startMic(); } catch { return; } }
    audio.stopAll(); setPlaying(false);
    frames.current = []; setMel(null); setKeyOverride(''); setFeel('1'); setMeter('auto'); setGrid('auto');
    mic.singing = true;
    startTake();
    const beatMs = 60000 / bpm;
    if (free) { setPhase('rec'); return; }
    metronome.start(bpm, ts[0]);
    origin.current = performance.now() + 80 + ts[0] * beatMs;
    setPhase('countin');
    for (let i = 0; i < ts[0]; i++) timers.current.push(window.setTimeout(() => setCount(ts[0] - i), 80 + i * beatMs));
    timers.current.push(window.setTimeout(() => { setPhase('rec'); setCount(0); if (!click) metronome.stop(); }, 80 + ts[0] * beatMs));
  };

  const capturing = useRef(false);
  const startTake = () => {
    if (take) URL.revokeObjectURL(take);
    setTake(null);
    // every sample of the take is kept, so it can be listened to again in full after singing
    capturing.current = mic.startCapture();
    if (capturing.current) return;
    const st = mic.mediaStream;
    if (!st || typeof MediaRecorder === 'undefined') return;
    try {
      const r = new MediaRecorder(st), chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => setTake(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })));
      r.start(); rec.current = r;
    } catch { rec.current = null; }
  };

  /** Readings -> melody, honoring the rhythm reading chosen. */
  const write = (fr: PitchFrame[], h: { free: boolean; bpm: number; origin?: number }, f: string, fx = fix()) => {
    const k = +f;
    if (h.free) {
      const auto = transcribe(fr, fx);
      if (!auto || k === 1) return auto;
      return transcribe(fr, { bpm: Math.round(auto.bpm * k), ...fx });
    }
    return transcribe(fr, { bpm: h.bpm * k, origin: h.origin, ...fx });
  };

  const stop = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    metronome.stop();
    mic.singing = false;
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    rec.current = null;
    heard.current = free ? { free: true, bpm } : { free: false, bpm, origin: origin.current };
    const cap = capturing.current ? mic.stopCapture() : null;
    capturing.current = false;
    setLive(null);
    if (cap && cap.samples.length > cap.sampleRate * 0.6) {
      // Listen to the whole take again, sample by sample, before writing: the live readings are snapshots
      // and can skip quick notes when the phone is busy. The full recording does not.
      setBusy(true); setPhase('done');
      window.setTimeout(() => {
        const full = framesFromSamples(cap.samples, cap.sampleRate, audio.a4).map((f) => ({ ...f, t: f.t + cap.startPerf }));
        frames.current = full.length ? full : frames.current;
        (window as unknown as { __s2s?: PitchFrame[] }).__s2s = frames.current; // for troubleshooting
        if (take) URL.revokeObjectURL(take);
        setTake(URL.createObjectURL(toWav(cap.samples, cap.sampleRate)));
        const m = write(frames.current, heard.current!, '1', {});
        setMel(m); setBusy(false);
        if (m && free) setBpm(m.bpm);
      }, 30);
      return;
    }
    (window as unknown as { __s2s?: PitchFrame[] }).__s2s = frames.current;
    const m = write(frames.current, heard.current, '1', {});
    setMel(m); setPhase('done');
    if (m && free) setBpm(m.bpm);
  };

  const reread = (f: '1' | '0.5' | '2', m2 = meter, g2 = grid) => {
    setFeel(f); setMeter(m2); setGrid(g2);
    if (!heard.current) return;
    setMel(write(frames.current, heard.current, f, fix(m2, g2)));
  };

  /** Score from an audio file: a voice memo, a recording of you singing. */
  const fromFile = async (file: File) => {
    setBusy(true); audio.stopAll(); setPlaying(false); setMel(null); setKeyOverride(''); setFeel('1'); setMeter('auto'); setGrid('auto');
    try {
      const ctx = audio.ensure();
      const fr = await framesFromFile(file, ctx, audio.a4);
      frames.current = fr;
      heard.current = { free: true, bpm };
      if (take) URL.revokeObjectURL(take);
      setTake(URL.createObjectURL(file));
      const name = file.name.replace(/\.[^.]+$/, '');
      if (name) setTitle(name.slice(0, 60));
      const m = write(fr, heard.current, '1', {});
      setMel(m); setPhase('done');
      if (m) setBpm(m.bpm);
    } catch {
      setMel(null); setPhase('done');
    } finally { setBusy(false); }
  };

  const hearTake = () => {
    const el = takeEl.current;
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    audio.stopAll(); setPlaying(false);
    el.currentTime = 0; void el.play();
  };

  const melody = useMemo(() => {
    if (!mel) return null;
    if (!keyOverride) return mel;
    const [pc, mode] = keyOverride.split(':');
    return { ...mel, key: keyInfo(+pc, mode as 'major' | 'minor') };
  }, [mel, keyOverride]);
  const harmony = useMemo(() => (melody ? harmonize(melody, style) : null), [melody, style]);
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
          <p className="muted small">Sing a tune, or load a recording of yourself singing. Maestro writes down every note and how long you held it, then can arrange it for four voices.</p>
        </div>
        {!recording && (
          <button className="btn lime s2s-rec" onClick={() => void record()}><span className="rec-dot" />{phase === 'done' ? 'Sing again' : 'Start singing'}</button>
        )}
        {recording && <button className="btn dark s2s-rec" onClick={stop}><span className="stop-sq" />Stop</button>}
      </div>
      <input ref={fileIn} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
      {take && <audio ref={takeEl} src={take} preload="auto" hidden />}

      {!recording && phase !== 'done' && (
        <div className="s2s-opts">
          <label className="s2s-opt"><span>Tempo</span>
            <Select value={free ? 'free' : 'fixed'} aria-label="Tempo" onChange={(e) => setFree(e.target.value === 'free')}>
              <option value="fixed">With a click</option><option value="free">Free: find my tempo</option>
            </Select>
          </label>
          {!free && <label className="s2s-opt"><span>Speed {bpm} bpm</span><input type="range" min={50} max={150} value={bpm} onChange={(e) => setBpm(+e.target.value)} /></label>}
          {!free && <label className="s2s-check"><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> Click while I sing</label>}
          <button className="btn s2s-file" disabled={busy} onClick={() => fileIn.current?.click()}><Icon name="upload" size={15} />{busy ? 'Listening to it…' : 'Use a recording'}</button>
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

      {phase === 'done' && busy && <p className="s2s-busy"><span className="s2s-spin" />Listening back to your take and writing every note…</p>}
      {phase === 'done' && !melody && !busy && <p className="tip small">No clear notes heard. Sing a little louder, closer to the microphone, on “la” or “loo”.</p>}

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
            <Select value={feel} aria-label="Rhythm" onChange={(e) => reread(e.target.value as '1')}>
              <option value="1">Rhythm as heard</option><option value="0.5">Longer notes (half time)</option><option value="2">Shorter notes (double time)</option>
            </Select>
            <Select value={meter} aria-label="Time signature" onChange={(e) => reread(feel, e.target.value as '4/4')}>
              <option value="auto">{`Time: ${melody.timeSig[0]}/${melody.timeSig[1]} (found)`}</option><option value="4/4">4/4</option><option value="3/4">3/4</option><option value="2/4">2/4</option><option value="6/8">6/8</option>
            </Select>
            <Select value={grid} aria-label="Shortest note" onChange={(e) => reread(feel, meter, e.target.value as '0.5')}>
              <option value="auto">Detail: auto</option><option value="1">Quarters</option><option value="0.5">Eighths</option><option value="0.25">Sixteenths</option>
            </Select>
            <input className="s2s-name" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" />
            <span className="muted small s2s-stats">{noteCount} notes · {melody.bars} bars · {melody.bpm} bpm{view === 'satb' && harmony?.melodyShift ? ` · tune written ${harmony.melodyShift > 0 ? 'an octave up' : 'an octave down'} for soprano` : ''}</span>
          </div>
          {view === 'satb' && harmony && (
            <div className="s2s-arr">
              <Select value={style} aria-label="Arrangement" onChange={(e) => setStyle(e.target.value as ArrStyle)}>
                {STYLES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <p className="muted small">{STYLES.find((x) => x.id === style)?.about}</p>
              <div className="s2s-chords">{harmony.slots.filter((s, i) => s.chord && !(harmony.slots[i - 1]?.chord && harmony.slots[i - 1].chord!.degree === s.chord.degree && harmony.slots[i - 1].chord!.inv === s.chord.inv)).map((s, i) => <span key={i}>{chordLabel(s.chord!)}</span>)}</div>
              <details className="s2s-how"><summary>How it is arranged</summary><ul>{harmony.techniques.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
            </div>
          )}
          <div className="s2s-score"><ScoreView xml={xml} zoom={0.85} /></div>
          <div className="s2s-actions">
            <button className="btn dark" onClick={play}><Icon name={playing ? 'pause' : 'play'} size={15} />{playing ? 'Stop' : 'Play it back'}</button>
            {take && <button className="btn" onClick={hearTake}><Icon name="mic" size={15} />Hear my recording</button>}
            <button className="btn" onClick={() => fileIn.current?.click()} disabled={busy}><Icon name="upload" size={15} />Use a recording</button>
            <button className="btn" onClick={() => openScore(xml)}><Icon name="note" size={15} />Practice in My Music</button>
            <button className="btn" onClick={download}><Icon name="doc" size={15} />Download MusicXML</button>
          </div>
        </>
      )}
    </section>
  );
}

/** 16-bit mono WAV, so the take can be played back next to the score. */
function toWav(x: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const g = peak > 0 ? Math.min(8, 0.9 / peak) : 1; // bring quiet takes up to a comfortable level
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i] * g)) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
