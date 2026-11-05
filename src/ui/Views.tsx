import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { metronome } from '../audio/metronome';
import { midiToName } from '../core/music';
import type { Lesson, SkillId } from '../core/types';
import { LEVEL_GROUP, LEVEL_NAMES } from '../curriculum/levels';
import { AccountCard } from './Account';
import { allowLesson, lessonTier, TIER_NAME } from '../account/gate';
import { getAccount, useAccount } from '../account/store';
import { LESSONS, PIANO_LESSONS, VOICE_LESSONS } from '../curriculum/lessons';
import { onLearnerNote } from '../input/bus';
import { mic, type MicFrame, micHelp } from '../input/mic';
import { midiIn } from '../input/midi';
import { dayKey } from '../progress/store';
import { Icon } from './Icon';
import { Metric } from './LessonView';
import { SongShelf } from './MyMusic';
import { Piano, type KeyMark } from './Piano';
import { bumpProgress, progress, setSettings, useProgressVersion, useSettings } from './settings';

const SKILL_LABEL: Record<SkillId, string> = {
  keyboardGeography: 'Keyboard geography', noteReadingTreble: 'Reading: treble', noteReadingBass: 'Reading: bass',
  pitchAccuracy: 'Pitch accuracy', rhythm: 'Rhythm', pulse: 'Steady pulse', fingerTechnique: 'Finger technique',
};
const LEVEL_NAME = LEVEL_NAMES;

/** Lime area sparkline of attempt scores, with a dark marker on the best attempt. */
function Spark({ values }: { values: number[] }) {
  const W = 200, H = 64;
  if (values.length === 0) return <div className="spark empty"><span>No attempts yet</span></div>;
  const v = values.length === 1 ? [values[0], values[0]] : values;
  const x = (i: number) => (i / (v.length - 1)) * W;
  const y = (s: number) => H - 6 - (s / 100) * (H - 14);
  let d = `M0 ${y(v[0])}`;
  for (let i = 1; i < v.length; i++) { const cx = (x(i - 1) + x(i)) / 2; d += ` C${cx} ${y(v[i - 1])}, ${cx} ${y(v[i])}, ${x(i)} ${y(v[i])}`; }
  const bi = v.indexOf(Math.max(...v));
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lime" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e3f53a" stopOpacity="0.95" /><stop offset="1" stopColor="#e3f53a" stopOpacity="0.08" /></linearGradient>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="#1f1f1d" strokeOpacity="0.12" strokeWidth="1.2" /></pattern>
        </defs>
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#lime)" />
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#hatch)" />
        <path d={d} fill="none" stroke="#1f1f1d" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={y(80)} y2={y(80)} stroke="#1f1f1d" strokeOpacity=".25" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="spark-pin" style={{ left: `${Math.min(80, Math.max(20, (x(bi) / W) * 100))}%`, top: `${(y(v[bi]) / H) * 100}%` }}>{Math.round(v[bi])}<small>/100</small></span>
    </div>
  );
}

