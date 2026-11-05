// Assessment engine: explicit state machine, wait-for-note and timed modes,
// three-consecutive-mistake rule, chord-attempt grouping, uncertain-input handling,
// and a transparent rubric with redistribution of unmeasurable criteria.
// Pure TypeScript: no DOM, no audio. Driven by the UI; tested in tests/assessment.test.ts.

import { midiToName } from '../core/music';
import type {
  AssessState, AssessmentReport, EventResult, Exercise, PerformedNote, RubricComponent,
} from '../core/types';
import { beatToMs, msPerBeat } from '../audio/timing';

export const CONFIDENCE_THRESHOLD = 0.85;
const CHORD_WINDOW_MS = 120;

export type FeedbackKind = 'correct' | 'partial' | 'wrong' | 'uncertain' | 'extra' | 'progress' | 'restart' | 'ignored';
export interface Feedback { kind: FeedbackKind; message: string; eventIndex?: number }

export function gradeFor(score: number): string {
  if (score >= 95) return 'Excellent';
  if (score >= 90) return 'Very good';
  if (score >= 80) return 'Passed';
  if (score >= 60) return 'Needs more practice';
  return 'Repeat guided learning';
}

export const RUBRIC_WEIGHTS = { pitch: 40, rhythm: 25, duration: 15, continuity: 10, dynamics: 10 } as const;

/** Combine component scores; weights of unmeasured components are redistributed proportionally. */
export function combineRubric(parts: Omit<RubricComponent, 'effectiveWeight'>[]): { score: number; components: RubricComponent[] } {
  const measuredTotal = parts.filter((p) => p.measured).reduce((s, p) => s + p.weight, 0);
  const components = parts.map((p) => ({ ...p, effectiveWeight: p.measured && measuredTotal > 0 ? (p.weight / measuredTotal) * 100 : 0 }));
  const score = components.reduce((s, c) => s + (c.measured ? c.score * c.effectiveWeight : 0), 0);
  return { score: Math.round(score * 10) / 10, components };
}

interface Internal extends EventResult {
  expectedMs: number;
  played: Set<number>;
  firstOnset?: number;
  lastWrongAt?: number;
  completedAt?: number;
  wrongAttempts: number;
}

export class AssessmentSession {
  state: AssessState = 'READY';
  attempt = 1;
  consecutive = 0;
  cursor = 0;
  extras = 0;
  uncertain = 0;
  hadThreeConsecutive = false;
  report: AssessmentReport | null = null;
  readonly bpm: number;
  private events: Internal[] = [];
  private confusions = new Map<string, number>();
  private lastCompletionAt = 0;
  private hesitations = 0;
  private lastMistakeAttemptAt = -Infinity;

  /** timeOf: ms of a beat position (for scores with tempo changes); defaults to a constant tempo. */
  constructor(public exercise: Exercise, bpm?: number, private timeOf?: (beat: number) => number) {
    this.bpm = bpm ?? exercise.tempo;
    this.resetEvents();
  }

  get mspb() { return msPerBeat(this.bpm); }
  get window() { return this.exercise.timingToleranceMs ?? Math.min(this.mspb * 0.5, 350); }
  get goodMs() { return Math.min(70, this.mspb * 0.12); }
  get okMs() { return Math.min(160, this.mspb * 0.3); }

  results(): EventResult[] {
    return this.events.map(({ index, status, playedPitches, wrongPitches, onsetDeviationMs, durationRatio, attempts }) =>
      ({ index, status, playedPitches, wrongPitches, onsetDeviationMs, durationRatio, attempts }));
  }

  /** Index of the event the learner should play next (wait mode) or -1. */
  currentIndex(): number {
    return this.exercise.mode === 'wait' && this.cursor < this.events.length ? this.cursor : -1;
  }

  private resetEvents() {
    this.events = this.exercise.events.map((e, index) => ({
      index, status: e.pitches.length ? 'pending' : 'correct', playedPitches: [], wrongPitches: [], attempts: 0,
      expectedMs: this.timeOf ? this.timeOf(e.beat) : beatToMs(e.beat, this.bpm), played: new Set<number>(), wrongAttempts: 0,
    }));
    this.cursor = 0;
    this.skipRests();
    this.consecutive = 0;
    this.extras = 0;
    this.uncertain = 0;
    this.hesitations = 0;
    this.confusions.clear();
    this.lastCompletionAt = 0;
    this.lastMistakeAttemptAt = -Infinity;
  }

