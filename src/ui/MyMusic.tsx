// My Music: open your own MusicXML, listen, and PRACTISE it like a lesson.
// Choose the part(s) you play or sing; the cursor waits for you (or follows the beat in timed mode),
// listens through MIDI / microphone / touch, colors every note, and the other parts accompany you.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AssessmentSession, type Feedback } from '../assessment/session';
import { audio, INSTRUMENTS, type Instrument, type Drum } from '../audio/engine';
import { SONGS, songXml, songByTitle, type Groove } from '../songs';
import type { PartInfo } from '../musicxml/parse';
import type { AssessmentReport, NoteStatus } from '../core/types';
import { onLearnerNote } from '../input/bus';
import { setExpected } from '../input/expect';
import { mic, micHelp } from '../input/mic';
import { midiIn } from '../input/midi';
import { demoChoraleXml } from '../musicxml/demo';
import { deleteScore, listScores, saveScore, scoreId, type LibItem } from '../musicxml/library';
import { musicXmlText, parseMusicXml, type Score, type ScoreNote } from '../musicxml/parse';
import { buildPractice, rangeQ, toSrcQ, type PracticeBuild } from '../musicxml/practice';
import { Timeline } from '../musicxml/tempo';
import { transposedKey } from './keyname';
import { computeHandStates, HandsOverlay, PALM_SPACE } from './Hands';
import { Icon } from './Icon';
import { icon, Metric, ReportCard } from './LessonView';
import { Piano, type KeyMark } from './Piano';
import { PitchRoll } from './PitchRoll';
import { ScoreView, noteKey, type ScoreViewHandle } from './ScoreView';
import { progress, bumpProgress, setSettings, useSettings } from './settings';

interface Mix { mute: boolean; solo: boolean; vol: number; inst: Instrument }

/** Default play-along instrument from the part's MIDI program (General MIDI) or its name. */
export function guessInstrument(p: PartInfo | undefined): Instrument {
  if (!p) return 'piano';
  const g = p.program ?? 0, n = p.name.toLowerCase();
  if (g === 41 || /violin/.test(n)) return 'violin';
  if (g === 42 || /viola/.test(n)) return 'viola';
  if (g === 43 || /cello/.test(n)) return 'cello';
  if ((g >= 49 && g <= 52) || /string/.test(n)) return 'strings';
  if ((g >= 74 && g <= 80) || /flute|recorder|piccolo/.test(n)) return 'flute';
  if ((g >= 33 && g <= 40) || g === 44 || /bass guitar|double bass|contrabass/.test(n)) return 'bass';
  if ((g >= 53 && g <= 55) || /aah|ooh/.test(n)) return 'choir';
  return 'piano';
}

/** Drum pattern for one bar in a groove style. */
export function grooveBar(style: Groove, beats: number, beatType: number): { at: number; kind: Drum; vel: number }[] {
  if (style === 'none') return [];
  const out: { at: number; kind: Drum; vel: number }[] = [];
  const beatQ = 4 / beatType;
  if (beatType === 8) { // 6/8, 3/8, 9/8, 12/8: felt in dotted quarters
    for (let i = 0; i < beats; i++) {
      out.push({ at: i * beatQ, kind: 'hat', vel: i % 3 === 0 ? 0.6 : 0.35 });
      if (i % 3 === 0) out.push({ at: i * beatQ, kind: i === 0 ? 'kick' : 'snare', vel: i === 0 ? 0.8 : 0.45 });
    }
    return out;
  }
  if (beats === 3 || style === 'waltz') {
    for (let i = 0; i < beats; i++) out.push(i === 0 ? { at: 0, kind: 'kick', vel: 0.75 } : { at: i * beatQ, kind: 'hat', vel: 0.45 });
    return out;
  }
  for (let i = 0; i < beats; i++) {
    out.push({ at: i * beatQ, kind: 'hat', vel: 0.4 }, { at: i * beatQ + beatQ / 2, kind: 'hat', vel: 0.22 });
    if (i % 2 === 0) out.push({ at: i * beatQ, kind: 'kick', vel: i === 0 ? 0.8 : 0.6 });
    else out.push({ at: i * beatQ, kind: 'snare', vel: 0.4 });
  }
  return out;
}
const ROLE_COLOR: Record<string, string> = { S: '#e2557a', A: '#e59a1c', T: '#14a596', B: '#5b5fe0' };
const STATUS_COLOR: Partial<Record<NoteStatus, string>> = { correct: '#1e8a4c', partial: '#b7791f', wrong: '#c53030', missed: '#c53030' };
const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const keyName = (f: number) => (f >= 0 ? KEYS[f] : KEYS[7 - f]) + ' major';

export function parseXmlString(xml: string): Score {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return parseMusicXml(doc, xml);
}

