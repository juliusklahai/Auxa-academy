// Data contracts between modules (curriculum, input, assessment, progress, UI).

export type InputSource = 'midi' | 'mic' | 'screen' | 'computer-keyboard';
export type Hand = 'RH' | 'LH';
export type Clef = 'treble' | 'bass';
export type SkillId =
  | 'keyboardGeography'
  | 'noteReadingTreble'
  | 'noteReadingBass'
  | 'pitchAccuracy'
  | 'rhythm'
  | 'pulse'
  | 'fingerTechnique';

/** One assessable moment in the score: a single note, or a chord (several pitches at once). */
export interface ScoreEvent {
  pitches: number[];      // MIDI numbers; empty = rest
  beat: number;           // start position in beats from exercise start (0-based)
  beats: number;          // written duration in beats
  hand?: Hand;
  fingers?: number[];     // suggested fingering, parallel to pitches (0 = none)
  hands?: Hand[];         // per-pitch hand when one event has notes for both hands
  /** written length per hand when both hands start together with different note values (drawing only) */
  handBeats?: Partial<Record<Hand, number>>;
  /** pitches you have to work out yourself: hidden on the staff until you play them (complete the voicing) */
  hidden?: number[];
}

export type AssessMode = 'wait' | 'timed';

export interface Exercise {
  id: string;
  title: string;
  objective: string;
  clef: Clef;
  mode: AssessMode;       // wait = wait-for-correct-note; timed = rhythmic performance test
  tempo: number;          // written BPM
  timeSig: [number, number];
  events: ScoreEvent[];
  skills: SkillId[];
  passScore: number;      // 0..100, default 80
  maxConsecutiveMistakes: number; // default 3
  requiredPasses: number; // successful attempts needed for mastery (foundational skills need >1)
  inputs: InputSource[];  // supported input methods
  timingToleranceMs?: number;
  hideLabels?: boolean;   // remove key-name scaffolding
  /** play by ear: noteheads stay hidden until you find each note; listen first */
  byEar?: boolean;
  /** swing feel: off-beat eighths land two thirds through the beat (written straight, as in jazz charts) */
  swing?: boolean;
  /** spell black keys as flats on the staff (blues, jazz, flat keys) */
  flats?: boolean;
  /** ear-training drill instead of reading a score (see DrillSpec) */
  drill?: DrillSpec;
  /** chords played before a by-ear phrase so you hear the key first */
  context?: number[][];
  voice?: boolean;        // sung exercise (microphone, voice mode)
  octaveFree?: boolean;   // accept the right note in any octave (men singing treble-clef melodies)
  centsTolerance?: number;// intonation tolerance for sung notes (default 30)
  /** Play-along: notes the APP plays around the learner's notes (melody notes you don't play, chords, bass). */
  backing?: BackNote[];
  /** show treble and bass staves together (hands together) */
  grand?: boolean;
  /** sung notes this many semitones away still count as the target (gentle singing levels) */
  pitchSlack?: number;
  /** in wait mode, move on after this many tries on one note (encouraging levels) */
  autoAdvanceAfter?: number;
  /** wrong notes are hints only and never restart the attempt */
  gentle?: boolean;
  /** sung notes must be within this many cents to count (strict levels) */
  strictCents?: number;
}

/** A note the app plays as accompaniment in a play-along exercise. */
export interface BackNote {
  midi: number;
  beat: number;
  beats: number;
  hand?: Hand;
  /** melody notes are drawn on the staff in grey; accompaniment is only heard */
  line?: 'melody' | 'accomp';
  vel?: number;
}

export interface TeachStep {
  title: string;
  body: string;
  /** short points shown as a list under the text */
  tips?: string[];
  /** a passage to hear: chords (or single notes) one after another */
  seq?: number[][];
  /** beats per item in seq (default 1 for notes, 2 for chords) and tempo */
  seqBeats?: number;
  /** A/B listening: hear the wrong way and the right way */
  compare?: { label: string; seq: number[][] }[];
  /** Notes to highlight/play for SEE IT and HEAR IT. */
  show?: number[];
  play?: number[];
  sequential?: boolean;
}

export interface Lesson {
  id: string;
  level: number;
  track?: 'piano' | 'voice';
  title: string;
  summary: string;
  prerequisites: string[]; // lesson ids
  teach: TeachStep[];
  exercises: Exercise[];
}

/** A note the learner performed (never one the app played). */
export interface PerformedNote {
  midi: number;
  time: number;           // ms, exercise timebase (0 = first beat of exercise)
  source: InputSource;
  confidence: number;     // 0..1 (MIDI/screen = 1)
  velocity?: number;
  durationMs?: number;    // filled when note-off is known
  cents?: number;         // intonation (voice input)
}

export type NoteStatus = 'pending' | 'correct' | 'partial' | 'wrong' | 'missed';

export interface EventResult {
  index: number;
  status: NoteStatus;
  playedPitches: number[];
  wrongPitches: number[];
  onsetDeviationMs?: number;
  durationRatio?: number;
  attempts: number;
}

export type AssessState = 'READY' | 'COUNT_IN' | 'LISTENING' | 'EVALUATING' | 'FEEDBACK' | 'COMPLETED' | 'RESTART';

export interface RubricComponent {
  key: 'pitch' | 'rhythm' | 'duration' | 'continuity' | 'dynamics';
  label: string;
  weight: number;         // nominal weight
  measured: boolean;
  score: number;          // 0..1 (ignored when !measured)
  effectiveWeight: number;// after redistribution
}

export interface AssessmentReport {
  exerciseId: string;
  score: number;          // 0..100
  grade: string;
  passed: boolean;
  components: RubricComponent[];
  correct: number;
  partial: number;
  wrong: number;
  missed: number;
  extra: number;
  uncertainIgnored: number;
  problemEvents: number[];
  advice: string[];
  hadThreeConsecutive: boolean;
}

/**
 * Ear-training drills. Each round plays something and you answer by tapping a choice or playing it on
 * the keys. Context (a cadence in the key) is played first when the answer depends on the key.
 * - tonic: a phrase in a random key, find the home note
 * - degree: the key, then one note: which scale degree (do re mi...)
 * - interval: two notes, name the distance
 * - quality: one chord, name its type
 * - progression: four chords in a key, name each one (I ii iii IV V vi...)
 * - bass: four chords, play their bass notes (roots)
 */
export type DrillKind = 'tonic' | 'degree' | 'interval' | 'quality' | 'progression' | 'bass' | 'count' | 'tempo' | 'meter' | 'roadmap';
export interface DrillSpec {
  kind: DrillKind;
  /** answers that can come up: degrees '1'..'7' (and 'b3','b7'...), intervals 'm2'..'P8', qualities 'maj','min','dim','aug','maj7','m7','7','m7b5','dim7', progressions like 'I-V-vi-IV' */
  pool: string[];
  rounds?: number;
  /** tonics (midi) to use; default a few comfortable keys */
  keys?: number[];
  mode?: 'major' | 'minor';
  /** interval style */
  style?: 'up' | 'down' | 'together' | 'mixed';
}