  private skipRests() {
    while (this.cursor < this.events.length && this.exercise.events[this.cursor].pitches.length === 0) this.cursor++;
  }

  /** READY -> COUNT_IN (timed) or LISTENING (wait). */
  begin() {
    if (this.state === 'COMPLETED') return;
    this.state = this.exercise.mode === 'timed' ? 'COUNT_IN' : 'LISTENING';
  }

  /** COUNT_IN -> LISTENING. */
  listen() {
    if (this.state === 'COUNT_IN' || this.state === 'READY') this.state = 'LISTENING';
  }

  /** Feed one note the LEARNER performed. App playback must never be routed here. */
  input(n: PerformedNote): Feedback {
    if (this.state !== 'LISTENING') return { kind: 'ignored', message: '' };
    if (n.confidence < CONFIDENCE_THRESHOLD) {
      this.uncertain++;
      return { kind: 'uncertain', message: 'I could not hear that clearly, so it was not scored. Try again a little louder, or use MIDI.' };
    }
    if (this.exercise.octaveFree) n = { ...n, midi: this.foldOctave(n) };
    if (this.exercise.pitchSlack) n = this.slack(n);
    if (this.exercise.strictCents !== undefined && n.cents !== undefined && Math.abs(n.cents) > this.exercise.strictCents && this.candidates(n).includes(n.midi)) return this.outOfTune(n);
    return this.exercise.mode === 'wait' ? this.inputWait(n) : this.inputTimed(n);
  }

  private candidates(n: PerformedNote): number[] {
    return this.exercise.mode === 'wait'
      ? this.exercise.events[this.cursor]?.pitches ?? []
      : this.events.filter((e) => Math.abs(n.time - e.expectedMs) <= this.window).flatMap((e) => this.exercise.events[e.index].pitches);
  }

  /** Gentle singing levels: a note close enough to the target counts as the target (with its real tuning). */
  private slack(n: PerformedNote): PerformedNote {
    const k = this.exercise.pitchSlack ?? 0;
    const cands = this.candidates(n);
    if (!cands.length || cands.includes(n.midi)) return n;
    const dist = (p: number) => { const d = (((n.midi - p) % 12) + 12) % 12; return this.exercise.octaveFree ? Math.min(d, 12 - d) : Math.abs(n.midi - p); };
    const best = cands.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (dist(best) > k) return n;
    const signed = this.exercise.octaveFree ? ((((n.midi - best) % 12) + 18) % 12) - 6 : n.midi - best;
    return { ...n, midi: best, cents: (n.cents ?? 0) + signed * 100 };
  }

  /** Strict (pro) singing: the right note sung out of tune does not count yet. */
  private outOfTune(n: PerformedNote): Feedback {
    const evIdx = this.exercise.mode === 'wait' ? this.cursor : this.events.filter((e) => Math.abs(n.time - e.expectedMs) <= this.window).sort((a, b) => Math.abs(n.time - a.expectedMs) - Math.abs(n.time - b.expectedMs))[0]?.index ?? this.cursor;
    const ev = this.events[evIdx];
    const c = Math.round(n.cents ?? 0);
    const msg = `${midiToName(n.midi)} is the right note but ${Math.abs(c)} cents ${c > 0 ? 'sharp: release a little, lighter breath' : 'flat: lift the pitch, more breath support'}. Pro level needs ±${this.exercise.strictCents} cents.`;
    if (!ev) return { kind: 'wrong', message: msg };
    ev.wrongAttempts++;
    this.consecutive++;
    if (this.consecutive >= this.exercise.maxConsecutiveMistakes) {
      this.hadThreeConsecutive = true;
      this.state = 'RESTART';
      return { kind: 'restart', message: `${msg} ${this.exercise.maxConsecutiveMistakes} in a row, so this attempt restarts.`, eventIndex: ev.index };
    }
    return { kind: 'wrong', message: msg, eventIndex: ev.index };
  }

  /** For singers: move the sung note into the octave of the nearest expected note with the same name. */
  private foldOctave(n: PerformedNote): number {
    const cands = this.exercise.mode === 'wait'
      ? this.exercise.events[this.cursor]?.pitches ?? []
      : this.events.filter((e) => Math.abs(n.time - e.expectedMs) <= this.window).flatMap((e) => this.exercise.events[e.index].pitches);
    const same = cands.filter((p) => ((p - n.midi) % 12 + 12) % 12 === 0);
    return same.length ? same.reduce((a, b) => (Math.abs(b - n.midi) < Math.abs(a - n.midi) ? b : a)) : n.midi;
  }

