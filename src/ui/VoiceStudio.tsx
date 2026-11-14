// Voice Studio: pitch matching, range finder, vocal lessons, and a shortcut to sing a choir part.
import { PageHead } from './PageHead';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { freqToMidiFloat, midiToName } from '../core/music';
import type { Lesson } from '../core/types';
import { VOICE_LESSONS } from '../curriculum/lessons';
import { mic, type MicFrame, micHelp } from '../input/mic';
import { Icon } from './Icon';

import { PitchRoll } from './PitchRoll';
import { SingToScore } from './SingToScore';
import { progress, setSettings, useProgressVersion, useSettings } from './settings';
import { allowVoiceLevel, voiceLevelTier, TIER_NAME } from '../account/gate';
import { getAccount, openUpgrade } from '../account/store';
import { VOICE_LEVELS, voiceLevelInfo } from '../assessment/voiceLevels';

export function voiceType(lo: number, hi: number): { name: string; part: 'S' | 'A' | 'T' | 'B' } {
  const mid = (lo + hi) / 2;
  if (mid >= 67) return { name: 'Soprano range', part: 'S' };
  if (mid >= 62) return { name: 'Alto / mezzo range', part: 'A' };
  if (mid >= 55) return { name: 'Tenor / baritone range', part: 'T' };
  return { name: 'Bass range', part: 'B' };
}