export function MyMusic({ singPart, onSingHandled, songId, onSongHandled }: { singPart?: 'S' | 'A' | 'T' | 'B' | null; onSingHandled?: () => void; songId?: string | null; onSongHandled?: () => void }) {
  const settings = useSettings();
  const [score, setScore] = useState<Score | null>(null);
  const [err, setErr] = useState('');
  const [lib, setLib] = useState<LibItem[]>([]);
  const [mix, setMix] = useState<Record<string, Mix>>({});
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [sing, setSing] = useState(false);
  const [mode, setMode] = useState<'wait' | 'timed'>('wait');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [tempoPct, setTempoPct] = useState(100);
  const [metro, setMetro] = useState(false);
  const [loop, setLoop] = useState(false);
  const [accomp, setAccomp] = useState(true);
  const [groove, setGroove] = useState<Groove>('none');
  const [grooveVol, setGrooveVol] = useState(0.5);
  const [zoom, setZoom] = useState(0.85);
  const [run, setRun] = useState<'idle' | 'listen' | 'practice'>('idle');
  const [feed, setFeed] = useState<{ kind: Feedback['kind']; text: string; id: number }[]>([]);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [held, setHeld] = useState<Map<number, KeyMark>>(new Map());
  const [, force] = useState(0);
  const view = useRef<ScoreViewHandle>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const clock = useRef<{ t0: number; tl: Timeline; q0: number; q1: number } | null>(null);
  const [tr, setTr] = useState(0);
  const [followTempo, setFollowTempo] = useState(true);
  const micWasOn = useRef(false);
  const session = useRef<AssessmentSession | null>(null);
  const build = useRef<PracticeBuild | null>(null);
  const fid = useRef(0);
  const [cursorIdx, setCursorIdx] = useState(0);
  const latest = useRef<{ onFeedback: (fb: Feedback | null) => void }>(null!);

  const bpm = (score?.tempo ?? 90) * tempoPct / 100;
  const tlFor = (q0: number) => new Timeline(score?.tempoMap ?? [{ q: 0, bpm: 90 }], q0, tempoPct, followTempo);
  const speakers = settings.outputMode === 'speakers';
  const accVol = (k: string) => (mix[k]?.vol ?? 0.8) * (speakers && (mic.active || sing) ? 0.55 : 0.85);
  const tempos = score?.tempoMap.map((t) => t.bpm) ?? [];

  useEffect(() => { listScores().then(setLib); }, []);

  const load = (xml: string, save = true) => {
    try {
      stop();
      const s = parseXmlString(xml);
      setScore(s);
      setErr('');
      const song = songByTitle(s.title);
      setMix(Object.fromEntries(s.tracks.map((t) => [t.key, { mute: false, solo: false, vol: 0.8, inst: song?.colors[t.partId] ?? guessInstrument(s.parts.find((p) => p.id === t.partId)) }])));
      setGroove(song?.groove ?? 'none');
      // default part to practice: the piano right hand if there is a piano, otherwise the top line
      const pianoPart = s.parts.find((p) => p.staves === 2);
      const first = pianoPart ? s.tracks.filter((t) => t.partId === pianoPart.id && t.staff === 1) : s.tracks.filter((t) => t.staff === 1 && t.partId === s.tracks[0].partId);
      setTargets(new Set((first.length ? first : s.tracks.slice(0, 1)).map((t) => t.key)));
      setFrom(0); setTo(s.measures.length - 1); setTr(0);
      setReport(null); setFeed([]);
      if (save) {
        const it: LibItem = { id: scoreId(s.title, xml), title: s.title, composer: s.composer, xml, addedAt: Date.now() };
        saveScore(it).then(() => listScores().then(setLib));
      }
      return s;
    } catch (e) { setErr((e as Error).message); return null; }
  };

  useEffect(() => {
    if (!songId) return;
    load(songXml(songId), false);
    onSongHandled?.();
  }, [songId]); // eslint-disable-line

  useEffect(() => {
    if (!singPart) return;
    const s = load(demoChoraleXml(), false);
    if (s) { const t = s.tracks.find((x) => x.role === singPart); if (t) setTargets(new Set([t.key])); setSing(true); setAccomp(true); }
    onSingHandled?.();
  }, [singPart]); // eslint-disable-line

  const onFile = async (f: File) => {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const xml = musicXmlText(bytes, f.name);
      load(xml);
    } catch (e) { setErr((e as Error).message); }
  };

  // ---------- mixer ----------
  const anySolo = Object.values(mix).some((m) => m.solo);
  const audible = (k: string) => { const m = mix[k]; return !!m && !m.mute && (!anySolo || m.solo); };

  // ---------- scheduling ----------
  const clearTimers = () => { timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = []; };
  const stop = () => {
    clearTimers();
    audio.stopAll();
    clock.current = null;
    setExpected(null);
    view.current?.hideCursor();
    setRun('idle');
    if (session.current && session.current.state !== 'COMPLETED') session.current = null;
    if (sing) mic.settings.mode = settings.micMode;
    if (micWasOn.current) { micWasOn.current = false; mic.start().catch(() => {}); }
  };
  useEffect(() => () => stop(), []); // eslint-disable-line

  /** Stream notes ahead of time from a sorted list (keeps thousands of notes cheap). */
  const streamNotes = (notes: ScoreNote[], tl: Timeline, t0: number, suppressMic = true) => {
    let i = 0;
    const ctx = audio.ensure();
    const tick = () => {
      const now = performance.now();
      const horizonQ = tl.qAt(now + 450 - t0);
      while (i < notes.length && notes[i].startQ < horizonQ) {
        const n = notes[i++];
        const on = tl.msAt(n.startQ), off = tl.msAt(n.startQ + n.durQ);
        audio.scheduleNote(n.midi + tr, ctx.currentTime + (t0 + on - now) / 1000, ((off - on) / 1000) * 0.97, accVol(n.track), suppressMic, mix[n.track]?.inst ?? 'piano');
      }
    };
    tick();
    timers.current.push(window.setInterval(tick, 80) as unknown as number);
  };
  const streamGroove = (q0: number, q1: number, t0: number, tl: Timeline) => {
    if (!score || groove === 'none') return;
    audio.drumsVolume = grooveVol;
    const evs: { q: number; kind: Drum; vel: number }[] = [];
    for (const M of score.measures) {
      if (M.startQ + M.lengthQ <= q0 || M.startQ >= q1) continue;
      const full = (M.beats * 4) / M.beatType;
      const offset = M.lengthQ < full - 1e-9 && M === score.measures[0] ? full - M.lengthQ : 0; // pickup bar
      for (const e of grooveBar(groove, M.beats, M.beatType)) {
        const q = M.startQ + e.at - offset;
        if (q >= M.startQ - 1e-9 && q >= q0 - 1e-9 && q < q1) evs.push({ q, kind: e.kind, vel: e.vel });
      }
    }
    evs.sort((a, b) => a.q - b.q);
    let i = 0;
    const ctx = audio.ensure();
    const tick = () => {
      const now = performance.now();
      const horizonQ = tl.qAt(now + 450 - t0);
      while (i < evs.length && evs[i].q < horizonQ) { const e = evs[i++]; audio.scheduleDrum(e.kind, ctx.currentTime + (t0 + tl.msAt(e.q) - now) / 1000, e.vel); }
    };
    tick();
    timers.current.push(window.setInterval(tick, 80) as unknown as number);
  };
  const scheduleClicks = (q0: number, q1: number, t0: number, tl: Timeline) => {
    if (!score) return;
    for (const M of score.measures) {
      if (M.startQ + M.lengthQ <= q0 || M.startQ >= q1) continue;
      const step = 4 / M.beatType;
      for (let b = 0; b < M.lengthQ - 1e-9; b += step) {
        const q = M.startQ + b;
        if (q < q0 - 1e-9 || q >= q1) continue;
        const ms = t0 + tl.msAt(q) - performance.now();
        if (ms < 8000) audio.click(b === 0, false, ms);
        else timers.current.push(window.setTimeout(() => audio.click(b === 0, false, 0), ms));
      }
    }
  };
  const followCursor = () => {
    // 25 updates per second is plenty for a cursor and keeps the page light while audio plays
    timers.current.push(window.setInterval(() => {
      const c = clock.current;
      if (!c || !score) return;
      const q = c.tl.qAt(performance.now() - c.t0);
      if (q >= c.q0) view.current?.moveTo(toSrcQ(score, Math.min(q, c.q1 - 1e-6)));
    }, 40) as unknown as number);
  };

  const listen = () => {
    if (!score) return;
    stop();
    // The microphone is not needed to listen. Pausing it also keeps Bluetooth earphones in their
    // high-quality mode (many switch to a crackly "headset" mode while a microphone is open).
    if (mic.active) { micWasOn.current = true; mic.stop(); }
    const [q0, q1] = rangeQ(score, from, to);
    const tl = tlFor(q0);
    const notes = score.notes.filter((n) => n.startQ >= q0 - 1e-9 && n.startQ < q1 && audible(n.track));
    const t0 = performance.now() + 300;
    clock.current = { t0, tl, q0, q1 };
    streamNotes(notes, tl, t0);
    streamGroove(q0, q1, t0, tl);
    if (metro) scheduleClicks(q0, q1, t0, tl);
    followCursor();
    setRun('listen');
    timers.current.push(window.setTimeout(() => { if (loop) listen(); else stop(); }, 300 + tl.msAt(q1) + 300));
  };

  // ---------- practice ----------
  const pushFeed = (kind: Feedback['kind'], text: string) => { if (text) setFeed((f) => [{ kind, text, id: fid.current++ }, ...f].slice(0, 5)); };

  const practice = async () => {
    if (!score || !targets.size) return;
    stop();
    if (sing) {
      try { await mic.start(); mic.settings.mode = 'voice'; } catch (e) { setErr(micHelp(e)); return; }
    }
    const b = buildPractice(score, { tracks: [...targets], fromMeasure: from, toMeasure: to, mode, voice: sing, octaveFree: sing, transpose: tr }, bpm);
    const tl = tlFor(b.startQ);
    if (!b.exercise.events.length) { setErr('Your selected part has no notes in these measures.'); return; }
    build.current = b;
    const s = new AssessmentSession(b.exercise, tl.bpmAt(b.startQ), (beat) => tl.msAt(b.startQ + beat));
    session.current = s;
    setReport(null); setFeed([]); setCursorIdx(0);
    s.begin();
    const others = score.notes.filter((n) => n.startQ >= b.startQ - 1e-9 && n.startQ < b.endQ && !targets.has(n.track) && audible(n.track));
    if (mode === 'wait') {
      view.current?.moveTo(b.srcQ[0]);
      setExpected(b.exercise.events[0].pitches);
      pushFeed('progress', `Play ${sing ? 'or sing ' : ''}the first ${b.exercise.events[0].pitches.length > 1 ? 'chord' : 'note'}. The score waits for you.`);
      setRun('practice');
      clock.current = null;
      force((x) => x + 1);
      return;
    }
    // timed: count-in, accompaniment, moving cursor
    const beatsBar = score.measures[from].beats;
    const mspq = tl.mspqAt(b.startQ) * (4 / score.measures[from].beatType);
    const t0 = performance.now() + 200 + beatsBar * mspq;
    clock.current = { t0, tl, q0: b.startQ, q1: b.endQ };
    for (let i = 0; i < beatsBar; i++) audio.click(i === 0, false, 200 + i * mspq);
    if (metro) scheduleClicks(b.startQ, b.endQ, t0, tl);
    if (accomp) { streamNotes(others, tl, t0, false); streamGroove(b.startQ, b.endQ, t0, tl); }
    followCursor();
    timers.current.push(window.setTimeout(() => s.listen(), 200 + beatsBar * mspq - Math.min(250, mspq / 2)));
    timers.current.push(window.setInterval(() => {
      if (s.state !== 'LISTENING') return;
      const nowMs = performance.now() - t0;
      const due = b.exercise.events.filter((e) => Math.abs(tl.msAt(b.startQ + e.beat) - nowMs) <= s.window).flatMap((e) => e.pitches);
      setExpected(due.length ? due : null);
      latest.current.onFeedback(s.tick(nowMs));
    }, 40) as unknown as number);
    pushFeed('progress', `Count-in, then ${sing ? 'sing' : 'play'} with the moving cursor.`);
    setRun('practice');
  };

  const onFeedback = (fb: Feedback | null) => {
    const s = session.current, b = build.current;
    if (!fb || !s || !b || fb.kind === 'ignored' || (fb.kind === 'progress' && !fb.message)) { force((x) => x + 1); return; }
    pushFeed(fb.kind, fb.message);
    if (mode === 'wait' && (fb.kind === 'correct' || fb.kind === 'partial') && fb.eventIndex !== undefined) {
      // play the other voices for this moment, then move the cursor on
      if (accomp && score) {
        const evQ = b.startQ + b.exercise.events[fb.eventIndex].beat;
        const nextQ = fb.eventIndex + 1 < b.exercise.events.length ? b.startQ + b.exercise.events[fb.eventIndex + 1].beat : b.endQ;
        const ctx = audio.ensure();
        const tl = tlFor(evQ);
        score.notes.filter((n) => n.startQ >= evQ - 1e-9 && n.startQ < nextQ - 1e-9 && !targets.has(n.track) && audible(n.track))
          .forEach((n) => audio.scheduleNote(n.midi + tr, ctx.currentTime + tl.msAt(n.startQ) / 1000, (tl.msAt(Math.min(n.startQ + n.durQ, nextQ + 0.5)) - tl.msAt(n.startQ)) / 1000, accVol(n.track), false, mix[n.track]?.inst ?? 'piano'));
      }
      const ni = s.currentIndex();
      if (ni >= 0) { view.current?.moveTo(b.srcQ[ni]); setExpected(b.exercise.events[ni].pitches); setCursorIdx(ni); }
    }
    if (fb.kind === 'restart') {
      timers.current.push(window.setTimeout(() => { s.restart(); s.begin(); if (mode === 'wait') { view.current?.moveTo(b.srcQ[0]); setCursorIdx(0); setExpected(b.exercise.events[0].pitches); } else practice(); force((x) => x + 1); }, 2200));
    }
    if (s.state === 'COMPLETED' && s.report) {
      const r = s.report;
      setReport(r);
      progress.logPractice(Math.round((performance.now() - (clock.current?.t0 ?? performance.now())) / 1000) || 30);
      bumpProgress();
      clearTimers();
      clock.current = null;
      setExpected(null);
      setRun('idle');
      if (loop && r.passed === false) pushFeed('progress', 'Loop is on: press Practice to go again.');
    }
    force((x) => x + 1);
  };
  latest.current = { onFeedback };

  useEffect(() => onLearnerNote((n) => {
    setHeld((h) => { const m = new Map(h); if (n.on) m.set(n.midi, 'played'); else m.delete(n.midi); return m; });
    if (n.source === 'mic') setTimeout(() => setHeld((h) => { const m = new Map(h); m.delete(n.midi); return m; }), 450);
    const s = session.current;
    if (!s || s.state !== 'LISTENING') return;
    const t0 = clock.current?.t0 ?? 0;
    const time = mode === 'wait' ? n.at : n.at - t0;
    if (!n.on) { s.noteOff(n.midi, time); return; }
    const fb = s.input({ midi: n.midi, time, source: n.source, confidence: n.confidence, velocity: n.velocity, cents: n.cents });
    if (fb.kind === 'correct' || fb.kind === 'partial' || fb.kind === 'progress') setHeld((h) => new Map(h).set(n.midi, fb.kind === 'partial' ? 'partial' : 'correct'));
    if (fb.kind === 'wrong' || fb.kind === 'restart') setHeld((h) => new Map(h).set(n.midi, 'wrong'));
    latest.current.onFeedback(fb);
  }), [mode]); // eslint-disable-line

  // color notes on the score
  const s = session.current, b = build.current;
  const results = s?.results();
  useEffect(() => {
    if (!view.current) return;
    const colors = new Map<string, string>();
    if (s && b && results) results.forEach((r, i) => { const c = STATUS_COLOR[r.status]; if (c) b.eventNotes[i].forEach((n) => colors.set(noteKey(n.srcStartQ, n.midi), c)); });
    view.current.color(colors);
  });

  // keyboard + hands for the practiced part
  const handStates = useMemo(() => (b ? computeHandStates(b.exercise.events) : []), [b]);
  const curIdx = s ? (mode === 'wait' ? Math.max(0, s.currentIndex()) : cursorIdx) : 0;
  const targetPitches = score ? score.notes.filter((n) => targets.has(n.track)).map((n) => n.midi + tr) : [];
  const lo = targetPitches.length ? Math.max(21, Math.floor((Math.min(...targetPitches) - 3) / 12) * 12) : 48;
  const hi = targetPitches.length ? Math.min(108, Math.ceil((Math.max(...targetPitches) + 3) / 12) * 12) : 84;
  const marks = new Map<number, KeyMark>();
  const curEv = s && b && s.state === 'LISTENING' && mode === 'wait' ? b.exercise.events[s.currentIndex()] : undefined;
  curEv?.pitches.forEach((p) => marks.set(p, 'target'));
  held.forEach((v, k) => marks.set(k, v));

  const pianoLike = !!score?.parts.some((p) => p.staves > 1);
  const roles = score?.tracks.filter((t) => t.role) ?? [];
  const pick = (keys: string[]) => setTargets(new Set(keys));
  const same = (keys: string[]) => keys.length === targets.size && keys.every((k) => targets.has(k));
  const staffKeys = (n: number) => score?.tracks.filter((t) => t.staff === n).map((t) => t.key) ?? [];
  const measOpts = score?.measures.map((m, i) => <option key={i} value={i}>{i + 1}{m.number !== String(i + 1) ? ` (bar ${m.number})` : ''}</option>);
  const input = sing ? 'Voice' : midiIn.devices.length ? 'MIDI' : mic.active ? 'Microphone' : 'Touch / keys';

  if (!score) {
    return (
      <div className="page">
        <section className="head-row">
          <div className="id-card"><span className="avatar"><Icon name="doc" size={22} /></span><div><small>MusicXML practice</small><b>My Music</b></div></div>
          <div className="metrics"><Metric label="Open a score to begin" value="Play it, sing it, get every note checked" big /></div>
        </section>
        <div className="drop card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
          <Icon name="doc" size={40} stroke={1.4} />
          <h2>Open your sheet music</h2>
          <p className="muted">MusicXML from MuseScore, Sibelius, Finale, Dorico, Noteflight and others: <b>.musicxml</b>, <b>.xml</b> or compressed <b>.mxl</b>. Drop a file here or choose one.</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn dark" onClick={() => fileIn.current?.click()}><Icon name="plus" size={15} /> Open MusicXML</button>
            <button className="btn" onClick={() => load(demoChoraleXml(), false)}>Try the SATB demo chorale</button>
          </div>
          {err && <p className="small tip">{err}</p>}
          <input ref={fileIn} type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </div>
        <SongShelf onOpen={(id) => load(songXml(id), false)} />
        {lib.length > 0 && (
          <div className="card">
            <div className="card-head"><b>Your library</b><span className="muted small">Saved on this device</span></div>
            <div className="lib">{lib.map((it) => (
              <div key={it.id} className="lib-row">
                <button className="link-row" onClick={() => load(it.xml, false)}><Icon name="note" size={15} /> <b>{it.title}</b> <span className="muted">{it.composer}</span></button>
                <button className="btn" onClick={() => deleteScore(it.id).then(() => listScores().then(setLib))} aria-label={`Remove ${it.title}`}>Remove</button>
              </div>))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <section className="head-row">
        <div className="id-card"><span className="avatar"><Icon name="doc" size={22} /></span><div><small>{score.composer || 'Imported score'}</small><b>{score.title}</b></div></div>
        <div className="metrics">
          <Metric label="Parts / voices" value={`${score.parts.length} / ${score.tracks.length}`} />
          <Metric label="Measures" value={score.measures.length} />
          <Metric label="Tempo" value={tempos.length > 1 ? `${Math.round(Math.min(...tempos) * tempoPct / 100)}–${Math.round(Math.max(...tempos) * tempoPct / 100)}` : Math.round(bpm)} unit={tempos.length > 1 ? 'bpm, changes' : 'bpm'} />
          <Metric label="Time" value={`${score.timeSig[0]}/${score.timeSig[1]}`} />
          <Metric label={tr ? `Key (written ${keyName(score.keyFifths)})` : 'Key'} value={tr ? transposedKey(score.keyFifths, tr) : keyName(score.keyFifths)} />
        </div>
      </section>
      <div className="chip-row">
        <button className="chip" onClick={() => fileIn.current?.click()}><Icon name="plus" size={13} /> Open another</button>
        <button className="chip" onClick={() => load(demoChoraleXml(), false)}>Demo chorale</button>
        <select className="chip chip-select" value="" onChange={(e) => { if (e.target.value) load(songXml(e.target.value), false); }} aria-label="Open a song">
          <option value="">Songs…</option>{SONGS.map((sg) => <option key={sg.id} value={sg.id}>{sg.title}</option>)}
        </select>
        {lib.slice(0, 4).map((it) => <button key={it.id} className="chip" onClick={() => load(it.xml, false)}><Icon name="note" size={12} /> {it.title}</button>)}
        <button className="chip" onClick={() => { stop(); setScore(null); }}>Library</button>
        <input ref={fileIn} type="file" accept=".musicxml,.xml,.mxl" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </div>
      {(err || score.warnings.length > 0) && <p className="small tip">{err || score.warnings.join(' ')}</p>}
      <section className="play-grid">
        <div className="stage">
          <div className="card score-card">
            <div className="card-head">
              <b>Score</b>
              <span className="legend"><i className="lg correct" />correct <i className="lg partial" />timing/tuning <i className="lg wrong" />wrong</span>
              <div className="zoom"><button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">+</button></div>
            </div>
            <ScoreView ref={view} xml={score.xml} zoom={zoom} transpose={tr} onError={setErr} />
            {feed[0] && !report && <div key={feed[0].id} className={`latest fb ${feed[0].kind}`}><span className="ic">{icon(feed[0].kind)}</span>{feed[0].text}</div>}
          </div>
          {sing ? (
            <div className="card roll-card">
              <div className="card-head"><b>Your voice</b><span className="muted small">Line = you, bars = your part</span></div>
              <PitchRoll octaveFree
                hold={() => (session.current && mode === 'wait' && session.current.state === 'LISTENING' ? build.current?.exercise.events[session.current.currentIndex()]?.pitches[0] ?? null : null)}
                targets={() => { const c = clock.current, bb = build.current; return c && bb && mode === 'timed' ? bb.exercise.events.map((e) => ({ midi: e.pitches[0], startMs: c.t0 + c.tl.msAt(bb.startQ + e.beat), endMs: c.t0 + c.tl.msAt(bb.startQ + e.beat + e.beats) - 40 })) : []; }} />
            </div>
          ) : (
            <div className="card keys-card">
              <Piano lo={lo} hi={hi} marks={marks} labels={settings.labels} height={170} below={settings.hands && b ? PALM_SPACE : 0} scrollTo={curEv?.pitches[0] ?? targetPitches[0]}
                overlay={settings.hands && b ? (g) => <HandsOverlay g={g} states={handStates} index={curIdx} showActive={!!s && s.state === 'LISTENING'} /> : undefined} />
            </div>
          )}
        </div>
        <aside className="side">
          <div className="card">
            <div className="card-head"><b>Your part</b><span className="muted small">Scored</span></div>
            <div className="row wrap">
              {pianoLike && <>
                <button className={`chip ${same(staffKeys(1)) ? 'on' : ''}`} onClick={() => pick(score.tracks.filter((t) => t.staff === 1).map((t) => t.key))}>Right hand</button>
                <button className={`chip ${same(staffKeys(2)) ? 'on' : ''}`} onClick={() => pick(score.tracks.filter((t) => t.staff === 2).map((t) => t.key))}>Left hand</button>
                <button className={`chip ${targets.size === score.tracks.length ? 'on' : ''}`} onClick={() => pick(score.tracks.map((t) => t.key))}>Both hands</button>
              </>}
              {roles.map((t) => <button key={t.key} className={`chip ${targets.size === 1 && targets.has(t.key) ? 'on' : ''}`} onClick={() => pick([t.key])}><i className="role-dot" style={{ background: ROLE_COLOR[t.role!] }} />{t.name}</button>)}
            </div>
            <div className="seg" style={{ marginTop: 10 }}>
              <button className={!sing ? 'on' : ''} onClick={() => setSing(false)}><Icon name="piano" size={13} /> Play</button>
              <button className={sing ? 'on' : ''} onClick={() => setSing(true)}><Icon name="mic" size={13} /> Sing</button>
            </div>
            <div className="seg" style={{ marginTop: 8 }}>
              <button className={mode === 'wait' ? 'on' : ''} onClick={() => setMode('wait')}>Waits for me</button>
              <button className={mode === 'timed' ? 'on' : ''} onClick={() => setMode('timed')}>Keeps time</button>
            </div>
            <label className="check"><input type="checkbox" checked={accomp} onChange={(e) => setAccomp(e.target.checked)} /> Other parts play along</label>
            <div className="seg small-seg">
              <button className={!speakers ? 'on' : ''} onClick={() => setSettings({ outputMode: 'headphones' })}>Headphones</button>
              <button className={speakers ? 'on' : ''} onClick={() => setSettings({ outputMode: 'speakers' })}>Speakers</button>
            </div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{speakers ? 'Speakers: the microphone ignores the notes the app plays, and the play-along is a little quieter so your own playing stands out.' : 'Headphones: the play-along goes to your ears only.'}</p>
            <label className="check"><input type="checkbox" checked={followTempo} onChange={(e) => setFollowTempo(e.target.checked)} disabled={run !== 'idle'} /> Follow tempo changes in the score{tempos.length > 1 ? ` (${tempos.length} marks)` : ''}</label>
          </div>
          <div className="card mixer">
            <div className="card-head"><b>Mixer</b><span className="muted small">mute · solo · volume</span></div>
            {score.tracks.map((t) => {
              const m: Mix = mix[t.key] ?? { mute: false, solo: false, vol: 0.8, inst: 'piano' };
              const set = (p: Partial<Mix>) => setMix((x) => ({ ...x, [t.key]: { ...m, ...p } }));
              return (
                <div key={t.key} className={`mix-row ${targets.has(t.key) ? 'mine' : ''}`}>
                  <i className="role-dot" style={{ background: t.role ? ROLE_COLOR[t.role] : '#8a8984' }} />
                  <span className="mix-name" title={`${t.partName}, staff ${t.staff}, voice ${t.voice}`}>{t.name}{targets.has(t.key) && <small> · you</small>}
                    <select className="inst" value={m.inst} onChange={(e) => set({ inst: e.target.value as Instrument })} aria-label={`Sound for ${t.name}`}>{INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
                  </span>
                  <button className={`mini ${m.mute ? 'on' : ''}`} onClick={() => set({ mute: !m.mute })} aria-label={`Mute ${t.name}`}>M</button>
                  <button className={`mini ${m.solo ? 'on' : ''}`} onClick={() => set({ solo: !m.solo })} aria-label={`Solo ${t.name}`}>S</button>
                  <input type="range" min={0} max={1} step={0.05} value={m.vol} onChange={(e) => set({ vol: +e.target.value })} aria-label={`${t.name} volume`} />
                </div>
              );
            })}
            <div className="mix-row groove-row">
              <i className="role-dot" style={{ background: '#1f1f1d' }} />
              <span className="mix-name">Groove (drums)
                <select className="inst" value={groove} onChange={(e) => setGroove(e.target.value as Groove)} aria-label="Groove style">
                  <option value="none">Off</option><option value="soft">Soft beat</option><option value="waltz">Waltz</option><option value="gentle6">Lilt (6/8)</option>
                </select>
              </span>
              <span />
              <span />
              <input type="range" min={0} max={1} step={0.05} value={grooveVol} onChange={(e) => setGrooveVol(+e.target.value)} aria-label="Groove volume" />
            </div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Choose a sound for each part: the other instruments play along with you in Listen and in "Keeps time" practice. The groove plays in time modes only.</p>
          </div>
          {report
            ? <ReportCard r={report} onRetry={practice} mastered={false} required={1} passes={report.passed ? 1 : 0} />
            : <div className="card feed" aria-live="polite">
                <div className="card-head"><b>Teacher</b><span className={`state-pill ${(s?.state ?? 'ready').toLowerCase()}`}>{run === 'listen' ? 'PLAYING' : (s?.state ?? 'READY').replace('_', '-')}</span></div>
                {feed.length === 0 && <p className="muted small">Choose your part, then press <b>Practice</b>. In "Waits for me" the score stops on each note until you play it on your keyboard (MIDI, microphone or touch), then moves on and the other parts answer. "Listen" plays the whole score.</p>}
                {feed.slice(1).map((f) => <div key={f.id} className={`fb ${f.kind}`}><span className="ic">{icon(f.kind)}</span>{f.text}</div>)}
              </div>}
        </aside>
      </section>
      <div className="dock">
        <button className={`dock-btn lime ${run === 'practice' ? 'live' : ''}`} onClick={run === 'practice' ? stop : practice} disabled={!targets.size} aria-label={run === 'practice' ? 'Stop practicing' : 'Practice'}><Icon name={run === 'practice' ? 'pause' : 'play'} size={18} /></button>
        <span className="dock-label">{run === 'practice' ? 'Stop' : 'Practice'}</span>
        <button className={`dock-btn ${run === 'listen' ? 'on' : ''}`} onClick={run === 'listen' ? stop : listen} aria-label={run === 'listen' ? 'Stop playback' : 'Listen'}><Icon name={run === 'listen' ? 'pause' : 'wave'} size={17} /></button>
        <span className="dock-label">{run === 'listen' ? 'Stop' : 'Listen'}</span>
        <span className="dock-sep" />
        <div className="dock-group">
          {[50, 75, 100].map((p) => <button key={p} className={`dock-chip ${tempoPct === p ? 'on' : ''}`} disabled={run !== 'idle'} onClick={() => setTempoPct(p)}>{p}%</button>)}
          <input className="dock-range" type="range" min={20} max={150} step={5} value={tempoPct} disabled={run !== 'idle'} onChange={(e) => setTempoPct(+e.target.value)} aria-label="Tempo percent" />
          <span className="dock-label">{Math.round(bpm)} bpm</span>
        </div>
        <span className="dock-sep" />
        <span className="dock-label">Bars</span>
        <select className="dock-select" value={from} disabled={run !== 'idle'} onChange={(e) => { const v = +e.target.value; setFrom(v); if (to < v) setTo(v); }} aria-label="From measure">{measOpts}</select>
        <span className="dock-label">to</span>
        <select className="dock-select" value={to} disabled={run !== 'idle'} onChange={(e) => { const v = +e.target.value; setTo(v); if (from > v) setFrom(v); }} aria-label="To measure">{measOpts}</select>
        <span className="dock-sep" />
        <span className="dock-label">Key</span>
        <button className="dock-btn sm" disabled={run !== 'idle' || tr <= -12} onClick={() => setTr(tr - 1)} aria-label="Transpose down a semitone">−</button>
        <span className="dock-label keylabel" title="Transpose for playback, practice and the notation">{tr === 0 ? 'Written' : `${tr > 0 ? '+' : ''}${tr} · ${transposedKey(score.keyFifths, tr).replace(' major', '')}`}</span>
        <button className="dock-btn sm" disabled={run !== 'idle' || tr >= 12} onClick={() => setTr(tr + 1)} aria-label="Transpose up a semitone">+</button>
        <span className="dock-sep" />
        <button className={`dock-btn ${loop ? 'on' : ''}`} onClick={() => setLoop(!loop)} aria-label="Loop"><Icon name="restart" size={16} /></button>
        <span className="dock-label">Loop</span>
        <button className={`dock-btn ${metro ? 'on' : ''}`} onClick={() => setMetro(!metro)} aria-label="Metronome"><Icon name="metro" size={16} /></button>
        <span className="dock-label">Click</span>
        <span className="dock-fill" />
        <span className="dock-status"><Icon name={sing || input === 'Microphone' ? 'mic' : input === 'MIDI' ? 'midi' : 'keys'} size={15} /> Input: {input}</span>
      </div>
    </div>
  );
}

const INST_ICON: Partial<Record<Instrument, string>> = { violin: 'Violin', viola: 'Viola', cello: 'Cello', flute: 'Flute', strings: 'Strings', bass: 'Bass', choir: 'Choir' };
export function SongShelf({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="card">
      <div className="card-head"><b>Songs with play-along</b><span className="muted small">Public-domain pieces, arranged for this app</span></div>
      <div className="song-grid">
        {SONGS.map((sg) => (
          <button key={sg.id} className="song-card" onClick={() => onOpen(sg.id)}>
            <span className={`lvl ${sg.level.toLowerCase()}`}>{sg.level}</span>
            <b>{sg.title}</b>
            <small className="muted">{sg.composer}</small>
            <span className="small">{sg.about}</span>
            <span className="inst-tags">
              <i>Piano RH + LH</i>{Object.values(sg.colors).map((c) => <i key={c}>{INST_ICON[c!] ?? c}</i>)}{sg.groove !== 'none' && <i>Groove</i>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