  private tuning(n: PerformedNote): string | null {
    const tol = this.exercise.centsTolerance ?? 30;
    if (n.cents === undefined || Math.abs(n.cents) <= tol) return null;
    return `${Math.abs(n.cents)} cents ${n.cents > 0 ? 'sharp' : 'flat'}`;
  }

  private inputWait(n: PerformedNote): Feedback {
    const ev = this.events[this.cursor];
    if (!ev) return { kind: 'ignored', message: '' };
    const target = this.exercise.events[this.cursor].pitches;
    if (n.time - this.lastCompletionAt > 4000 && this.cursor > 0 && ev.played.size === 0 && ev.wrongAttempts === 0) this.hesitations++;
    if (target.includes(n.midi)) {
      ev.played.add(n.midi);
      ev.firstOnset ??= n.time;
      if (target.every((p) => ev.played.has(p))) {
        const off = this.tuning(n);
        ev.status = ev.wrongAttempts === 0 && !off ? 'correct' : 'partial';
        if (off) { ev.playedPitches = [...ev.played]; ev.attempts = ev.wrongAttempts + 1; ev.completedAt = n.time; this.lastCompletionAt = n.time; this.consecutive = 0; this.cursor++; this.skipRests();
          if (this.cursor >= this.events.length) this.finish();
          return { kind: 'partial', message: `Right note (${target.map(midiToName).join(' + ')}) but ${off}. Listen again and center the pitch.`, eventIndex: ev.index }; }
        ev.playedPitches = [...ev.played];
        ev.attempts = ev.wrongAttempts + 1;
        ev.completedAt = n.time;
        this.lastCompletionAt = n.time;
        this.consecutive = 0;
        this.cursor++;
        this.skipRests();
        if (this.cursor >= this.events.length) { this.finish(); return { kind: 'correct', message: 'Exercise complete.', eventIndex: ev.index }; }
        return { kind: ev.status === 'correct' ? 'correct' : 'partial', message: ev.status === 'correct' ? `Correct: ${target.map(midiToName).join(' + ')}` : `Correct now: ${target.map(midiToName).join(' + ')}. It took ${ev.attempts} tries.`, eventIndex: ev.index };
      }
      return { kind: 'progress', message: `${midiToName(n.midi)} is part of the chord. Keep going.`, eventIndex: ev.index };
    }
    return this.registerMistake(ev, target, n);
  }

  private inputTimed(n: PerformedNote): Feedback {
    const w = this.window;
    const open = this.events.filter((e) => this.exercise.events[e.index].pitches.length && (e.status === 'pending' || e.status === 'wrong') && e.completedAt === undefined && Math.abs(n.time - e.expectedMs) <= w);
    if (!open.length) {
      this.extras++;
      return { kind: 'extra', message: `Extra note ${midiToName(n.midi)} where no note was written.` };
    }
    const matching = open.filter((e) => this.exercise.events[e.index].pitches.includes(n.midi) && !e.played.has(n.midi));
    if (matching.length) {
      const ev = matching.reduce((a, b) => (Math.abs(n.time - a.expectedMs) <= Math.abs(n.time - b.expectedMs) ? a : b));
      const target = this.exercise.events[ev.index].pitches;
      ev.played.add(n.midi);
      if (ev.firstOnset === undefined) { ev.firstOnset = n.time; ev.onsetDeviationMs = Math.round(n.time - ev.expectedMs); }
      if (target.every((p) => ev.played.has(p))) {
        const dev = Math.abs(ev.onsetDeviationMs ?? 0);
        const off = this.tuning(n);
        ev.status = dev <= this.okMs && ev.wrongPitches.length === 0 && !off ? 'correct' : 'partial';
        if (off && ev.status === 'partial' && dev <= this.okMs && !ev.wrongPitches.length) { ev.attempts = 1; ev.completedAt = n.time; ev.playedPitches = [...ev.played]; this.consecutive = 0; this.checkDone(); return { kind: 'partial', message: `Right note, on time, but ${off}.`, eventIndex: ev.index }; }
        ev.playedPitches = [...ev.played];
        ev.attempts = 1;
        ev.completedAt = n.time;
        this.consecutive = 0;
        this.checkDone();
        if (ev.status === 'correct') return { kind: 'correct', message: `${target.map(midiToName).join(' + ')} on time.`, eventIndex: ev.index };
        const d = ev.onsetDeviationMs ?? 0;
        return { kind: 'partial', message: ev.wrongPitches.length ? 'Right notes, but there were extra wrong notes in the chord.' : `Right note, but ${Math.abs(d)} ms ${d < 0 ? 'early' : 'late'}.`, eventIndex: ev.index };
      }
      return { kind: 'progress', message: '', eventIndex: ev.index };
    }
    const ev = open.reduce((a, b) => (Math.abs(n.time - a.expectedMs) <= Math.abs(n.time - b.expectedMs) ? a : b));
    return this.registerMistake(ev, this.exercise.events[ev.index].pitches, n);
  }