export function VoiceStudio({ openLesson, singChoir, openScore }: { openLesson: (l: Lesson) => void; singChoir: (part: 'S' | 'A' | 'T' | 'B') => void; openScore: (xml: string) => void }) {
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
  const [s2sRec, setS2sRec] = useState(false); // Sing to score is recording: the pitch game waits
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

  // pitch matching: hold in tune (the singing level decides how close and how long)
  const lvl = voiceLevelInfo(allowVoiceLevel(getAccount().ent, st.voiceLevel) ? st.voiceLevel : 'easy');
  useEffect(() => {
    if (!on || rec || s2sRec) return;
    const now = performance.now();
    if (cents !== null && Math.abs(cents) <= lvl.matchCents) {
      inTuneSince.current ??= now;
      const h = now - inTuneSince.current;
      setHeld(h);
      if (h >= lvl.holdMs && !matched.current) {
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
  const [tab, setTabState] = useState<VTab>(() => { try { const t = sessionStorage.getItem('auxa.voiceTab'); return t === 'learn' || t === 'match' ? t : 'score'; } catch { return 'score'; } });
  const setTab = (t: VTab) => { setTabState(t); try { sessionStorage.setItem('auxa.voiceTab', t); } catch { /* private mode */ } };
  const inTune = cents !== null && Math.abs(cents) <= lvl.matchCents;
  const startMic = async () => { await mic.start(); mic.settings.mode = 'voice'; setOn(true); setErr(''); };
  return (
    <div className="page voice-page">
      <PageHead title="Voice Studio" sub="Turn your singing into notes, learn to sing, and sing in tune." />
      <div className="vs-shell">
        <nav className="vs-side" role="tablist" aria-label="Voice Studio">
          {VTABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><Icon name={t.icon} size={16} /><span>{t.label}</span></button>)}
        </nav>
        <div className="vs-main">
          {err && <p className="tip small vs-err">{err}</p>}

          {tab === 'score' && <SingToScore micOn={on} startMic={startMic} openScore={openScore} onRecording={setS2sRec} />}

          {tab === 'learn' && (
            <section className="vs-panel">
              <div className="vs-toolbar">
                <b className="vs-tool-title">Vocal lessons</b>
                <span className="vs-spacer" />
                {nextLesson && <button className="btn lime" onClick={() => openLesson(nextLesson)}><Icon name="play" size={14} />Continue: {nextLesson.title.split(':')[0]}</button>}
              </div>
              <div className="vs-learn">
                <div className="vlist">
                  {VOICE_LESSONS.map((l) => {
                    const unlocked = progress.lessonUnlocked(l, VOICE_LESSONS);
                    const done = progress.lessonComplete(l);
                    return <button key={l.id} className={`vrow ${done ? 'done' : ''}`} disabled={!unlocked} onClick={() => openLesson(l)}><span className="dotc"><Icon name={done ? 'check' : unlocked ? 'play' : 'lock'} size={12} /></span><span>{l.title}</span></button>;
                  })}
                </div>
                <div className="vs-choir">
                  <b>Sing in a choir</b>
                  <p className="small muted">Sing your part of a four-part chorale while the other three voices play. Every note is checked.</p>
                  <div className="vs-parts">{(['S', 'A', 'T', 'B'] as const).map((pt) => <button key={pt} className={`vs-part ${vt.part === pt ? 'mine' : ''}`} onClick={() => singChoir(pt)}><b>{{ S: 'Soprano', A: 'Alto', T: 'Tenor', B: 'Bass' }[pt]}</b>{vt.part === pt && <small>Your part</small>}</button>)}</div>
                </div>
              </div>
            </section>
          )}

          {tab === 'match' && (
            <section className="vs-panel">
              <div className="vs-toolbar">
                <button className={`vs-mic-btn ${on ? 'on' : ''}`} onClick={() => { if (!on) void start(); }} aria-label={on ? 'Microphone on' : 'Turn on the microphone'} title={on ? 'Microphone on' : 'Turn on the microphone'}><Icon name="mic" size={16} /></button>
                <button className="btn" onClick={() => audio.playNotes([{ midi: target, startMs: 0, durMs: 1100 }])}><Icon name="play" size={14} />Hear the note</button>
                <button className="btn" onClick={() => { setScore((x) => ({ ...x, tries: x.tries + 1 })); nextTarget(); }}>New note</button>
                <span className="vs-spacer" />
                <div className="seg vs-levels">{VOICE_LEVELS.map((v) => <button key={v.id} className={st.voiceLevel === v.id ? 'on' : ''} onClick={() => { if (!allowVoiceLevel(getAccount().ent, v.id)) { openUpgrade(`${v.label} singing is part of ${TIER_NAME[voiceLevelTier(v.id)]}`); return; } setSettings({ voiceLevel: v.id }); }}>{v.label}{!allowVoiceLevel(getAccount().ent, v.id) && <Icon name="lock" size={11} />}</button>)}</div>
              </div>
              <div className="vs-stage">
                <div className={`vs-note ${inTune ? 'ok' : ''}`}><small>Sing</small><b>{midiToName(target)}</b><span>{['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'][target % 12]}</span></div>
                <div className="vs-about">
                  <p className="match-msg">{matched.current ? 'Matched! Next note coming…' : cents === null ? (on ? 'Sing on "ah" or "loo". Any octave counts.' : 'Turn on the microphone, then sing the note.') : inTune ? `In tune, hold it… ${Math.min(100, Math.round((held / lvl.holdMs) * 100))}%` : cents < 0 ? `${-cents} cents flat: a little higher` : `${cents} cents sharp: relax a little lower`}</p>
                  <div className="tunebar">
                    <div className="tunebar-zone" />
                    <div className={`tunebar-needle ${inTune ? 'ok' : cents !== null && Math.abs(cents) <= 60 ? 'near' : ''}`} style={{ left: `${50 + Math.max(-50, Math.min(50, (cents ?? 0) / 2))}%`, opacity: cents === null ? 0.25 : 1 }} />
                    <span className="tb-l">flat</span><span className="tb-r">sharp</span>
                  </div>
                  <div className="vs-voice">
                    <span><b>{score.hits}</b> matched</span>
                    <span>Range <b>{midiToName(lo)}–{midiToName(hi)}</b> · {vt.name}</span>
                    <button className="link-btn" disabled={!on || !!rec} onClick={() => record('low')}>{rec === 'low' ? 'Sing your lowest…' : 'Set lowest'}</button>
                    <button className="link-btn" disabled={!on || !!rec} onClick={() => record('high')}>{rec === 'high' ? 'Sing your highest…' : 'Set highest'}</button>
                  </div>
                </div>
              </div>
              <div className="vs-graph"><PitchRoll targets={() => []} hold={() => target} height={190} tolerance={25} /></div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

type VTab = 'score' | 'learn' | 'match';
const VTABS: { id: VTab; label: string; icon: 'mic' | 'note' | 'doc' }[] = [
  { id: 'score', label: 'Sing to score', icon: 'note' },
  { id: 'learn', label: 'Lessons', icon: 'doc' },
  { id: 'match', label: 'Pitch match', icon: 'mic' },
];