function LessonCard({ l, onOpen }: { l: Lesson; onOpen: () => void }) {
  useAccount();
  const pro = !allowLesson(getAccount().ent, l);
  const unlocked = progress.lessonUnlocked(l, LESSONS);
  const done = progress.lessonComplete(l);
  const scores = l.exercises.flatMap((e) => progress.ex(e.id).attempts).sort((a, b) => a.at - b.at).map((a) => a.score).slice(-12);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const delta = scores.length >= 2 ? Math.round(scores[scores.length - 1] - scores[0]) : null;
  return (
    <button className={`lcard ${done ? 'done' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked && !pro} onClick={onOpen}>
      <div className="lcard-head"><b>{l.title}</b><span className="circle sm">{done ? <Icon name="check" size={14} /> : unlocked ? <Icon name="play" size={12} /> : <Icon name="lock" size={13} />}</span></div>
      {unlocked ? <Spark values={scores} /> : <p className="muted small">{l.summary}</p>}
      <div className="lcard-foot">
        <span>Average: <b>{avg ?? '-'}</b><small>/100</small></span>
        {pro && <span className={`pro-tag inline ${lessonTier(l)}`}>{TIER_NAME[lessonTier(l)]}</span>}
        {delta !== null && <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta}</span>}
        {!unlocked && !pro && <span className="muted small">Locked</span>}
      </div>
    </button>
  );
}

function PathTimeline({ lessons: all, openLesson }: { lessons: Lesson[]; openLesson: (l: Lesson, ex?: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const nextAll = all.find((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  const groups = [...new Set(all.map((l) => LEVEL_GROUP[l.level] ?? 'More'))];
  const [group, setGroup] = useState(() => LEVEL_GROUP[nextAll?.level ?? 0] ?? groups[0]);
  const lessons = all.filter((l) => (LEVEL_GROUP[l.level] ?? 'More') === group);
  const next = lessons.findIndex((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  useEffect(() => {
    const el = ref.current;
    const col = el?.querySelectorAll<HTMLElement>('.path-col')[next];
    if (el && col && next > 0) el.scrollTo({ left: Math.max(0, col.offsetLeft - 8), behavior: 'smooth' });
    else el?.scrollTo({ left: 0 });
  }, [next, group]);
  return (
    <>
    <div className="path-groups seg">{groups.map((g) => <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{g}<small> · Levels {[...new Set(all.filter((l) => LEVEL_GROUP[l.level] === g).map((l) => l.level))].join(', ')}</small></button>)}</div>
    <div className="path" ref={ref}>
      <div className="path-track">
        <div className="path-line" />
        {lessons.map((l, i) => {
          const done = progress.lessonComplete(l);
          const open = progress.lessonUnlocked(l, LESSONS);
          return (
            <div className={`path-col ${i === next ? 'current' : ''}`} key={l.id}>
              <span className={`node ${done ? 'done' : open ? 'open' : 'locked'}`}><Icon name={done ? 'check' : open ? 'doc' : 'lock'} size={15} /></span>
              <div className="path-body">
                <div className="when"><b>{l.id.replace('L', 'Level ').replace('-', ' · ')}</b><small>{LEVEL_NAME[l.level]}</small></div>
                <div className="path-row">
                  <div className="ex-pills">
                    {l.exercises.map((e, ei) => {
                      const p = progress.ex(e.id);
                      const ok = p.passes >= e.requiredPasses;
                      return (
                        <button key={e.id} className={`ex-pill ${ok ? 'ok' : ''}`} disabled={!open} onClick={() => openLesson(l, ei)} title={`Practice: ${e.title}`}>
                          <span className="dotc"><Icon name={ok ? 'check' : e.backing ? 'wave' : e.events.some((x) => x.pitches.length > 1) ? 'chord' : e.mode === 'timed' ? 'metro' : 'note'} size={12} /></span>
                          <span className="t">{e.backing ? e.title.replace("Play along: ", "♪ ") : e.title}</span>
                          <span className="x">{p.passes}/{e.requiredPasses}</span>
                        </button>
                      );
                    })}
                  </div>
                  <LessonCard l={l} onOpen={() => openLesson(l)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

function PracticeLog() {
  const days = Array.from({ length: 14 }, (_, i) => Date.now() - (13 - i) * 86400000);
  const mins = days.map((t) => Math.round((progress.data.practiceLog[dayKey(t)] ?? 0) / 60));
  const active = mins.filter((m) => m > 0).length;
  const total = mins.reduce((a, b) => a + b, 0);
  return (
    <div className="days-strip" role="list" aria-label="Practice days, last 14 days">
      <div className="days-head"><span className="ic"><Icon name="clock" size={18} /></span><div><b>Last 14 days</b><small>{active} of 14 days · {Math.floor(total / 60)}h {total % 60}m</small></div></div>
      <div className="days">
        {days.map((t, i) => {
          const d = new Date(t);
          return (
            <div key={i} role="listitem" className={`day ${mins[i] ? 'done' : ''} ${i === 13 ? 'today' : ''}`} title={`${d.toDateString()}: ${mins[i]} min`}>
              <i><Icon name={mins[i] ? 'check' : 'note'} size={13} /></i>
              <small>{d.toLocaleDateString('en-US', { weekday: 'short' })[0]}{d.getDate()}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Dashboard({ openLesson }: { openLesson: (l: Lesson, ex?: number) => void }) {
  useProgressVersion();
  const [filter, setFilter] = useState<'all' | 0 | 1 | 'done'>('all');
  const comps = progress.competencies(LESSONS);
  const completed = PIANO_LESSONS.filter((l) => progress.lessonComplete(l));
  const next = PIANO_LESSONS.find((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  const due = progress.dueReviews();
  const today = progress.data.practiceLog[dayKey(Date.now())] ?? 0;
  const weakest = Object.entries(comps).sort((a, b) => a[1]! - b[1]!)[0];
  const level = next?.level ?? 1;
  const shown = PIANO_LESSONS.filter((l) => filter === 'all' || (filter === 'done' ? progress.lessonComplete(l) : l.level === filter));
  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card">
          <span className="avatar you">You</span>
          <div><small>Level {level} · {LEVEL_NAME[level]}</small><b>My practice</b></div>
        </div>
        <div className="metrics">
          <Metric label="Current focus" value={next ? next.title : 'All Phase 1 mastered'} big />
          <Metric label="Pitch" value={comps.pitchAccuracy ?? '-'} unit={comps.pitchAccuracy !== undefined ? '%' : ''} />
          <Metric label="Rhythm" value={comps.rhythm ?? '-'} unit={comps.rhythm !== undefined ? '%' : ''} />
          <Metric label="Streak" value={progress.streak()} unit="days" />
          <Metric label="Today" value={Math.round(today / 60)} unit="min" />
        </div>
      </section>
      <div className="chip-row">
        {(['all', 0, 1, 'done'] as const).map((f) => (
          <button key={String(f)} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All lessons' : f === 'done' ? `Mastered (${completed.length})` : `Level ${f}`}
          </button>
        ))}
        {due.length > 0 && <button className="chip" onClick={() => { const l = LESSONS.find((x) => x.exercises.some((e) => e.id === due[0]))!; openLesson(l, l.exercises.findIndex((e) => e.id === due[0])); }}><Icon name="restart" size={13} /> Review due ({due.length})</button>}
        {next && <button className="chip dark" onClick={() => openLesson(next)}><Icon name="play" size={12} /> Continue</button>}
      </div>
      <PathTimeline lessons={shown} openLesson={openLesson} />
      <section className="grid2">
        <div className="card">
          <div className="card-head"><b>Skill profile</b></div>
          {(Object.keys(SKILL_LABEL) as SkillId[]).map((k) => (
            <div className="bar" key={k}><span>{SKILL_LABEL[k]}</span><div className="track"><div className={`fill ${(comps[k] ?? 0) >= 80 ? 'ok' : ''}`} style={{ width: `${comps[k] ?? 0}%` }} /></div><b>{comps[k] !== undefined ? comps[k] : '-'}</b></div>
          ))}
          <p className="muted small">Separate measures, never one overall number. Latest 5 attempts per exercise.</p>
        </div>
        <div className="card">
          <div className="card-head"><b>Today's 20 minutes</b></div>
          <ol className="plan">
            <li><span>3 min</span>Posture, loose hands, find every C</li>
            <li><span>5 min</span>{weakest && weakest[1]! < 80 ? SKILL_LABEL[weakest[0] as SkillId] : 'C position up and down'}</li>
            <li><span>9 min</span>{next ? next.title : 'Free play in Piano Studio'}</li>
            <li><span>3 min</span>{due.length ? `${due.length} review${due.length > 1 ? 's' : ''} due` : 'One clean run of something you know'}</li>
          </ol>
          {due.length > 0 && <div className="review-list">{due.slice(0, 4).map((id) => { const l = LESSONS.find((x) => x.exercises.some((e) => e.id === id))!; return <button key={id} className="chip" onClick={() => openLesson(l)}>{l.exercises.find((e) => e.id === id)!.title}</button>; })}</div>}
        </div>
      </section>
      <PracticeLog />
    </div>
  );
}

export function LearnList({ openLesson, openSong }: { openLesson: (l: Lesson, ex?: number) => void; openSong?: (id: string) => void }) {
  useProgressVersion();
  const levels = [...new Set(PIANO_LESSONS.map((l) => l.level))];
  const done = LESSONS.filter((l) => progress.lessonComplete(l)).length;
  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card"><span className="avatar"><Icon name="path" size={22} /></span><div><small>Piano and Voice Academy</small><b>All lessons</b></div></div>
        <div className="metrics">
          <Metric label="Rule" value="80% to unlock the next lesson" big />
          <Metric label="Lessons" value={LESSONS.length} />
          <Metric label="Mastered" value={done} />
          <Metric label="Exercises" value={LESSONS.reduce((a, l) => a + l.exercises.length, 0)} />
        </div>
      </section>
      {levels.map((lv) => (
        <section key={lv} className="level">
          <div className="level-head"><span className="node open"><Icon name="piano" size={14} /></span><b>Piano · Level {lv}</b><span className="muted">{LEVEL_NAME[lv]}</span><span className="grp-tag">{LEVEL_GROUP[lv]}</span></div>
          <div className="lesson-grid">
            {PIANO_LESSONS.filter((l) => l.level === lv).map((l) => <LessonCard key={l.id} l={l} onOpen={() => openLesson(l)} />)}
          </div>
        </section>
      ))}
      {openSong && <section className="level"><div className="level-head"><span className="node open"><Icon name="note" size={14} /></span><b>Songs</b><span className="muted">Right hand, left hand or both, with violin, cello, flute and strings playing along</span></div><SongShelf onOpen={openSong} /></section>}
      <section className="level">
        <div className="level-head"><span className="node open"><Icon name="mic" size={14} /></span><b>Voice · Sight-singing</b><span className="muted">Sing with the microphone. Any octave counts.</span></div>
        <div className="lesson-grid">{VOICE_LESSONS.map((l) => <LessonCard key={l.id} l={l} onOpen={() => openLesson(l)} />)}</div>
      </section>
    </div>
  );
}

export function PianoStudio() {
  const settings = useSettings();
  const [marks, setMarks] = useState(new Map<number, KeyMark>());
  const [last, setLast] = useState<string>('-');
  const [bpm, setBpm] = useState(80);
  const [beats, setBeats] = useState(4);
  const [sub, setSub] = useState(1);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(-1);
  const [size, setSize] = useState<'88' | '61' | '25'>('61');
  const chordBuf = useRef<{ t: number; notes: number[] }>({ t: 0, notes: [] });
  useEffect(() => onLearnerNote((n) => {
    setMarks((m) => { const x = new Map(m); if (n.on) x.set(n.midi, 'played'); else x.delete(n.midi); return x; });
    if (n.on) {
      const b = chordBuf.current;
      if (n.at - b.t > 120) { b.notes = []; b.t = n.at; }
      b.notes = [...new Set([...b.notes, n.midi])].sort((a, c) => a - c);
      setLast(b.notes.map(midiToName).join(' + '));
    }
    if (n.source === 'mic') setTimeout(() => setMarks((m) => { const x = new Map(m); x.delete(n.midi); return x; }), 450);
  }), []);
  useEffect(() => { metronome.onBeat = (b) => setFlash(b); return () => { metronome.stop(); metronome.onBeat = null; }; }, []);
  const toggle = () => {
    if (running) { metronome.stop(); setRunning(false); setFlash(-1); return; }
    metronome.subdivision = sub;
    metronome.start(bpm, beats);
    setRunning(true);
  };
  const setB = (v: number) => { const c = Math.max(20, Math.min(300, v)); setBpm(c); metronome.setBpm(c); };
  const [lo, hi] = size === '88' ? [21, 108] : size === '61' ? [36, 96] : [48, 72];
  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card"><span className="avatar"><Icon name="piano" size={22} /></span><div><small>Free play · not scored</small><b>Piano Studio</b></div></div>
        <div className="metrics">
          <Metric label="You played" value={last} big />
          <Metric label="Tempo" value={bpm} unit="bpm" />
          <Metric label="Meter" value={`${beats}/4`} />
          <Metric label="Keys" value={size} />
        </div>
      </section>
      <div className="chip-row">
        {(['25', '61', '88'] as const).map((k) => <button key={k} className={`chip ${size === k ? 'on' : ''}`} onClick={() => setSize(k)}>{k} keys</button>)}
        <span className="chip-sep" />
        {(['letters', 'solfege', 'none'] as const).map((k) => <button key={k} className={`chip ${settings.labels === k ? 'on' : ''}`} onClick={() => setSettings({ labels: k })}>{k === 'none' ? 'No labels' : k === 'solfege' ? 'Solfège' : 'Letters'}</button>)}
        <button className={`chip ${settings.keyHints ? 'on' : ''}`} onClick={() => setSettings({ keyHints: !settings.keyHints })}>Computer keys</button>
      </div>
      <section className="card keys-card tall">
        <Piano lo={lo} hi={hi} marks={marks} labels={settings.labels} showKeyHints={settings.keyHints} height={size === '88' ? 190 : 230} scrollTo={60} minKeyWidth={size === '88' ? 26 : 34} />
        <p className="muted small">Computer keyboard: A S D F G H J K L are white keys, W E T Y U O P black keys, Z and X shift the octave. Chords played on MIDI or an acoustic piano show above.</p>
      </section>
      <div className="dock">
        <button className={`dock-btn lime ${running ? 'live' : ''}`} onClick={toggle} aria-label="Metronome start or stop"><Icon name={running ? 'pause' : 'metro'} size={18} /></button>
        <span className="dock-label">Metronome</span>
        <span className="dock-sep" />
        <button className="dock-btn" onClick={() => setB(bpm - 5)} aria-label="Slower">−</button>
        <input className="dock-num" type="number" min={20} max={300} value={bpm} onChange={(e) => setB(+e.target.value)} aria-label="BPM" />
        <button className="dock-btn" onClick={() => setB(bpm + 5)} aria-label="Faster">+</button>
        <input className="dock-range" type="range" min={20} max={240} value={bpm} onChange={(e) => setB(+e.target.value)} aria-label="BPM slider" />
        <span className="dock-sep" />
        <div className="dock-group">{[2, 3, 4, 6].map((b) => <button key={b} className={`dock-chip ${beats === b ? 'on' : ''}`} onClick={() => { setBeats(b); metronome.beatsPerBar = b; }}>{b}/4</button>)}</div>
        <span className="dock-sep" />
        <div className="dock-group">{[[1, '♩'], [2, '♫'], [3, '3'], [4, '♬']].map(([v, l]) => <button key={v} className={`dock-chip ${sub === v ? 'on' : ''}`} onClick={() => { setSub(v as number); metronome.subdivision = v as number; }}>{l}</button>)}</div>
        <span className="dock-fill" />
        <div className="beats" aria-hidden>{Array.from({ length: beats }, (_, i) => <span key={i} className={flash === i ? (i === 0 ? 'on accent' : 'on') : ''} />)}</div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const st = useSettings();
  const [midiState, setMidiState] = useState<string>(midiIn.devices.length ? midiIn.devices.join(', ') : '');
  const [micOn, setMicOn] = useState(mic.active);
  const [frame, setFrame] = useState<MicFrame | null>(null);
  const [chord, setChord] = useState<string>('');
  const [msg, setMsg] = useState(() => { const m = mic.lastError; mic.lastError = ''; return m; });
  const [confirmReset, setConfirmReset] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    mic.onFrame = (f) => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => setFrame(f)); };
    const off = onLearnerNote((n) => { if (n.source === 'mic' && n.on) setChord((c) => { const now = `${Math.round(n.at / 120)}`; const [k, txt] = c.split('|'); return k === now ? `${k}|${txt} + ${midiToName(n.midi)}` : `${now}|${midiToName(n.midi)}`; }); });
    midiIn.onDevices = (d) => setMidiState(d.length ? d.join(', ') : 'No MIDI devices found. Plug one in and it will appear here.');
    return () => { mic.onFrame = null; off(); };
  }, []);
  const connectMidi = async () => {
    try { const d = await midiIn.connect(); setMidiState(d.length ? d.join(', ') : 'Access granted, but no devices found. Plug one in.'); }
    catch (e) { setMidiState((e as Error).message); }
  };
  const toggleMic = async () => {
    if (mic.active) { mic.stop(); setMicOn(false); setFrame(null); return; }
    try { await mic.start(); setMicOn(true); setMsg(''); }
    catch (e) { setMsg(micHelp(e)); }
  };
  const calibrate = async () => {
    setMsg('Stay quiet for 2 seconds while I measure the room...');
    try { const g = await mic.calibrateNoise(); setMicOn(true); setSettings({ noiseGate: g }); setMsg(`Noise gate set to ${g.toFixed(3)}. Now play a note or a chord: it appears below.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  const testLatency = () => {
    setMsg('Tap any key exactly with each of the 4 clicks...');
    const ctxStart = performance.now() + 600;
    const offs: number[] = [];
    for (let i = 0; i < 4; i++) audio.click(i === 0, false, 600 + i * 750);
    const off = onLearnerNote((n) => {
      if (!n.on) return;
      const rel = n.at - ctxStart; const k = Math.round(rel / 750);
      if (k >= 0 && k < 4) offs.push(rel - k * 750);
      if (offs.length >= 4) {
        off();
        const avg = Math.round(offs.reduce((a, b) => a + b, 0) / offs.length);
        const latencyMs = Math.max(0, Math.min(300, st.latencyMs + avg));
        setSettings({ latencyMs });
        setMsg(`Average offset ${avg} ms. Latency compensation set to ${latencyMs} ms.`);
      }
    });
    setTimeout(() => off(), 5000);
  };
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices?.().then((d) => setDevices(d.filter((x) => x.kind === 'audioinput'))).catch(() => {}); }, [micOn]);
  const restartMic = async (fn: () => Promise<void> | void) => {
    const was = mic.active;
    if (was) mic.stop();
    await fn();
    if (was) { try { await mic.start(); setMicOn(true); } catch { setMicOn(false); } }
  };
  const changeLatency = (m: 'smooth' | 'low') => restartMic(async () => { setSettings({ latencyMode: m }); await audio.setLatencyMode(m); });
  const inTune = frame && frame.confidence >= st.micSensitivity && frame.rms > st.noiseGate;
  const exportJson = JSON.stringify(progress.data);
  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card"><span className="avatar"><Icon name="settings" size={22} /></span><div><small>Input, sound and aids</small><b>Setup</b></div></div>
        <div className="metrics">
          <Metric label="Input" value={midiIn.devices.length ? 'MIDI keyboard' : micOn ? `Microphone (${{ piano: 'piano', epiano: 'digital piano', organ: 'organ', synth: 'keyboard', mono: 'one-note instrument', voice: 'voice' }[st.micInstrument]})` : 'Touch and keys'} big />
          <Metric label="A4" value={st.a4} unit="Hz" />
          <Metric label="Latency" value={st.latencyMs} unit="ms" />
          <Metric label="Strictness" value={Math.round(st.micSensitivity * 100)} unit="%" />
        </div>
      </section>
      <AccountCard />
      <div className="grid2">
        <section className="card">
          <div className="card-head"><b>MIDI keyboard</b></div>
          <p className="small muted">Most precise. Exact keys, timing, chords, velocity and pedal.</p>
          <button className="btn dark" onClick={connectMidi} disabled={!midiIn.supported}>Connect MIDI</button>
          <p className="small">{midiIn.supported ? (midiState || 'Not connected yet.') : 'This browser has no Web MIDI. Use Chrome or Edge on a computer, or the microphone.'}</p>
          <div className="card-head" style={{ marginTop: 18 }}><b>Microphone</b></div>
          <label className="field">What are you playing into the microphone?
            <select value={st.micInstrument} onChange={(e) => { const v = e.target.value as typeof st.micInstrument; setSettings({ micInstrument: v, micMode: v === 'mono' || v === 'voice' ? 'voice' : 'piano' }); }}>
              <option value="piano">Acoustic piano (chords)</option>
              <option value="epiano">Digital / electric piano, stage piano (chords)</option>
              <option value="organ">Organ, harmonium, church organ (chords)</option>
              <option value="synth">Keyboard / synthesizer (chords)</option>
              <option value="mono">One-note instrument: violin, flute, sax, trumpet, guitar melody</option>
              <option value="voice">Voice (singing)</option>
            </select>
            <small className="muted">Each sound has its own detector settings. Keyboards with a USB or MIDI socket are even more precise: connect them with "Connect MIDI".</small>
          </label>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn dark" onClick={toggleMic}>{micOn ? 'Stop microphone' : 'Start microphone'}</button>
            <button className="btn" onClick={calibrate}>Measure background noise</button>
            <button className="btn" onClick={testLatency}>Latency test</button>
          </div>
          {msg && <p className="small tip">{msg}</p>}
          {micOn && (
            <div className="tuner">
              <div className="meter"><div style={{ width: `${Math.min(100, (frame?.rms ?? 0) * 600)}%` }} className={(frame?.rms ?? 0) > st.noiseGate ? 'loud' : ''} /><i style={{ left: `${Math.min(100, st.noiseGate * 600)}%` }} /></div>
              {st.micMode === 'piano'
                ? <div className="note-read"><b>{chord ? chord.split('|')[1] : '·'}</b><small>Notes heard at the last attempt (single notes and chords).{frame?.suppressed ? ' Paused while the app plays.' : ''}</small></div>
                : <>
                    <div className="note-read">
                      <b>{inTune && frame!.midi > 0 ? midiToName(frame!.midi) : '·'}</b>
                      <span>{inTune ? `${frame!.cents > 0 ? '+' : ''}${frame!.cents} cents ${Math.abs(frame!.cents) <= 10 ? '(in tune)' : frame!.cents > 0 ? '(sharp)' : '(flat)'}` : frame && frame.rms > st.noiseGate ? 'unclear: not scored' : 'listening...'}</span>
                      <small>{frame ? `${frame.freq.toFixed(1)} Hz · confidence ${(frame.confidence * 100).toFixed(0)}%` : ''}</small>
                    </div>
                    <div className="cents"><div style={{ left: `${50 + (inTune ? frame!.cents : 0)}%` }} /></div>
                  </>}
            </div>
          )}
          {devices.length > 1 && (
            <label className="field">Microphone to use
              <select value={st.micDeviceId} onChange={(e) => restartMic(() => setSettings({ micDeviceId: e.target.value }))}>
                <option value="">System default</option>
                {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </select>
              <small className="muted">Using Bluetooth earphones? Pick the computer's or phone's built-in microphone here. Earphones that also act as the microphone often switch to a low-quality, crackly "headset" sound.</small>
            </label>
          )}
          <label className="field">Strictness {Math.round(st.micSensitivity * 100)}%<input type="range" min={0.7} max={0.97} step={0.01} value={st.micSensitivity} onChange={(e) => setSettings({ micSensitivity: +e.target.value })} /></label>
          <label className="field">Latency compensation {st.latencyMs} ms<input type="range" min={0} max={300} step={5} value={st.latencyMs} onChange={(e) => setSettings({ latencyMs: +e.target.value })} /></label>
          <p className="small muted">Piano mode hears chords and several notes at once. It knows which notes the lesson expects, so it listens for those first, but they still have to be in the sound. Unclear sounds are never counted as mistakes. Headphones stop the app's own sound reaching the mic.</p>
        </section>
        <section className="card">
          <div className="card-head"><b>Sound</b></div>
          <label className="field">Piano volume<input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => setSettings({ volume: +e.target.value })} /></label>
          <div className="field">Playback quality
            <div className="seg">
              <button className={st.latencyMode === 'smooth' ? 'on' : ''} onClick={() => changeLatency('smooth')}>Smooth (recommended)</button>
              <button className={st.latencyMode === 'low' ? 'on' : ''} onClick={() => changeLatency('low')}>Lowest delay</button>
            </div>
            <small className="muted">Smooth uses a slightly larger audio buffer so playback never crackles on phones or busy computers. Lowest delay suits a fast computer with a MIDI keyboard.</small>
          </div>
          <div className="field">You listen through
            <div className="seg">
              <button className={st.outputMode === 'headphones' ? 'on' : ''} onClick={() => setSettings({ outputMode: 'headphones' })}>Headphones</button>
              <button className={st.outputMode === 'speakers' ? 'on' : ''} onClick={() => setSettings({ outputMode: 'speakers' })}>Speakers</button>
            </div>
            <small className="muted">With speakers, the microphone ignores the notes the app itself plays (play-along in My Music) and the play-along is a little quieter.</small>
          </div>
          <label className="field">Reference pitch A4 = {st.a4} Hz<input type="range" min={415} max={466} step={1} value={st.a4} onChange={(e) => setSettings({ a4: +e.target.value })} /></label>
          <div className="card-head" style={{ marginTop: 18 }}><b>Learning aids</b></div>
          <label className="field">Key labels<select value={st.labels} onChange={(e) => setSettings({ labels: e.target.value as 'letters' })}><option value="letters">Letters (C D E)</option><option value="solfege">Solfège (Do Re Mi)</option><option value="none">None</option></select></label>
          <label className="check"><input type="checkbox" checked={st.hands} onChange={(e) => setSettings({ hands: e.target.checked })} /> Show guide hands on the keyboard</label>
          <label className="check"><input type="checkbox" checked={st.autoFocus} onChange={(e) => setSettings({ autoFocus: e.target.checked })} /> Full-screen practice when I press Start (Esc returns)</label>
          <label className="check"><input type="checkbox" checked={st.keyHints} onChange={(e) => setSettings({ keyHints: e.target.checked })} /> Show computer-keyboard letters on keys</label>
          <label className="field">Mistake policy<select value={st.mistakePolicy} onChange={(e) => setSettings({ mistakePolicy: e.target.value as 'restart' })}><option value="restart">Challenge: 3 in a row restarts (earns mastery)</option><option value="pause">Supported: never restart (practice only)</option></select></label>
          <label className="check"><input type="checkbox" checked={st.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High-contrast mode</label>
          <div className="card-head" style={{ marginTop: 18 }}><b>Data</b></div>
          <p className="small muted">Progress is stored on this device and works offline.</p>
          <div className="row wrap">
            <button className="btn" onClick={() => { try { void navigator.clipboard.writeText(exportJson); setMsg('Progress copied to the clipboard.'); } catch { /* ignore */ } }}>Copy progress</button>
            <button className="btn" onClick={() => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJson], { type: 'application/json' })); a.download = 'maestro-progress.json'; a.click(); } catch { /* sandboxed */ } }}>Download</button>
            {confirmReset
              ? <><button className="btn danger" onClick={() => { progress.reset(); bumpProgress(); setConfirmReset(false); }}>Yes, erase</button><button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button></>
              : <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset progress</button>}
          </div>
        </section>
      </div>
    </div>
  );
}
