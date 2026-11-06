import { useEffect, useMemo, useRef, useState } from 'react';
import { AssessmentSession, type Feedback } from '../assessment/session';
import { audio } from '../audio/engine';
import { beatToMs, effectiveBpm, metronomeClicks, msPerBeat } from '../audio/timing';
import { midiToName } from '../core/music';
import type { AssessmentReport, Exercise, Lesson, NoteStatus } from '../core/types';
import { onLearnerNote } from '../input/bus';
import { setExpected } from '../input/expect';
import { mic, micHelp } from '../input/mic';
import { midiIn } from '../input/midi';
import { KeyboardArea } from './KeyboardArea';
import { applyVoiceLevel, VOICE_LEVELS } from '../assessment/voiceLevels';
import { allowVoiceLevel, voiceLevelTier, TIER_NAME } from '../account/gate';
import { getAccount, openUpgrade } from '../account/store';
import { Icon } from './Icon';
import { Piano, type KeyMark } from './Piano';
import { bumpProgress, progress, setSettings, useProgressVersion, useSettings } from './settings';
import { Staff } from './Staff';
import { PitchRoll } from './PitchRoll';
import { useFocusMode } from './focus';
import { DockFab, FocusBar, FloatHead, RotateHint } from './FocusBar';

function rangeFor(pitches: number[]): [number, number] {
  if (!pitches.length) return [48, 84];
  const lo = Math.min(...pitches), hi = Math.max(...pitches);
  return [Math.min(48, Math.floor((lo - 2) / 12) * 12), Math.max(72, Math.ceil((hi + 2) / 12) * 12)];
}

export function Metric({ label, value, unit, big }: { label: string; value: React.ReactNode; unit?: string; big?: boolean }) {
  return <div className={`metric ${big ? 'big' : ''}`}><small>{label}</small><b>{value}{unit && <span className="unit">{unit}</span>}</b></div>;
}