  private registerMistake(ev: Internal, target: number[], n: PerformedNote): Feedback {
    ev.wrongPitches.push(n.midi);
    // Notes struck together while a chord is expected form ONE attempt (not several mistakes).
    const sameChordAttempt = target.length > 1 && n.time - this.lastMistakeAttemptAt <= CHORD_WINDOW_MS;
    this.lastMistakeAttemptAt = n.time;
    if (this.exercise.mode === 'timed' && ev.status === 'pending') ev.status = 'wrong';
    if (sameChordAttempt) return { kind: 'wrong', message: `${midiToName(n.midi)} is not in the chord.`, eventIndex: ev.index };
    ev.wrongAttempts++;
    const key = `${midiToName(target[0]).replace(/-?\d+$/, '')}>${midiToName(n.midi).replace(/-?\d+$/, '')}`;
    this.confusions.set(key, (this.confusions.get(key) ?? 0) + 1);
    if (this.exercise.gentle) return this.gentleFeedback(ev, target, n);
    this.consecutive++;
    return this.mistakeFeedback(ev, target, n.midi);
  }

  /** Encouraging levels: a miss is only a hint; after a few tries the exercise moves on. */
  private gentleFeedback(ev: Internal, target: number[], n: PerformedNote): Feedback {
    const t = target.reduce((a, b) => (Math.abs(b - n.midi) < Math.abs(a - n.midi) ? b : a));
    let diff = n.midi - t;
    if (this.exercise.octaveFree) diff = ((((diff % 12) + 18) % 12) - 6);
    const dir = diff > 0 ? 'a little lower' : 'a little higher';
    const far = Math.abs(diff) > 4 ? (diff > 0 ? 'quite a bit lower' : 'quite a bit higher') : dir;
    const after = this.exercise.autoAdvanceAfter;
    if (this.exercise.mode === 'wait' && after && ev.wrongAttempts >= after) {
      ev.status = 'partial';
      ev.playedPitches = [...ev.played, n.midi];
      ev.attempts = ev.wrongAttempts;
      ev.completedAt = n.time;
      this.lastCompletionAt = n.time;
      this.cursor++;
      this.skipRests();
      if (this.cursor >= this.events.length) this.finish();
      return { kind: 'partial', message: `Good effort! Let's keep going. (That one was ${target.map(midiToName).join(' + ')}; it comes back later.)`, eventIndex: ev.index };
    }
    const words = ['Close!', 'Nearly there!', 'Keep going!'];
    return { kind: 'wrong', message: `${words[ev.wrongAttempts % words.length]} Try ${far}${this.exercise.voice ? ': listen, hum it, then sing' : ''}.`, eventIndex: ev.index };
  }

