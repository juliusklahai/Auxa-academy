import { PageHead } from './PageHead';
import { Glossary } from './Glossary';
import { PlaceInvite } from './PlaceInvite';
import { CertShelf } from './Certificate';
import { getProfile, INTEREST_TRACK } from './learnerProfile';
import { certLevels, earned } from '../progress/certs';
import { Games } from './Games';
import { Composer } from './Composer';
import { VoiceHelp } from './VoiceHelp';
import { useEffect, useRef, useState } from 'react';
import { Select } from './Select';
import { audio } from '../audio/engine';
import { metronome } from '../audio/metronome';
import { midiToName } from '../core/music';
import type { Lesson, SkillId } from '../core/types';
import { LEVEL_GROUP, LEVEL_NAMES } from '../curriculum/levels';
import { allowLesson, lessonTier, TIER_NAME } from '../account/gate';
import { getAccount, useAccount } from '../account/store';
import { LESSONS, PIANO_LESSONS, VOICE_LESSONS } from '../curriculum/lessons';
import { onLearnerNote } from '../input/bus';
import { mic, type MicFrame, micHelp } from '../input/mic';
import { midiIn } from '../input/midi';
import { dayKey } from '../progress/store';
import { Icon } from './Icon';

import { SongShelf } from './MyMusic';
import { Piano, type KeyMark } from './Piano';
import { FloatHead, FocusBar, RotateHint } from './FocusBar';
import { isPhone, useFocusMode } from './focus';
import { bumpProgress, progress, setSettings, useProgressVersion, useSettings } from './settings';

const SKILL_LABEL: Record<SkillId, string> = {
  keyboardGeography: 'Keyboard geography', noteReadingTreble: 'Reading: treble', noteReadingBass: 'Reading: bass',
  pitchAccuracy: 'Pitch accuracy', rhythm: 'Rhythm', pulse: 'Steady pulse', fingerTechnique: 'Finger technique',
};
const LEVEL_NAME = LEVEL_NAMES;

/** Lime area sparkline of attempt scores, with a dark marker on the best attempt. */
/** How far a lesson is: exercises passed out of all. */
const lessonFrac = (l: Lesson) => l.exercises.length ? l.exercises.filter((e) => progress.ex(e.id).passes >= e.requiredPasses).length / l.exercises.length : 0;

/** Small circle with a progress ring. */
function Ring({ value, done, size = 56, children }: { value: number; done?: boolean; size?: number; children?: React.ReactNode }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <span className={`ring ${done ? 'done' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" style={{ strokeWidth: 4 }} />
        {value > 0.001 && <circle cx={size / 2} cy={size / 2} r={r} className="ring-bar" style={{ strokeWidth: 4 }} strokeDasharray={`${c * Math.min(1, value)} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      </svg>
      <span className="ring-in">{children}</span>
    </span>
  );
}