export function LessonView({ lesson, onNextLesson, initialExercise }: { lesson: Lesson; onNextLesson?: () => void; initialExercise?: number }) {
  const [phase, setPhase] = useState<'teach' | 'practice'>(initialExercise !== undefined ? 'practice' : 'teach');
  const [step, setStep] = useState(0);
  const [exIdx, setExIdx] = useState(initialExercise ?? 0);
  const ex = lesson.exercises[exIdx];
  useProgressVersion();

  const chips = (
    <div className="chip-row">
      <button className={`chip ${phase === 'teach' ? 'on' : ''}`} onClick={() => setPhase('teach')}><Icon name="eye" size={14} /> Learn</button>
      <button className={`chip ${phase === 'practice' ? 'on' : ''}`} onClick={() => setPhase('practice')}><Icon name="play" size={14} /> Practice &amp; assess</button>
      <span className="chip-sep" />
      {lesson.exercises.map((e, i) => {
        const p = progress.ex(e.id);
        const done = p.passes >= e.requiredPasses;
        return (
          <button key={e.id} className={`chip ex ${phase === 'practice' && i === exIdx ? 'on' : ''} ${done ? 'done' : ''}`} onClick={() => { setExIdx(i); setPhase('practice'); }}>
            {done ? <Icon name="check" size={13} /> : <span className="num">{i + 1}</span>} {e.title}
            <span className="badge">{p.passes}/{e.requiredPasses}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="page lesson">
      {phase === 'teach'
        ? <TeachPanel lesson={lesson} step={step} setStep={setStep} onDone={() => setPhase('practice')} chips={chips} />
        : <PracticePanel key={ex.id} lesson={lesson} exercise={ex} index={exIdx} chips={chips} onNext={exIdx < lesson.exercises.length - 1 ? () => setExIdx(exIdx + 1) : onNextLesson} />}
    </div>
  );
}

function TeachPanel({ lesson, step, setStep, onDone, chips }: { lesson: Lesson; step: number; setStep: (n: number) => void; onDone: () => void; chips: React.ReactNode }) {
  const s = lesson.teach[step];
  const settings = useSettings();
  const [demo, setDemo] = useState<number | null>(null);
  const show = s.show ?? s.play ?? [];
  const [lo, hi] = rangeFor([...show, ...(s.play ?? [])]);
  const marks = new Map<number, KeyMark>(show.map((m) => [m, 'show']));
  if (demo !== null) marks.set(demo, 'demo');
  useEffect(() => {
    setExpected(null);
    audio.onAppNote = (m, on) => setDemo(on ? m : null);
    return () => { audio.onAppNote = null; audio.stopAll(); };
  }, []);
  const play = () => {
    if (!s.play) return;
    audio.stopAll();
    audio.playNotes(s.play.map((m, i) => ({ midi: m, startMs: s.sequential ? i * 550 : 0, durMs: s.sequential ? 500 : 1500 })));
  };
  const seqShow = s.sequential ? (s.play ?? show) : show;
  const staffEvents = useMemo(() => {
    const notes = s.sequential || show.length > 4 ? seqShow.slice(0, 8) : show;
    return s.sequential || show.length > 4 ? notes.map((m, i) => ({ pitches: [m], beat: i, beats: 1 })) : [{ pitches: notes, beat: 0, beats: 4 }];
  }, [step]); // eslint-disable-line
  const clef = show.length && Math.max(...show) < 60 ? 'bass' : 'treble';
  return (
    <>
      <section className="head-row">
        <div className="id-card">
          <span className="avatar"><Icon name="note" size={22} /></span>
          <div><small>Step {step + 1} of {lesson.teach.length}</small><b>{lesson.title}</b></div>
        </div>
        <div className="metrics">
          <Metric label="Learning" value={s.title} big />
          <Metric label="Level" value={lesson.level} />
          <Metric label="Exercises" value={lesson.exercises.length} />
          <Metric label="Pass mark" value="80" unit="%" />
        </div>
      </section>
      {chips}
      <section className="teach-grid">
        <div className="card teach-card">
          <div className="stage-row"><span>See it</span><span>Hear it</span><span>Understand it</span></div>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </div>
        <div className="card staff-card">
          <div className="card-head"><b>On the staff</b></div>
          {show.length > 0 ? <Staff events={staffEvents} clef={clef} timeSig={[4, 4]} highContrast={settings.highContrast} measureWidth={staffEvents.length > 1 ? 210 : 160} showTime={false} /> : <p className="muted">This step is about your body and the keyboard. No notation yet.</p>}
        </div>
      </section>
      <section className="card keys-card">
        <Piano lo={lo} hi={hi} marks={marks} labels={settings.labels} scrollTo={show[0]} />
      </section>
      <div className="dock">
        <button className="dock-btn lime" onClick={play} disabled={!s.play}><Icon name="play" size={18} /></button>
        <span className="dock-label">Hear it</span>
        <span className="dock-sep" />
        <div className="dock-steps">
          {lesson.teach.map((t, i) => <button key={i} className={`dot-btn ${i === step ? 'on' : i < step ? 'done' : ''}`} onClick={() => setStep(i)} aria-label={`Step ${i + 1}: ${t.title}`}>{i + 1}</button>)}
        </div>
        <span className="dock-fill" />
        {step > 0 && <button className="dock-text" onClick={() => setStep(step - 1)}><Icon name="back" size={16} /> Back</button>}
        {step < lesson.teach.length - 1
          ? <button className="dock-text light" onClick={() => setStep(step + 1)}>Next step</button>
          : <button className="dock-text lime" onClick={onDone}>Start practicing</button>}
      </div>
    </>
  );
}

interface FeedItem { kind: Feedback['kind']; text: string; id: number }

function PracticePanel({ lesson, exercise: base, index, chips, onNext }: { lesson: Lesson; exercise: Exercise; index: number; chips: React.ReactNode; onNext?: () => void }) {
  const settings = useSettings();
  const fm = useFocusMode();
  const [tempoPct, setTempoPct] = useState(100);
  const [metroOn, setMetroOn] = useState(base.mode === 'timed');
  const exercise = useMemo<Exercise>(() => { const e = applyVoiceLevel(base, allowVoiceLevel(getAccount().ent, settings.voiceLevel) ? settings.voiceLevel : 'easy'); return settings.mistakePolicy === 'pause' ? { ...e, maxConsecutiveMistakes: 99 } : e; }, [base, settings.mistakePolicy, settings.voiceLevel]);
  const bpm = effectiveBpm(exercise.tempo, tempoPct);
  const session = useRef<AssessmentSession>(new AssessmentSession(exercise, bpm));
  const t0 = useRef(0);
  const clock = useRef<{ t0: number; mspb: number } | null>(null);
  const playhead = useRef<number | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [held, setHeld] = useState<Map<number, KeyMark>>(new Map());
  const [demoKeys, setDemoKeys] = useState<Set<number>>(new Set());
  const [demoIdx, setDemoIdx] = useState<number | null>(null);
  const [timedIdx, setTimedIdx] = useState(0);
  const [fix, setFix] = useState(false);
  const fixTimer = useRef(0);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [beatFlash, setBeatFlash] = useState(-1);
  const [nice, setNice] = useState<{ id: number; text: string } | null>(null);
  const streak = useRef(0);
  const timers = useRef<number[]>([]);
  const fid = useRef(0);
  const s = session.current;
  const latest = useRef<{ handleFeedback: (fb: Feedback | null) => void; finishIfDone: () => void; start: (fresh?: boolean) => void; playBacking: (a: number, b: number, at?: number) => void }>(null!);

  const pushFeed = (kind: Feedback['kind'], text: string) => {
    if (!text) return;
    setFeed((f) => [{ kind, text, id: fid.current++ }, ...f].slice(0, 5));
  };
  const clearTimers = () => { timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = []; };
  const stopClock = () => { clock.current = null; playhead.current = null; };
  /** Play-along: the app plays the backing notes in [fromBeat, toBeat) starting atMs from now. */
  const playBacking = (fromBeat: number, toBeat: number, atMs = 0) => {
    const bk = exercise.backing;
    if (!bk?.length) return;
    const mspb = msPerBeat(bpm);
    const ctx = audio.ensure();
    const base = ctx.currentTime + 0.03 + atMs / 1000;
    for (const n of bk) {
      if (n.beat < fromBeat - 1e-6 || n.beat >= toBeat - 1e-6) continue;
      const off = (n.beat - fromBeat) * mspb;
      audio.scheduleNote(n.midi, base + off / 1000, (n.beats * mspb * 0.94) / 1000, n.vel ?? (n.line === 'melody' ? 0.56 : 0.36), false);
      if (n.line === 'melody') {
        timers.current.push(window.setTimeout(() => audio.onAppNote?.(n.midi, true), atMs + off + 30));
        timers.current.push(window.setTimeout(() => audio.onAppNote?.(n.midi, false), atMs + off + n.beats * mspb * 0.9));
      }
    }
  };

  // playhead clock (rAF): beats since exercise start
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = clock.current;
      playhead.current = c ? (performance.now() - c.t0) / c.mspb : null;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reported = useRef<AssessmentReport | null>(null);
  const finishIfDone = () => {
    const cur = session.current;
    if (cur.state === 'COMPLETED' && cur.report && reported.current !== cur.report) {
      reported.current = cur.report;
      clearTimers();
      stopClock();
      setExpected(null);
      const r = { ...cur.report };
      if (settings.mistakePolicy === 'pause') { r.passed = false; r.advice = ['Supported mode is for learning. Switch to Challenge mode in Setup to earn mastery.', ...r.advice]; }
      progress.record(r);
      progress.logPractice(Math.round((performance.now() - t0.current) / 1000));
      bumpProgress();
      setReport(r);
    }
  };

  const handleFeedback = (fb: Feedback | null) => {
    if (!fb || fb.kind === 'ignored' || (fb.kind === 'progress' && !fb.message)) return;
    if (fb.kind === 'correct') {
      streak.current++;
      const words = ['Nice!', 'Good!', 'Great!', 'Yes!', 'Perfect!'];
      setNice({ id: Date.now(), text: streak.current >= 5 ? `${streak.current} in a row!` : words[streak.current % words.length] });
    } else if (fb.kind === 'wrong' || fb.kind === 'restart') {
      streak.current = 0;
      if (fb.kind === 'wrong') { setFix(true); if (fixTimer.current) clearTimeout(fixTimer.current); fixTimer.current = window.setTimeout(() => setFix(false), 2600); }
    }
    pushFeed(fb.kind, fb.message);
    if (fb.kind === 'restart') {
      clearTimers();
      stopClock();
      timers.current.push(window.setTimeout(() => {
        session.current.restart();
        rerender();
        if (exercise.mode === 'wait') latest.current.start(false);
      }, 2200));
    }
    finishIfDone();
    rerender();
  };

  useEffect(() => {
    const off = onLearnerNote((n) => {
      const clearLater = (ms: number) => window.setTimeout(() => setHeld((x) => { if (x.get(n.midi) === 'played' || !n.on || n.source === 'mic') { const y = new Map(x); y.delete(n.midi); return y; } return x; }), ms);
      if (n.on) setHeld((h) => new Map(h).set(n.midi, 'played'));
      if (!n.on || n.source === 'mic') clearLater(n.source === 'mic' ? 550 : 450);
      const cur = session.current;
      if (cur.state !== 'LISTENING') return;
      const time = n.at - t0.current;
      if (!n.on) { cur.noteOff(n.midi, time); return; }
      const before = cur.currentIndex();
      const fb = cur.input({ midi: n.midi, time, source: n.source, confidence: n.confidence, velocity: n.velocity });
      const after = cur.currentIndex();
      if (cur.exercise.mode === 'wait' && before >= 0 && after !== before) {
        const evs = cur.exercise.events;
        latest.current.playBacking(evs[before].beat, after >= 0 ? evs[after].beat : Infinity);
      }
      if (fb.kind === 'correct' || fb.kind === 'partial' || fb.kind === 'progress') setHeld((h) => new Map(h).set(n.midi, fb.kind === 'partial' ? 'partial' : 'correct'));
      if (fb.kind === 'wrong' || fb.kind === 'restart') setHeld((h) => new Map(h).set(n.midi, 'wrong'));
      latest.current.handleFeedback(fb);
    });
    audio.onAppNote = (m, on) => setDemoKeys((d) => { const x = new Set(d); if (on) x.add(m); else x.delete(m); return x; });
    if (exercise.voice) mic.settings.mode = 'voice';
    return () => { off(); clearTimers(); audio.onAppNote = null; audio.stopAll(); setExpected(null); mic.settings.mode = settings.micMode; };
  }, []); // eslint-disable-line

  const [micErr, setMicErr] = useState('');
  const start = (fresh = true) => {
    if (exercise.voice && !mic.active) {
      mic.start().then(() => { mic.settings.mode = 'voice'; setMicErr(''); latest.current.start(fresh); }).catch((e) => setMicErr(micHelp(e)));
      return;
    }
    if (exercise.voice) mic.settings.mode = 'voice';
    clearTimers();
    audio.stopAll();
    setReport(null);
    setDemoIdx(null);
    streak.current = 0;
    if (fresh || session.current.state === 'COMPLETED') {
      session.current = new AssessmentSession(exercise, bpm);
      setFeed([]);
    }
    const cur = session.current;
    cur.begin();
    audio.ensure();
    if (exercise.mode === 'wait') {
      t0.current = performance.now();
      stopClock();
      pushFeed('progress', exercise.backing?.length ? `Attempt ${cur.attempt}: the band plays; you play only the glowing notes. Take your time, it waits for you.` : `Attempt ${cur.attempt}: play the glowing note${exercise.events[0]?.pitches.length > 1 ? 's together' : ''}. Take your time.`);
      const first = exercise.events.find((e) => e.pitches.length);
      if (first) playBacking(0, first.beat);
      rerender();
      return;
    }
    const mspb = msPerBeat(bpm);
    const countIn = exercise.timeSig[0];
    const last = exercise.events[exercise.events.length - 1];
    const totalMs = beatToMs(last.beat + last.beats, bpm);
    const lead = 150;
    t0.current = performance.now() + lead + countIn * mspb;
    clock.current = { t0: t0.current, mspb };
    for (let i = 0; i < countIn; i++) {
      audio.click(i === 0, false, lead + i * mspb);
      timers.current.push(window.setTimeout(() => setBeatFlash(i), lead + i * mspb));
    }
    if (metroOn) metronomeClicks(0, totalMs, bpm, exercise.timeSig[0]).forEach((c) => {
      audio.click(c.accent, c.sub, lead + countIn * mspb + c.time);
      timers.current.push(window.setTimeout(() => setBeatFlash(Math.round(c.time / mspb) % exercise.timeSig[0]), lead + countIn * mspb + c.time));
    });
    playBacking(0, Infinity, lead + countIn * mspb);
    pushFeed('progress', `Attempt ${cur.attempt}: ${countIn}-beat count-in, then play with the moving line${exercise.backing?.length ? ' and the band' : ''}.`);
    timers.current.push(window.setTimeout(() => { cur.listen(); rerender(); }, lead + countIn * mspb - Math.min(250, mspb * 0.5)));
    timers.current.push(window.setInterval(() => {
      const nowMs = performance.now() - t0.current;
      // score-informed hint for the microphone: notes due around now
      const due = exercise.events.filter((e) => Math.abs(beatToMs(e.beat, bpm) - nowMs) <= cur.window).flatMap((e) => e.pitches);
      setExpected(due.length ? due : null);
      const beat = nowMs / mspb;
      const idx = Math.max(0, exercise.events.findIndex((e, k) => k === exercise.events.length - 1 || beat < exercise.events[k + 1].beat - 0.25));
      setTimedIdx((p) => (p === idx ? p : idx));
      if (cur.state !== 'LISTENING') return;
      const fb = cur.tick(nowMs);
      if (fb) latest.current.handleFeedback(fb);
      else latest.current.finishIfDone();
    }, 40) as unknown as number);
    rerender();
  };

  const demo = () => {
    clearTimers();
    audio.stopAll();
    if (session.current.state === 'LISTENING' || session.current.state === 'COUNT_IN') session.current = new AssessmentSession(exercise, bpm);
    const mspb = msPerBeat(bpm);
    const end = audio.playNotes(exercise.events.flatMap((e) => e.pitches.map((m) => ({ midi: m, startMs: e.beat * mspb, durMs: e.beats * mspb * 0.92 }))));
    playBacking(0, Infinity, 50);
    const bandEnd = Math.max(0, ...(exercise.backing ?? []).map((n) => (n.beat + n.beats) * mspb));
    const startAt = performance.now() + 50;
    clock.current = { t0: startAt, mspb };
    exercise.events.forEach((e, i) => timers.current.push(window.setTimeout(() => setDemoIdx(i), 50 + e.beat * mspb)));
    timers.current.push(window.setTimeout(() => { setDemoIdx(null); stopClock(); }, Math.max(end, bandEnd) + 400));
    pushFeed('progress', 'Demo: watch the hands, the keys and the moving line. Nothing is scored during the demo.');
    rerender();
  };

  latest.current = { handleFeedback, finishIfDone, start, playBacking };

  const statuses: NoteStatus[] = s.results().map((r) => r.status);
  const cursor = s.currentIndex();
  const curEv = cursor >= 0 ? exercise.events[cursor] : null;
  const listening = s.state === 'LISTENING' || s.state === 'COUNT_IN';
  useEffect(() => { if (exercise.mode === 'wait') setExpected(s.state === 'LISTENING' && curEv ? curEv.pitches : null); });

  const allPitches = exercise.events.flatMap((e) => e.pitches);
  const [lo, hi] = rangeFor(allPitches);
  const marks = new Map<number, KeyMark>();
  const reveal = !exercise.hideLabels || s.consecutive >= 2;
  if (curEv && s.state === 'LISTENING' && reveal) curEv.pitches.forEach((p) => marks.set(p, 'target'));
  if (exercise.mode === 'timed' && s.state === 'LISTENING' && !exercise.hideLabels) exercise.events[timedIdx]?.pitches.forEach((p) => marks.set(p, 'target'));
  held.forEach((v, k) => marks.set(k, v));
  demoKeys.forEach((k) => marks.set(k, 'demo'));
  const labels = exercise.hideLabels ? 'none' : settings.labels;
  const handIdx = demoIdx ?? (exercise.mode === 'wait' ? Math.max(0, cursor) : timedIdx);
  const handsActive = demoIdx !== null || (s.state === 'LISTENING' && reveal);
  const glowIdx = s.state === 'LISTENING' && exercise.mode === 'wait' ? cursor : demoIdx ?? -1;
  const input = exercise.voice ? 'Voice' : midiIn.devices.length ? 'MIDI' : mic.active ? 'Microphone' : 'Touch / keys';
  const best = progress.ex(exercise.id).best;

  return (
    <div className={`practice-root ${fm.focus ? 'focus' : ''} ${fm.panel ? 'show-' + fm.panel : ''} ${fm.dockOpen ? 'dock-open' : ''}`}>
      {fm.focus && <FocusBar title={exercise.title} panel={fm.panel} onPanel={fm.togglePanel} onExit={fm.exit} infoLabel="Teacher" />}
      {fm.focus && fm.rotateHint && <RotateHint onDismiss={fm.dismissRotate} />}
      {fm.focus && <DockFab open={fm.dockOpen} onToggle={fm.toggleDock} primary={
        <button className={`fab lime ${listening ? 'live' : ''}`} onClick={() => start(true)} aria-label={listening ? 'Restart' : 'Start'}><Icon name={listening || s.state === 'COMPLETED' || s.state === 'RESTART' ? 'restart' : 'play'} size={22} /></button>
      } />}
      <section className="head-row">
        <div className="id-card">
          <span className="avatar"><Icon name={exercise.events.some((e) => e.pitches.length > 1) ? 'chord' : 'note'} size={22} /></span>
          <div><small>Exercise {index + 1} of {lesson.exercises.length}</small><b>{exercise.title}</b></div>
        </div>
        <div className="metrics">
          <Metric label="Goal" value={exercise.objective} big />
          <Metric label="Tempo" value={Math.round(bpm)} unit="bpm" />
          <Metric label="Best" value={Math.round(best)} unit="%" />
          <Metric label="Attempt" value={s.attempt} />
          <Metric label="Mistakes in a row" value={<span className={s.consecutive >= 2 ? 'warn' : ''}>{s.consecutive}</span>} unit={`/${exercise.maxConsecutiveMistakes > 10 ? '∞' : exercise.maxConsecutiveMistakes}`} />
        </div>
      </section>
      {chips}
      <section className="play-grid">
        <div className="stage">
          <div className="card score-card">
            <div className="card-head">
              <b>{exercise.mode === 'wait' ? 'Wait-for-note' : `Timed · ${exercise.timeSig[0]}/${exercise.timeSig[1]}`}</b>
              <span className="legend"><i className="lg correct" />correct <i className="lg partial" />timing <i className="lg wrong" />wrong <i className="lg pending" />to play</span>
            </div>
            {nice && <span key={nice.id} className="nice">{nice.text}</span>}
            <Staff events={exercise.events} clef={exercise.clef} timeSig={exercise.timeSig} statuses={statuses} current={glowIdx} playhead={playhead} highContrast={settings.highContrast} height={exercise.grand ? (fm.focus ? 300 : 260) : fm.focus ? 240 : 168} measureWidth={fm.focus ? 340 : 250} backing={exercise.backing} grand={exercise.grand} />
            {feed[0] && !report && <div key={feed[0].id} className={`latest fb ${feed[0].kind}`}><span className="ic">{icon(feed[0].kind)}</span>{feed[0].text}</div>}
            {report && <div className={`latest fb ${report.passed ? 'correct' : 'wrong'}`}><span className="ic">{report.passed ? '✓' : '✗'}</span>Score {Math.round(report.score)}/100 · {report.grade}{report.passed ? '' : '. 80 needed to pass.'}</div>}
          </div>
          {exercise.voice && (
            <div className="card roll-card">
              <div className="card-head"><b>Your voice</b><span className="legend"><i className="lg correct" />in tune <i className="lg partial" />close <i className="lg wrong" />off</span></div>
              {micErr && <p className="small tip">{micErr}</p>}
              <PitchRoll octaveFree={!!exercise.octaveFree}
                hold={() => (exercise.mode === 'wait' && session.current.state === 'LISTENING' ? exercise.events[session.current.currentIndex()]?.pitches[0] ?? null : null)}
                targets={() => { const c = clock.current; return c ? exercise.events.filter((e) => e.pitches.length).map((e) => ({ midi: e.pitches[0], startMs: c.t0 + e.beat * c.mspb, endMs: c.t0 + (e.beat + e.beats) * c.mspb - 40 })) : []; }} />
            </div>
          )}
          <KeyboardArea lo={lo} hi={hi} marks={marks} labels={labels} showKeyHints={settings.keyHints} baseHeight={exercise.voice ? 120 : fm.focus ? 200 : 180} scrollTo={curEv?.pitches[0] ?? allPitches[0]}
            hands={exercise.voice ? undefined : {
              events: exercise.events, exerciseId: exercise.id, timeOf: (b) => (b * msPerBeat(bpm)) / 1000, timeKey: bpm,
              clock: () => { const c = clock.current; return c ? (performance.now() - c.t0) / 1000 : null; },
              index: handIdx, active: handsActive, demo: exercise.mode === 'wait' && s.state === 'LISTENING' && reveal && demoIdx === null, correction: fix && exercise.mode === 'wait',
            }} />
        </div>
        <aside className="side">
          <FloatHead title="Teacher" onClose={fm.closePanel} />
          {exercise.voice && (
            <div className="card voice-level">
              <div className="card-head"><b>Singing level</b></div>
              <div className="seg wide">{VOICE_LEVELS.map((v) => <button key={v.id} className={settings.voiceLevel === v.id ? 'on' : ''} disabled={s.state === 'LISTENING'} onClick={() => { if (!allowVoiceLevel(getAccount().ent, v.id)) { openUpgrade(`${v.label} singing is part of ${TIER_NAME[voiceLevelTier(v.id)]}`); return; } setSettings({ voiceLevel: v.id }); }}>{v.label}{!allowVoiceLevel(getAccount().ent, v.id) ? ` · ${TIER_NAME[voiceLevelTier(v.id)]}` : ''}</button>)}</div>
              <p className="muted small">{VOICE_LEVELS.find((v) => v.id === settings.voiceLevel)?.blurb}</p>
            </div>
          )}
          {report
            ? <ReportCard r={report} onRetry={() => start(true)} onNext={onNext} mastered={progress.ex(exercise.id).passes >= exercise.requiredPasses} required={exercise.requiredPasses} passes={progress.ex(exercise.id).passes} />
            : (
              <div className="card feed panel-info" aria-live="polite">
                <div className="card-head"><b>Teacher</b><span className={`state-pill ${s.state.toLowerCase()}`}>{s.state.replace('_', '-')}</span></div>
                {curEv && s.state === 'LISTENING' && !exercise.hideLabels && <div className="next"><small>Next</small><b>{curEv.pitches.map(midiToName).join(' + ')}</b>{curEv.fingers && <span>finger{curEv.fingers.length > 1 ? 's' : ''} {curEv.fingers.join('-')}</span>}</div>}
                {feed.length === 0 && <p className="muted small">Press <b>Demo</b> to see and hear it, then the lime <b>Start</b> button. I'll explain every mistake. Three in a row restarts the attempt, never your course.</p>}
                {feed.map((f) => <div key={f.id} className={`fb ${f.kind}`}><span className="ic">{icon(f.kind)}</span>{f.text}</div>)}
              </div>
            )}
        </aside>
      </section>
      <div className="dock">
        <button className={`dock-btn lime ${listening ? 'live' : ''}`} onClick={() => { if (settings.autoFocus && !fm.focus) fm.enter(); start(true); }} aria-label={listening ? 'Restart' : 'Start'}>
          <Icon name={listening || s.state === 'COMPLETED' || s.state === 'RESTART' ? 'restart' : 'play'} size={18} />
        </button>
        <span className="dock-label">{listening ? 'Restart' : s.state === 'RESTART' ? `Attempt ${s.attempt + 1}` : s.state === 'COMPLETED' ? 'Again' : 'Start'}</span>
        <button className="dock-btn" onClick={demo} aria-label="Demo"><Icon name="eye" size={17} /></button>
        <span className="dock-label">Demo</span>
        <span className="dock-sep" />
        <div className="dock-group">
          {[50, 75, 100].map((p) => <button key={p} className={`dock-chip ${tempoPct === p ? 'on' : ''}`} disabled={listening} onClick={() => setTempoPct(p)}>{p}%</button>)}
          <input className="dock-range" type="range" min={20} max={150} step={5} value={tempoPct} disabled={listening} onChange={(e) => setTempoPct(+e.target.value)} aria-label="Tempo percent" />
          <span className="dock-label">{tempoPct}%</span>
        </div>
        <span className="dock-sep" />
        {exercise.mode === 'timed' && <>
          <button className={`dock-btn ${metroOn ? 'on' : ''}`} onClick={() => setMetroOn(!metroOn)} disabled={listening} aria-label="Metronome"><Icon name="metro" size={17} /></button>
          <div className="beats" aria-hidden>{Array.from({ length: exercise.timeSig[0] }, (_, i) => <span key={i} className={beatFlash === i ? (i === 0 ? 'on accent' : 'on') : ''} />)}</div>
          <span className="dock-sep" />
        </>}
        {!exercise.voice && <><button className={`dock-btn ${settings.hands ? 'on' : ''}`} onClick={() => setSettings({ hands: !settings.hands })} aria-label="Show hands"><Icon name="hand" size={17} /></button>
        <span className="dock-label">Hands {settings.hands ? 'on' : 'off'}</span></>}
        <span className="dock-fill" />
        <span className="dock-status" title="Where your playing is coming from"><Icon name={input === 'MIDI' ? 'midi' : input === 'Microphone' || input === 'Voice' ? 'mic' : 'keys'} size={15} /> Input: {input}</span>
        <button className={`dock-btn dock-fs ${fm.focus ? "on" : ""}`} onClick={fm.toggle} aria-label={fm.focus ? 'Leave full screen (Esc)' : 'Full screen practice'} title={fm.focus ? 'Leave full screen (Esc)' : 'Full screen practice'}><Icon name={fm.focus ? 'close' : 'expand'} size={16} /></button>
      </div>
    </div>
  );
}

export const icon = (k: string) => ({ correct: '✓', partial: '~', wrong: '✗', restart: '↻', uncertain: '?', extra: '+', progress: '•' } as Record<string, string>)[k] ?? '•';

export function ReportCard({ r, onRetry, onNext, mastered, required, passes }: { r: AssessmentReport; onRetry: () => void; onNext?: () => void; mastered: boolean; required: number; passes: number }) {
  return (
    <div className={`card report ${r.passed ? 'pass' : 'fail'}`}>
      <div className="card-head"><b>Result</b><span className={`state-pill ${r.passed ? 'completed' : 'restart'}`}>{r.grade}</span></div>
      <div className="score"><b>{Math.round(r.score)}</b><span>/100</span></div>
      <p className="verdict">{r.passed ? (mastered ? 'Mastered. The next step is unlocked.' : `Passed (${passes}/${required}). Pass again to show it was not a one-off.`) : 'Not yet. 80 is needed to move on. Use the advice below and try again.'}</p>
      <div className="rubric">
        {r.components.map((c) => (
          <div key={c.key} className={`rb ${c.measured ? '' : 'na'}`}>
            <span>{c.label}</span>
            <div className="track"><div className={`fill ${c.score >= 0.8 ? 'ok' : ''}`} style={{ width: c.measured ? `${c.score * 100}%` : 0 }} /></div>
            <b>{c.measured ? Math.round(c.score * 100) : 'n/a'}</b>
          </div>
        ))}
        <small className="muted">n/a = not measurable with this input; its weight is shared by the others.</small>
      </div>
      <div className="counts"><span>✓ {r.correct}</span><span>~ {r.partial}</span><span>✗ {r.wrong}</span><span>missed {r.missed}</span><span>extra {r.extra}</span>{r.uncertainIgnored > 0 && <span>unclear {r.uncertainIgnored}</span>}</div>
      {r.advice.length > 0 && <ul className="advice">{r.advice.map((a, i) => <li key={i}>{a}</li>)}</ul>}
      <div className="row"><button className="btn" onClick={onRetry}><Icon name="restart" size={15} /> Try again</button>{mastered && onNext && <button className="btn dark" onClick={onNext}>Next</button>}</div>
    </div>
  );
}