  private mistakeFeedback(ev: Internal, target: number[], played: number): Feedback {
    const max = this.exercise.maxConsecutiveMistakes;
    if (this.consecutive >= max) {
      this.hadThreeConsecutive = true;
      this.state = 'RESTART';
      return { kind: 'restart', message: `${max} mistakes in a row, so this attempt restarts. Listen to the demo once more, then go slowly. Your lesson progress is safe.`, eventIndex: ev.index };
    }
    const t = target.reduce((a, b) => (Math.abs(b - played) < Math.abs(a - played) ? b : a));
    const diff = played - t;
    const tName = target.map(midiToName).join(' + ');
    let explain: string;
    if (target.length > 1) explain = `${midiToName(played)} is not in this chord (${tName}). The nearest chord note is ${midiToName(t)}, ${Math.abs(diff)} key${Math.abs(diff) > 1 ? 's' : ''} ${diff > 0 ? 'to the left (lower)' : 'to the right (higher)'}.`;
    else if (diff % 12 === 0) explain = `You found the right letter name but in the wrong octave. ${tName} is ${diff > 0 ? 'lower' : 'higher'}, ${Math.abs(diff / 12)} octave${Math.abs(diff) > 12 ? 's' : ''} ${diff > 0 ? 'down' : 'up'}.`;
    else explain = `You played ${midiToName(played)}; the target is ${tName}, ${Math.abs(diff)} key${Math.abs(diff) > 1 ? 's' : ''} ${diff > 0 ? 'to the left (lower)' : 'to the right (higher)'}.`;
    if (this.consecutive === 1) return { kind: 'wrong', message: explain, eventIndex: ev.index };
    const hint = this.hintFor(t);
    return { kind: 'wrong', message: `Second miss in a row. ${explain} Hint: ${hint}`, eventIndex: ev.index };
  }

  private hintFor(midi: number): string {
    const pc = midi % 12;
    const hints: Record<number, string> = {
      0: 'C sits just left of each group of TWO black keys.',
      2: 'D sits in the middle of the two black keys.',
      4: 'E sits just right of the two black keys.',
      5: 'F sits just left of each group of THREE black keys.',
      7: 'G is the first gap inside the three black keys.',
      9: 'A is the second gap inside the three black keys.',
      11: 'B sits just right of the three black keys.',
    };
    return hints[pc] ?? 'Black keys take the name of the white key next to them plus sharp (#) or flat (b).';
  }

  /** Timed mode: mark events whose window has passed as missed. Call regularly with current exercise time. */
  tick(nowMs: number): Feedback | null {
    if (this.state !== 'LISTENING' || this.exercise.mode !== 'timed') return null;
    let fb: Feedback | null = null;
    for (const ev of this.events) {
      if (this.exercise.events[ev.index].pitches.length === 0 || ev.completedAt !== undefined) continue;
      if (nowMs <= ev.expectedMs + this.window) continue;
      ev.completedAt = nowMs;
      ev.playedPitches = [...ev.played];
      if (ev.status === 'wrong') continue; // already counted as a mistake when the wrong note was played
      if (ev.status !== 'pending') continue;
      ev.status = ev.played.size ? 'partial' : 'missed';
      if (ev.status === 'missed') {
        this.consecutive++;
        fb = { kind: 'wrong', message: `Missed ${this.exercise.events[ev.index].pitches.map(midiToName).join(' + ')} (measure ${this.measureOf(ev.index)}).`, eventIndex: ev.index };
        if (this.consecutive >= this.exercise.maxConsecutiveMistakes) {
          this.hadThreeConsecutive = true;
          this.state = 'RESTART';
          return { kind: 'restart', message: `${this.exercise.maxConsecutiveMistakes} mistakes in a row, so this attempt restarts. Try a slower tempo.`, eventIndex: ev.index };
        }
      }
    }
    const last = this.events[this.events.length - 1];
    if (last && nowMs > last.expectedMs + this.window) this.finish();
    return fb;
  }

