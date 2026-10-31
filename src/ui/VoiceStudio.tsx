// Voice Studio: pitch matching, range finder, vocal lessons, and a shortcut to sing a choir part.
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { freqToMidiFloat, midiToName } from '../core/music';
import type { Lesson } from '../core/types';
import { VOICE_LESSONS } from '../curriculum/lessons';
import { mic, type MicFrame, micHelp } from '../input/mic';
import { Icon } from './Icon';
import { Metric } from './LessonView';
import { PitchRoll } from './PitchRoll';
import { progress, setSettings, useProgressVersion, useSettings } from './settings';

export function voiceType(lo: number, hi: number): { name: string; part: 'S' | 'A' | 'T' | 'B' } {
  const mid = (lo + hi) / 2;
  if (mid >= 67) return { name: 'Soprano range', part: 'S' };
  if (mid >= 62) return { name: 'Alto / mezzo range', part: 'A' };
  if (mid >= 55) return { name: 'Tenor / baritone range', part: 'T' };
  return { name: 'Bass range', part: 'B' };
}

export function VoiceStudio({ openLesson, singChoir }: { openLesson: (l: Lesson) => void; singChoir: (part: 'S' | 'A' | 'T' | 'B') => void }) {
  useProgressVersion();
  const st = useSettings();
  const [on, setOn] = useState(mic.active);
  const [err, setErr] = useState('');
  const [frame, setFrame] = useState<MicFrame | null>(null);
  const lo = st.voiceLow, hi = st.voiceHigh;
  const [target, setTarget] = useState(() => 60);
  const [held, setHeld] = useState(0); // ms in tune
  const [score, setScore] = useState({ hits: 0, tries: 0 });
  const [rec, setRec] = useState<null | 'low' | 'high'>(null);
  const recBuf = useRef<number[]>([]);
  const inTuneSince = useRef<number | null>(null);
  const matched = useRef(false);

  useEffect(() => {
    const prev = mic.settings.mode;
    mic.settings.mode = 'voice';
    const l = (f: MicFrame) => setFrame(f);
    mic.frameListeners.add(l);
    return () => { mic.frameListeners.delete(l); mic.settings.mode = prev === 'voice' ? st.micMode : prev; };
  }, []); // eslint-disable-line

  const start = async () => {
    try { await mic.start(); mic.settings.mode = 'voice'; setOn(true); setErr(''); }
    catch (e) { setErr(micHelp(e)); }
  };

  const clear = !!frame && frame.freq > 0 && frame.confidence >= 0.8 && frame.rms > mic.settings.noiseGate;
  const sungFloat = clear ? freqToMidiFloat(frame!.freq, audio.a4) : null;
  const folded = sungFloat === null ? null : sungFloat + 12 * Math.round((target - sungFloat) / 12);
  const cents = folded === null ? null : Math.round((folded - target) * 100);

  // pitch matching: hold within 25 cents for 0.6 s
  useEffect(() => {
    if (!on || rec) return;
    const now = performance.now();
    if (cents !== null && Math.abs(cents) <= 25) {
      inTuneSince.current ??= now;
      const h = now - inTuneSince.current;
      setHeld(h);
      if (h >= 600 && !matched.current) {
        matched.current = true;
        setScore((s) => ({ hits: s.hits + 1, tries: s.tries + 1 }));
        setTimeout(() => nextTarget(), 900);
      }
    } else { inTuneSince.current = null; setHeld(0); }
    // range recording
  }, [frame]); // eslint-disable-line

  useEffect(() => { if (rec && sungFloat !== null) recBuf.current.push(Math.round(sungFloat)); }, [frame]); // eslint-disable-line

  const nextTarget = () => {
    matched.current = false;
    const choices: number[] = [];
    for (let m = lo; m <= hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) choices.push(m);
    let t = target;
    while (t === target && choices.length > 1) t = choices[Math.floor(Math.random() * choices.length)];
    setTarget(t);
    inTuneSince.current = null;
    setHeld(0);
    audio.playNotes([{ midi: t, startMs: 0, durMs: 1100 }]);
  };

  const record = (which: 'low' | 'high') => {
    recBuf.current = [];
    setRec(which);
    setTimeout(() => {
      const v = recBuf.current.sort((a, b) => a - b);
      setRec(null);
      if (v.length < 5) { setErr('I could not hear a steady note. Try again, a little louder.'); return; }
      const pick = which === 'low' ? v[Math.floor(v.length * 0.2)] : v[Math.floor(v.length * 0.8)];
      if (which === 'low') setSettings({ voiceLow: Math.min(pick, st.voiceHigh - 5) });
      else setSettings({ voiceHigh: Math.max(pick, st.voiceLow + 5) });
    }, 3000);
  };

  const vt = voiceType(lo, hi);
  const nextLesson = VOICE_LESSONS.find((l) => !progress.lessonComplete(l));
  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card"><span className="avatar"><Icon name="mic" size={22} /></span><div><small>Singing and sight-singing</small><b>Voice Studio</b></div></div>
        <div className="metrics">
          <Metric label="You are singing" value={clear ? `${midiToName(Math.round(sungFloat!))}` : on ? 'listening…' : 'microphone off'} big />
          <Metric label="Comfortable range" value={`${midiToName(lo)}–${midiToName(hi)}`} />
          <Metric label="Suggested choir part" value={vt.part === 'S' ? 'Soprano' : vt.part === 'A' ? 'Alto' : vt.part === 'T' ? 'Tenor' : 'Bass'} />
          <Metric label="Matched" value={score.hits} />
        </div>
      </section>
      {!on && <div className="card call"><div><b>Turn on the microphone to sing.</b><p className="muted small">Your voice is analyzed on this device only. Headphones help when the app plays notes.</p>{err && <p className="small tip">{err}</p>}</div><button className="btn dark" onClick={start}><Icon name="mic" size={15} /> Start microphone</button></div>}
      <section className="voice-grid">
        <div className="card">
          <div className="card-head"><b>Pitch matching</b><span className="muted small">Hold the note in tune for a moment. Any octave counts.</span></div>
          <div className="match">
            <div className="match-target"><small>Sing</small><b>{midiToName(target)}</b><span>{['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'][target % 12]}</span></div>
            <div className="tunebar">
              <div className="tunebar-zone" />
              <div className={`tunebar-needle ${cents !== null && Math.abs(cents) <= 25 ? 'ok' : cents !== null && Math.abs(cents) <= 60 ? 'near' : ''}`} style={{ left: `${50 + Math.max(-50, Math.min(50, (cents ?? 0) / 2))}%`, opacity: cents === null ? 0.25 : 1 }} />
              <span className="tb-l">flat</span><span className="tb-r">sharp</span>
            </div>
            <p className="match-msg">{matched.current ? 'Matched! Next note coming…' : cents === null ? (on ? 'Sing on "ah" or "loo".' : 'Start the microphone first.') : Math.abs(cents) <= 25 ? `In tune, hold it… ${Math.min(100, Math.round(held / 6))}%` : cents < 0 ? `${-cents} cents flat: a little higher` : `${cents} cents sharp: relax a little lower`}</p>
            <div className="row wrap">
              <button className="btn dark" onClick={() => audio.playNotes([{ midi: target, startMs: 0, durMs: 1100 }])}><Icon name="play" size={14} /> Hear the note</button>
              <button className="btn" onClick={() => { setScore((s) => ({ ...s, tries: s.tries + 1 })); nextTarget(); }}>New note</button>
            </div>
          </div>
          <PitchRoll targets={() => []} hold={() => target} height={150} tolerance={25} />
        </div>
        <div className="side-stack">
          <div className="card">
            <div className="card-head"><b>Find your range</b><span className="muted small">{vt.name}</span></div>
            <p className="small muted">Sing your lowest comfortable note for 3 seconds, then your highest. Never push: comfortable is what counts.</p>
            <div className="row wrap">
              <button className="btn" disabled={!on || !!rec} onClick={() => record('low')}>{rec === 'low' ? 'Listening… sing low' : 'Record lowest'}</button>
              <button className="btn" disabled={!on || !!rec} onClick={() => record('high')}>{rec === 'high' ? 'Listening… sing high' : 'Record highest'}</button>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><b>Sing in a choir</b></div>
            <p className="small muted">Open the four-part demo chorale. You sing your part while the other three voices play, and every note is checked.</p>
            <div className="row wrap">{(['S', 'A', 'T', 'B'] as const).map((p) => <button key={p} className={`btn ${vt.part === p ? 'dark' : ''}`} onClick={() => singChoir(p)}>{{ S: 'Soprano', A: 'Alto', T: 'Tenor', B: 'Bass' }[p]}</button>)}</div>
          </div>
          <div className="card">
            <div className="card-head"><b>Vocal lessons</b>{nextLesson && <button className="chip dark" onClick={() => openLesson(nextLesson)}><Icon name="play" size={12} /> Continue</button>}</div>
            <div className="vlist">
              {VOICE_LESSONS.map((l) => {
                const unlocked = progress.lessonUnlocked(l, VOICE_LESSONS);
                const done = progress.lessonComplete(l);
                return <button key={l.id} className={`vrow ${done ? 'done' : ''}`} disabled={!unlocked} onClick={() => openLesson(l)}><span className="dotc"><Icon name={done ? 'check' : unlocked ? 'play' : 'lock'} size={12} /></span><span>{l.title}</span></button>;
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
