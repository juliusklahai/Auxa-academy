// Each level's certificate has its own short theme: a tune the learner played in that level, arranged
// for a small orchestra (violin or flute melody, string chords, cello bass, choir on the final chord),
// about 12 seconds, always ending on the home chord.
import { LESSONS } from '../curriculum/lessons';
import { harmonize } from '../compose/harmony';
import { detectKey, type Melody, type MelodyNote } from '../compose/transcribe';
import { audio, type Instrument } from './engine';

const BPM = 96;
const BAR = 4;
const BARS = 4; // + one bar for the final chord: 5 bars at 96 bpm = 12.5 s

/** How singable a 4-bar line is: mostly steps, a few different notes, a comfortable range, not one note. */
function singable(ns: MelodyNote[]): number {
  const p = ns.filter((n) => n.midi !== null).map((n) => n.midi!);
  if (p.length < 5) return -99;
  const steps = p.slice(1).map((m, i) => Math.abs(m - p[i]));
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  const range = Math.max(...p) - Math.min(...p);
  const same = steps.filter((d) => d === 0).length / steps.length;
  const leaps = steps.filter((d) => d > 7).length / steps.length;
  const distinct = new Set(p.map((m) => m % 12)).size;
  return Math.min(distinct, 7) * 1.2 + Math.min(p.length, 14) * 0.25 - Math.abs(mean - 2) * 1.4 - same * 5 - leaps * 8
    - (range < 4 ? 4 : range > 15 ? 3 : 0) - (Math.min(...p) < 55 ? 3 : 0);
}

/** The tune: the most singable melody among the level's exercises (right hand, first four bars). */
export function levelTune(level: number): MelodyNote[] | null {
  const lessons = LESSONS.filter((l) => l.level === level && (l.track ?? 'piano') === 'piano');
  let best: MelodyNote[] | null = null, bestScore = -Infinity;
  for (const l of lessons) for (const e of l.exercises) {
    if (e.drill || e.voice || !e.events?.length) continue;
    // the right-hand line: the top note of right-hand (or unassigned) moments
    const rh = e.events.filter((ev) => ev.hand !== 'LH');
    const top = rh.map((ev) => ({ midi: ev.pitches.length ? Math.max(...ev.pitches) : null, beat: ev.beat, beats: ev.beats }));
    const cut = top.filter((n) => n.beat < BARS * BAR).map((n) => ({ ...n, beats: Math.min(n.beats, BARS * BAR - n.beat) }));
    const sc = singable(cut);
    if (sc > bestScore) { bestScore = sc; best = cut; }
  }
  return bestScore > -50 ? best : null;
}

export function levelTheme(level: number): Melody | null {
  const tune = levelTune(level);
  if (!tune) return null;
  const key = detectKey(tune.filter((n) => n.midi !== null).map((n) => ({ midi: n.midi, beats: n.beats })));
  // finish on the home note, held for a whole bar
  // the home note nearest to where the tune stopped
  const last = [...tune].reverse().find((n) => n.midi !== null)!.midi!;
  let home = key.tonic + 12 * Math.floor(last / 12);
  if (home - last > 6) home -= 12;
  if (last - home > 6) home += 12;
  const notes = [...tune, { midi: home, beat: BARS * BAR, beats: BAR }];
  return { notes, bpm: BPM, timeSig: [4, 4], key, bars: BARS + 1 };
}

let stopAt = 0;
/** Play a level's theme; returns its length in seconds (0 if there is none). */
export function playLevelTheme(level: number): number {
  const m = levelTheme(level);
  if (!m) return 0;
  const ctx = audio.ensure();
  const h = harmonize(m, 'pad');
  const spb = 60 / m.bpm;
  const t0 = ctx.currentTime + 0.25;
  const lead: Instrument = level % 2 ? 'flute' : 'violin';
  const end = m.bars * BAR * spb;
  const play = (n: MelodyNote, inst: Instrument, vel: number, shift = 0, legato = 1.02) => {
    if (n.midi === null) return;
    audio.scheduleNote(n.midi + shift, t0 + n.beat * spb, n.beats * spb * legato, vel, true, inst);
  };
  const [S, A, T, B] = h.voices;
  S.notes.forEach((n) => play(n, lead, 0.62));
  // strings: alto and tenor as held chords, swelling into the last bar
  for (const v of [A, T]) v.notes.forEach((n) => play(n, 'strings', n.beat >= BARS * BAR ? 0.42 : 0.3, 0, 1.08));
  // cello: the bass line an octave down where it fits
  B.notes.forEach((n) => play(n, 'cello', 0.44, n.midi !== null && n.midi - 12 >= 36 ? -12 : 0, 1.05));
  // choir joins on the final chord
  for (const v of [S, A, T]) v.notes.filter((n) => n.beat >= BARS * BAR).forEach((n) => play(n, 'choir', 0.3, 0, 1.2));
  stopAt = performance.now() + (end + 1.2) * 1000;
  return end + 1;
}

export function stopLevelTheme() { if (performance.now() < stopAt) { audio.stopAll(); stopAt = 0; } }