  /** Note-off for duration scoring (MIDI and on-screen input only). */
  noteOff(midi: number, timeMs: number) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (ev.played.has(midi) && ev.firstOnset !== undefined && ev.durationRatio === undefined) {
        const written = this.exercise.events[i].beats * this.mspb;
        ev.durationRatio = (timeMs - ev.firstOnset) / written;
        return;
      }
    }
  }

  private checkDone() {
    if (this.events.every((e) => e.status === 'correct' || e.status === 'partial' || e.completedAt !== undefined || this.exercise.events[e.index].pitches.length === 0)) this.finish();
  }

  measureOf(i: number): number {
    return Math.floor(this.exercise.events[i].beat / this.exercise.timeSig[0]) + 1;
  }

  /** Restart only the current attempt (never the course). */
  restart() {
    this.attempt++;
    this.hadThreeConsecutive = false;
    this.report = null;
    this.resetEvents();
    this.state = 'READY';
  }

  finish(): AssessmentReport {
    if (this.report) return this.report;
    this.state = 'EVALUATING';
    const ex = this.exercise;
    const scored = this.events.filter((e) => ex.events[e.index].pitches.length > 0);
    const N = scored.length || 1;
    const timed = ex.mode === 'timed';

    const pitchCredit = scored.map((e) => {
      const target = ex.events[e.index].pitches;
      const allRight = target.every((p) => e.played.has(p));
      if (!allRight) return target.filter((p) => e.played.has(p)).length / target.length * 0.5;
      if (timed) return e.wrongPitches.length ? 0.6 : 1;
      return e.wrongAttempts === 0 ? 1 : e.wrongAttempts === 1 ? 0.6 : 0.3;
    });
    const pitch = pitchCredit.reduce((a, b) => a + b, 0) / N;

    const span = this.window - this.goodMs;
    const rhythmScores = scored.map((e) => {
      if (e.onsetDeviationMs === undefined) return 0;
      const d = Math.abs(e.onsetDeviationMs);
      return Math.max(0, Math.min(1, 1 - Math.max(0, d - this.goodMs) / span));
    });
    const rhythm = rhythmScores.reduce((a, b) => a + b, 0) / N;

    const withDur = scored.filter((e) => e.durationRatio !== undefined);
    const durationMeasured = timed && withDur.length >= Math.ceil(N / 2);
    const duration = durationMeasured
      ? withDur.reduce((s, e) => s + Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(e.durationRatio! - 0.95) - 0.15) / 0.6)), 0) / withDur.length
      : 0;

    const missed = scored.filter((e) => e.status === 'missed').length;
    const continuity = Math.max(0, 1 - (missed + this.extras * 0.5 + this.hesitations * 0.5) / N);

    const { score, components } = combineRubric([
      { key: 'pitch', label: 'Pitch accuracy', weight: RUBRIC_WEIGHTS.pitch, measured: true, score: pitch },
      { key: 'rhythm', label: 'Rhythm and onset', weight: RUBRIC_WEIGHTS.rhythm, measured: timed, score: rhythm },
      { key: 'duration', label: 'Note duration', weight: RUBRIC_WEIGHTS.duration, measured: durationMeasured, score: duration },
      { key: 'continuity', label: 'Continuity and fluency', weight: RUBRIC_WEIGHTS.continuity, measured: true, score: continuity },
      { key: 'dynamics', label: 'Dynamics and articulation', weight: RUBRIC_WEIGHTS.dynamics, measured: false, score: 0 },
    ]);

    const problemEvents = scored.filter((e) => e.status !== 'correct').map((e) => e.index);
    const advice: string[] = [];
    const devs = scored.map((e) => e.onsetDeviationMs).filter((d): d is number => d !== undefined);
    if (timed && devs.length >= 2) {
      const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
      if (mean > this.goodMs) advice.push(`You tend to play behind the beat (about ${Math.round(mean)} ms late). Count "1 and 2 and" aloud and play exactly on the numbers.`);
      else if (mean < -this.goodMs) advice.push(`You tend to rush ahead of the beat (about ${Math.round(-mean)} ms early). Let the click land first, then play with it.`);
    }
    const measures = [...new Set(problemEvents.map((i) => this.measureOf(i)))];
    if (measures.length) advice.push(`Focus on measure${measures.length > 1 ? 's' : ''} ${measures.join(', ')}. Loop ${measures.length > 1 ? 'them' : 'it'} at a slower tempo until clean.`);
    const worst = [...this.confusions.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] >= 2) { const [exp, got] = worst[0].split('>'); advice.push(`You played ${got} where ${exp} was written ${worst[1]} times. Revisit where ${exp} sits on the keyboard and the staff.`); }
    if (this.uncertain > 2) advice.push(`${this.uncertain} sounds were too unclear to score and were ignored. Move closer to the microphone or connect a MIDI keyboard.`);
    if (!advice.length && score >= 95) advice.push('Clean, accurate performance. Ready for the next step.');

    const passed = score >= ex.passScore && !this.hadThreeConsecutive;
    this.report = {
      exerciseId: ex.id, score, grade: gradeFor(score), passed, components,
      correct: scored.filter((e) => e.status === 'correct').length,
      partial: scored.filter((e) => e.status === 'partial').length,
      wrong: scored.filter((e) => e.status === 'wrong').length,
      missed, extra: this.extras, uncertainIgnored: this.uncertain, problemEvents, advice,
      hadThreeConsecutive: this.hadThreeConsecutive,
    };
    this.state = 'COMPLETED';
    return this.report;
  }
}
