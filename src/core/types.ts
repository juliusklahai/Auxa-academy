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
  fingers?: number[];     // suggested fingering, parallel to pitches
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
  voice?: boolean;        // sung exercise (microphone, voice mode)
  octaveFree?: boolean;   // accept the right note in any octave (men singing treble-clef melodies)
  centsTolerance?: number;// intonation tolerance for sung notes (default 30)
}

export interface TeachStep {
  title: string;
  body: string;
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