/** One lesson as a tidy row: ring, title, one line of summary, lock or plan tag. */
function LessonTile({ l, onOpen, n }: { l: Lesson; onOpen: () => void; n: number }) {
  useAccount();
  const plan = !allowLesson(getAccount().ent, l);
  const unlocked = progress.lessonUnlocked(l, LESSONS);
  const done = progress.lessonComplete(l);
  const f = lessonFrac(l);
  return (
    <button className={`ltile ${done ? 'done' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked && !plan} onClick={onOpen}>
      <Ring value={f} done={done}>{done ? <Icon name="check" size={16} /> : !unlocked || plan ? <Icon name="lock" size={14} /> : <b>{n}</b>}</Ring>
      <span className="ltile-text">
        <b>{l.title}</b>
        <small>{l.summary}</small>
      </span>
      {plan && <span className={`pro-tag inline ${lessonTier(l)}`}>{TIER_NAME[lessonTier(l)]}</span>}
    </button>
  );
}

/** The current stage of the course as a row of rings; tap one to open its lesson. */
function PathTimeline({ lessons: all, openLesson }: { lessons: Lesson[]; openLesson: (l: Lesson, ex?: number) => void }) {
  useAccount();
  const ref = useRef<HTMLDivElement>(null);
  const nextAll = all.find((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  const groups = [...new Set(all.map((l) => LEVEL_GROUP[l.level] ?? 'More'))];
  const [group, setGroup] = useState(() => LEVEL_GROUP[nextAll?.level ?? 0] ?? groups[0]);
  const lessons = all.filter((l) => (LEVEL_GROUP[l.level] ?? 'More') === group);
  const next = lessons.findIndex((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  useEffect(() => {
    const el = ref.current;
    const col = el?.querySelectorAll<HTMLElement>('.pnode')[next];
    if (el && col && next > 1) el.scrollTo({ left: Math.max(0, col.offsetLeft - 40), behavior: 'smooth' });
    else el?.scrollTo({ left: 0 });
  }, [next, group]);
  return (
    <section className="card stage-card">
      <div className="stage-top">
        <b>Your path</b>
        <Select value={group} aria-label="Lesson stage" onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </div>
      <div className="pnodes" ref={ref}>
        {lessons.map((l, i) => {
          const done = progress.lessonComplete(l);
          const open = progress.lessonUnlocked(l, LESSONS);
          const plan = !allowLesson(getAccount().ent, l);
          return (
            <button key={l.id} className={`pnode ${i === next ? 'next' : ''} ${open ? '' : 'locked'}`} disabled={!open && !plan} onClick={() => openLesson(l)} title={l.title}>
              <Ring value={lessonFrac(l)} done={done} size={72}>{done ? <Icon name="check" size={18} /> : !open || plan ? <Icon name="lock" size={16} /> : <b>{l.level}·{lessons.filter((x) => x.level === l.level).indexOf(l) + 1}</b>}</Ring>
              <span>{l.title}</span>
            </button>
          );
        })}
      </div>
    </section>
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
  const comps = progress.competencies(LESSONS);
  const next = PIANO_LESSONS.find((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  const due = progress.dueReviews();
  const today = progress.data.practiceLog[dayKey(Date.now())] ?? 0;
  const weakest = Object.entries(comps).sort((a, b) => a[1]! - b[1]!)[0];
  const doneCount = PIANO_LESSONS.filter((l) => progress.lessonComplete(l)).length;
  const prof = getProfile();
  const plays = prof?.experience === 'comfortable' || prof?.experience === 'advanced';
  const showPlacement = progress.data.placedLevel === undefined && !progress.data.placementSkipped && doneCount < 6;
  const myTracks = [...new Set((prof?.interests ?? []).map((x) => INTEREST_TRACK[x]))];
  const nextCert = certLevels(LESSONS).find((lv) => !progress.data.certs?.[lv]) ?? null;
  const certLs = nextCert === null ? [] : PIANO_LESSONS.filter((l) => l.level === nextCert);
  const nextCertFrac = certLs.length ? certLs.filter((l) => progress.lessonComplete(l)).length / certLs.length : 0;
  return (
    <div className="page">
      {next ? (
        <section className="card up-next">
          <div className="un-top">
            <Ring value={lessonFrac(next)} size={58}><Icon name="play" size={18} /></Ring>
            {due.length > 0 && <button className="un-chip" onClick={() => { const l = LESSONS.find((x) => x.exercises.some((e) => e.id === due[0]))!; openLesson(l, l.exercises.findIndex((e) => e.id === due[0])); }}>Review {due.length}<Icon name="restart" size={13} /></button>}
          </div>
          <div className="un-mid">
            <small>{prof?.name ? `${prof.name}, up next` : 'Up next'} <i>· {Math.round(lessonFrac(next) * 100)}% done</i></small>
            <h1>{next.title}</h1>
            <div className="un-tags"><span>Level {next.level}</span><span>{LEVEL_NAME[next.level]}</span><span>{next.exercises.length} exercises</span></div>
            <p>{next.summary}</p>
          </div>
          <div className="un-foot">
            <div className="un-stat"><b>{progress.streak()} day streak</b><i>{Math.round(today / 60)}{prof ? ` of ${prof.minutes}` : ''} min today</i></div>
            <button className="btn lime" onClick={() => openLesson(next)}><Icon name="play" size={15} />Continue</button>
          </div>
        </section>
      ) : <section className="card up-next"><div className="up-text"><h1>Every lesson mastered</h1><p>Play songs in My Music or free play in the Piano Studio.</p></div></section>}
      {showPlacement && <PlaceInvite plays={plays} onSkip={() => { progress.data.placementSkipped = true; progress.save(); bumpProgress(); }} />}
      {myTracks.length > 0 && (
        <section className="card my-tracks">
          <div className="card-head"><b>Your tracks</b><span className="muted">From what you told us</span></div>
          <div className="cert-row">{myTracks.map((t) => (
            <button key={t} className="cert-chip" onClick={() => { try { sessionStorage.setItem('maestro.lessonsTab', t); } catch { /* */ } window.dispatchEvent(new CustomEvent('maestro:tab', { detail: 'learn' })); }}>
              <span className="game-ic"><Icon name={t === 'Church' ? 'people' : t === 'Jazz' ? 'wave' : t === 'Play by ear' ? 'ear' : t === 'Arranging' ? 'doc' : 'chord'} size={17} /></span><span><b>{t}</b><small>{PIANO_LESSONS.filter((l) => LEVEL_GROUP[l.level] === t).length || ''} lessons</small></span>
            </button>
          ))}</div>
        </section>
      )}
      <PathTimeline lessons={PIANO_LESSONS} openLesson={openLesson} />
      <CertShelf earnedList={earned(progress)} nextLevel={nextCert} nextFrac={nextCertFrac} onOpen={(level, date) => window.dispatchEvent(new CustomEvent('maestro:cert', { detail: { level, date } }))} />
      <section className="grid2">
        <div className="card">
          <div className="card-head"><b>Skill profile</b></div>
          {(Object.keys(SKILL_LABEL) as SkillId[]).map((k) => (
            <div className="bar" key={k}><span>{SKILL_LABEL[k]}</span><div className="track"><div className={`fill ${(comps[k] ?? 0) >= 80 ? 'ok' : ''}`} style={{ width: `${comps[k] ?? 0}%` }} /></div><b>{comps[k] !== undefined ? comps[k] : '-'}</b></div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><b>Today's 20 minutes</b></div>
          <ol className="plan">
            <li><span>3 min</span>Posture, loose hands, find every C</li>
            <li><span>5 min</span>{weakest && weakest[1]! < 80 ? SKILL_LABEL[weakest[0] as SkillId] : 'C position up and down'}</li>
            <li><span>9 min</span>{next ? next.title : 'Free play in Piano Studio'}</li>
            <li><span>3 min</span>{due.length ? `${due.length} review${due.length > 1 ? 's' : ''} due` : 'One clean run of something you know'}</li>
          </ol>
        </div>
      </section>
      <PracticeLog />
    </div>
  );
}

export function LearnList({ openLesson, openSong, openScore }: { openLesson: (l: Lesson, ex?: number) => void; openSong?: (id: string) => void; openScore?: (xml: string) => void }) {
  useProgressVersion();
  const groups = [...new Set(PIANO_LESSONS.map((l) => LEVEL_GROUP[l.level] ?? 'More'))];
  const nextAll = PIANO_LESSONS.find((l) => !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS));
  // three shelves: the main path (levels 0 to 9), specialty tracks, and practice tools
  const PATH = ['Beginner', 'Elementary', 'Intermediate', 'Advanced'];
  const SHELVES: Record<string, string[]> = {
    'Learning path': PATH.filter((g) => groups.includes(g)),
    Specialties: [...groups.filter((g) => !PATH.includes(g)), 'Singing'],
    Practice: [...(openSong ? ['Songs'] : []), 'Games', 'Create', 'Glossary'],
  };
  const tabs = Object.values(SHELVES).flat();
  const [tab, setTab] = useState(() => { try { const t = sessionStorage.getItem('maestro.lessonsTab'); if (t && tabs.includes(t)) return t; } catch { /* */ } return LEVEL_GROUP[nextAll?.level ?? 0] ?? groups[0]; });
  const pick = (t: string) => { setTab(t); try { sessionStorage.setItem('maestro.lessonsTab', t); } catch { /* */ } };
  const shelf = Object.keys(SHELVES).find((k) => SHELVES[k].includes(tab)) ?? 'Learning path';
  const done = LESSONS.filter((l) => progress.lessonComplete(l)).length;
  const levels = [...new Set(PIANO_LESSONS.filter((l) => (LEVEL_GROUP[l.level] ?? 'More') === tab).map((l) => l.level))];
  const ABOUT: Record<string, string> = {
    'Play by ear': 'Hear a song, find its key, melody and chords, and play it without sheet music.',
    Jazz: 'Seventh chords, swing, ii-V-I, voicings, blues, improvising and lead sheets.',
    Arranging: 'Write for four voices: ranges, voice leading, cadences, harmonizing and choir arranging.',
    Church: 'Hymns in two, three and four parts, introductions and Amens, chord symbols, keyboard and organ.',
    Styles: 'Pop grooves, blues and boogie, ragtime, Latin, gospel, highlife and Afrobeat, accompanying singers.',
    Singing: 'Sing with the microphone: match notes, solfege, leaps and sight-singing.',
  };
  return (
    <div className="page">
      <section className="ex-head">
        <small>{done} of {LESSONS.length} lessons mastered · pass with 80% to unlock the next one</small>
        <h2>Lessons</h2>
      </section>
      <div className="seg shelf-seg" role="tablist">{Object.keys(SHELVES).map((k) => <button key={k} role="tab" aria-selected={shelf === k} className={shelf === k ? 'on' : ''} onClick={() => pick(SHELVES[k].includes(tab) ? tab : SHELVES[k][0])}>{k}</button>)}</div>
      <div className="chip-row shelf-chips">{SHELVES[shelf].map((t) => {
        const ls = t === 'Singing' ? VOICE_LESSONS : PIANO_LESSONS.filter((l) => (LEVEL_GROUP[l.level] ?? 'More') === t);
        const n = ls.filter((l) => progress.lessonComplete(l)).length;
        return <button key={t} className={`chip ${t === tab ? 'on' : ''}`} onClick={() => pick(t)}>{t}{shelf !== 'Practice' && <small className="chip-count">{n}/{ls.length}</small>}</button>;
      })}</div>
      {ABOUT[tab] && <p className="shelf-about muted">{ABOUT[tab]}</p>}
      {levels.map((lv) => (
        <section key={lv} className="level">
          <div className="level-head"><b>Level {lv}</b><span className="muted">{LEVEL_NAME[lv]}</span></div>
          <div className="tile-grid">
            {PIANO_LESSONS.filter((l) => l.level === lv).map((l, i) => <LessonTile key={l.id} n={i + 1} l={l} onOpen={() => openLesson(l)} />)}
          </div>
        </section>
      ))}
      {tab === 'Glossary' && <Glossary openLesson={(l) => openLesson(l)} />}
      {tab === 'Games' && <Games openLesson={openLesson} />}
      {tab === 'Create' && <Composer openScore={openScore} />}
      {tab === 'Songs' && openSong && <section className="level"><div className="level-head"><b>Songs</b><span className="muted">Right hand, left hand or both, with instruments playing along</span></div><SongShelf onOpen={openSong} /></section>}
      {tab === 'Singing' && (
        <section className="level">
          <div className="level-head"><b>Singing</b><span className="muted">Any octave counts.</span></div>
          <div className="tile-grid">{VOICE_LESSONS.map((l, i) => <LessonTile key={l.id} n={i + 1} l={l} onOpen={() => openLesson(l)} />)}</div>
        </section>
      )}
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
  // full screen (phones: straight away, sideways): just the keys, as big as the screen allows
  const fm = useFocusMode();
  useEffect(() => { if (isPhone()) fm.enter(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [vh, setVh] = useState(window.innerHeight);
  useEffect(() => { const on = () => setVh(window.innerHeight); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
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
  const options = (
    <>
      {(['25', '61', '88'] as const).map((k) => <button key={k} className={`chip ${size === k ? 'on' : ''}`} onClick={() => setSize(k)}>{k} keys</button>)}
      <span className="chip-sep" />
      {(['letters', 'solfege', 'none'] as const).map((k) => <button key={k} className={`chip ${settings.labels === k ? 'on' : ''}`} onClick={() => setSettings({ labels: k })}>{k === 'none' ? 'No labels' : k === 'solfege' ? 'Solfège' : 'Letters'}</button>)}
      <button className={`chip ${settings.keyHints ? 'on' : ''}`} onClick={() => setSettings({ keyHints: !settings.keyHints })}>Computer keys</button>
    </>
  );
  const pianoH = fm.focus ? Math.max(130, Math.min(360, vh - (vh < 520 ? 110 : 200))) : size === '88' ? 190 : 230;
  return (
    <div className={`page practice-root studio ${fm.focus ? 'focus' : ''} ${fm.panel ? 'show-' + fm.panel : ''} ${fm.dockOpen ? 'dock-open' : ''}`}>
      {fm.focus && <FocusBar title="Piano Studio" panel={fm.panel} onPanel={fm.togglePanel} onExit={fm.exit} infoLabel="Keyboard" tools={<>
        <button className={`fbtn tool lime ${running ? 'live' : ''}`} onClick={toggle} aria-label="Metronome start or stop"><Icon name={running ? 'pause' : 'metro'} size={16} /><span className="fl">{running ? 'Stop' : 'Click'}</span></button>
        <button className={`fbtn tool ${fm.dockOpen ? 'on' : ''}`} onClick={fm.toggleDock} aria-expanded={fm.dockOpen} aria-label="Options"><Icon name="sliders" size={16} /><span className="fl">Options</span></button>
      </>} />}
      {fm.focus && fm.rotateHint && <RotateHint onDismiss={fm.dismissRotate} />}
      {fm.focus && <div className="side"><div className="card panel-info"><FloatHead title="Keyboard" onClose={fm.closePanel} /><div className="chip-row">{options}</div></div></div>}
      <PageHead kicker="Free play, not scored" title="Piano Studio" stats={[['You played', last], ['Tempo', `${bpm} bpm`], ['Meter', `${beats}/4`]]} />
      <div className="chip-row">{options}</div>
      {fm.focus && <div className="studio-now"><small>You played</small><b>{last}</b><span className="beats" aria-hidden>{running && Array.from({ length: beats }, (_, i) => <span key={i} className={flash === i ? (i === 0 ? 'on accent' : 'on') : ''} />)}</span></div>}
      <section className="card keys-card tall">
        <Piano lo={lo} hi={hi} marks={marks} labels={settings.labels} showKeyHints={settings.keyHints} height={pianoH} scrollTo={60} minKeyWidth={size === '88' ? 26 : 34} />
        <p className="muted small studio-help">Computer keyboard: A S D F G H J K L are white keys, W E T Y U O P black keys, Z and X shift the octave. Chords played on MIDI or an acoustic piano show above.</p>
      </section>
      <div className="dock">
        <button className={`dock-btn lime ${running ? 'live' : ''}`} onClick={toggle} aria-label="Metronome start or stop"><Icon name={running ? 'pause' : 'metro'} size={18} /></button>
        <span className="dock-label">Metronome</span>
        {!fm.focus && <button className="dock-btn dock-fs" onClick={fm.toggle} aria-label="Full screen" title="Full screen"><Icon name="expand" size={17} /></button>}
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
  const [sec, setSec] = useState<'input' | 'sound' | 'learn' | 'data'>('input');
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
  const SECTIONS = [['input', 'Input', 'mic'], ['sound', 'Sound', 'wave'], ['learn', 'Learning', 'note'], ['data', 'Data', 'doc']] as const;
  return (
    <div className="page setup">
      <section className="setup-head">
        <b>Setup</b>
        <div className="setup-tabs" role="tablist">
          {SECTIONS.map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={sec === id} className={sec === id ? 'on' : ''} onClick={() => setSec(id)}><Icon name={icon} size={16} />{label}</button>
          ))}
        </div>
      </section>
      <div className="setup-body">
        {sec === 'input' && <section className="card">
          <div className="card-head"><b>MIDI keyboard</b></div>
          <p className="small muted">Most precise. Exact keys, timing, chords, velocity and pedal.</p>
          <button className="btn dark" onClick={connectMidi} disabled={!midiIn.supported}>Connect MIDI</button>
          <p className="small">{midiIn.supported ? (midiState || 'Not connected yet.') : 'This browser has no Web MIDI. Use Chrome or Edge on a computer, or the microphone.'}</p>
          <div className="card-head" style={{ marginTop: 18 }}><b>Microphone</b></div>
          <label className="field">What are you playing into the microphone?
            <Select value={st.micInstrument} onChange={(e) => { const v = e.target.value as typeof st.micInstrument; setSettings({ micInstrument: v, micMode: v === 'mono' || v === 'voice' ? 'voice' : 'piano' }); }}>
              <option value="piano">Acoustic piano (chords)</option>
              <option value="epiano">Digital / electric piano, stage piano (chords)</option>
              <option value="organ">Organ, harmonium, church organ (chords)</option>
              <option value="synth">Keyboard / synthesizer (chords)</option>
              <option value="mono">One-note instrument: violin, flute, sax, trumpet, guitar melody</option>
              <option value="voice">Voice (singing)</option>
            </Select>
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
              <Select value={st.micDeviceId} onChange={(e) => restartMic(() => setSettings({ micDeviceId: e.target.value }))}>
                <option value="">System default</option>
                {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </Select>
              <small className="muted">Using Bluetooth earphones? Pick the computer's or phone's built-in microphone here. Earphones that also act as the microphone often switch to a low-quality, crackly "headset" sound.</small>
            </label>
          )}
          <label className="field">Strictness {Math.round(st.micSensitivity * 100)}%<input type="range" min={0.7} max={0.97} step={0.01} value={st.micSensitivity} onChange={(e) => setSettings({ micSensitivity: +e.target.value })} /></label>
          <label className="field">Latency compensation {st.latencyMs} ms<input type="range" min={0} max={300} step={5} value={st.latencyMs} onChange={(e) => setSettings({ latencyMs: +e.target.value })} /></label>
        </section>}
        {sec === 'sound' && <section className="card">
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
        </section>}
        {sec === 'learn' && <section className="card">
          <div className="card-head"><b>Learning aids</b></div>
          <label className="field">Key labels<Select value={st.labels} onChange={(e) => setSettings({ labels: e.target.value as 'letters' })}><option value="letters">Letters (C D E)</option><option value="solfege">Solfège (Do Re Mi)</option><option value="none">None</option></Select></label>
          <label className="check"><input type="checkbox" checked={st.hands} onChange={(e) => setSettings({ hands: e.target.checked })} /> Show guide hands on the keyboard</label>
          <label className="check"><input type="checkbox" checked={st.coachVoice !== false} onChange={(e) => setSettings({ coachVoice: e.target.checked })} /> Voice coach: read each lesson step aloud</label>
          <VoiceHelp />
          <label className="check"><input type="checkbox" checked={st.autoFocus} onChange={(e) => setSettings({ autoFocus: e.target.checked })} /> Full-screen practice when I press Start (Esc returns)</label>
          <label className="check"><input type="checkbox" checked={st.keyHints} onChange={(e) => setSettings({ keyHints: e.target.checked })} /> Show computer-keyboard letters on keys</label>
          <label className="field">Mistake policy<Select value={st.mistakePolicy} onChange={(e) => setSettings({ mistakePolicy: e.target.value as 'restart' })}><option value="restart">Challenge: 3 in a row restarts (earns mastery)</option><option value="pause">Supported: never restart (practice only)</option></Select></label>
          <label className="check"><input type="checkbox" checked={st.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High-contrast mode</label>
        </section>}
        {sec === 'data' && <section className="card">
          <div className="card-head"><b>Your progress</b></div>
          <p className="small muted">Progress is stored on this device and works offline.</p>
          <div className="row wrap">
            <button className="btn" onClick={() => { try { void navigator.clipboard.writeText(exportJson); setMsg('Progress copied to the clipboard.'); } catch { /* ignore */ } }}>Copy progress</button>
            <button className="btn" onClick={() => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJson], { type: 'application/json' })); a.download = 'auxa-progress.json'; a.click(); } catch { /* sandboxed */ } }}>Download</button>
            {confirmReset
              ? <><button className="btn danger" onClick={() => { progress.reset(); bumpProgress(); setConfirmReset(false); }}>Yes, erase</button><button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button></>
              : <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset progress</button>}
          </div>
        </section>}
      </div>
    </div>
  );
}
