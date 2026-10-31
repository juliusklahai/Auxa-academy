# Maestro architecture

## Principles

1. **Learning systems first, UI second.** Music math, detection, assessment and progression are pure TypeScript with no DOM, so they are unit-tested and reusable by future native clients.
2. **One timebase.** Metronome clicks, playback and the evaluator all derive onsets from `audio/timing.ts` (`beatToMs`, `metronomeClicks`). Learner input timestamps use `performance.now()` relative to the same exercise start (`t0`).
3. **Learner input is separate from app output.** Only `input/bus.ts` feeds the assessor, and the app's own playback never goes through it. The microphone is muted while the app sounds notes (plus a 600 ms tail).
4. **Never invent precision.** Low-confidence detections are "uncertain", not mistakes. Unmeasurable rubric criteria are redistributed, not assumed. Fingering is suggested, never inferred from audio.
5. **Offline by default.** No network calls. Notation, synthesis and detection all run locally.

## Modules (the 14 from the spec) and status

| # | Module | Location | Phase 1 status |
|---|---|---|---|
| 1 | Curriculum engine | `curriculum/`, `progress/` | Built: lessons, prerequisites, unlock rules |
| 2 | Exercise generation | `curriculum/lessons.ts` (`seq`) | Built: declarative builder. Adaptive generation in Phase 5 |
| 3 | MusicXML import | `musicxml/parse.ts`, `musicxml/practice.ts`, `musicxml/library.ts` | Built: partwise .musicxml/.xml/.mxl, ties, chords, voices, repeats + endings, tempo, lyrics |
| 4 | Notation renderer | `ui/Staff.tsx` (VexFlow, lessons), `ui/ScoreView.tsx` (OpenSheetMusicDisplay, imported scores) | Built: colored results, cursor, auto-scroll |
| 5 | Audio playback and scheduling | `audio/engine.ts`, `audio/metronome.ts` | Built |
| 6 | MIDI input | `input/midi.ts` | Built |
| 7 | Microphone analysis | `input/mic.ts`, `input/poly.ts`, `input/pitch.ts` | Built: polyphonic piano, monophonic voice |
| 8 | Pitch and chord recognition | `input/poly.ts`, `input/expect.ts`, chord matching in `assessment/session.ts` | Built: chords from MIDI, screen and microphone |
| 9 | Performance assessment | `assessment/session.ts` | Built |
| 10 | Adaptive tutoring | advice in report, `progress` competencies and reviews | Basic; full tutor Phase 5 |
| 11 | Vocal practice | `ui/VoiceStudio.tsx`, `ui/PitchRoll.tsx`, voice lessons | Built: pitch matching, range, pitch curve, 4 lessons, intonation scoring |
| 12 | SATB mixing | `ui/MyMusic.tsx`, `audio/engine.ts` scheduler | Built: part detection, mute/solo/volume, sing or play one part against the others |
| 13 | Progress tracking | `progress/store.ts` | Built (local) |
| 14 | UI and accounts | `ui/` | UI built; accounts with backend in Phase 3 |

## Data contracts (`src/core/types.ts`)

- `ScoreEvent { pitches[], beat, beats, hand?, fingers? }`: one assessable moment (note, chord or rest).
- `Exercise { id, objective, clef, mode: 'wait'|'timed', tempo, timeSig, events, skills, passScore, maxConsecutiveMistakes, requiredPasses, inputs, timingToleranceMs?, hideLabels? }`
- `Lesson { id, level, prerequisites, teach: TeachStep[], exercises }`
- `PerformedNote { midi, time, source, confidence, velocity?, durationMs? }`: only what the learner played.
- `AssessmentReport { score, grade, passed, components[], correct, partial, wrong, missed, extra, uncertainIgnored, problemEvents, advice, hadThreeConsecutive }`

## Assessment state machine

```
READY -> (timed) COUNT_IN -> LISTENING -> EVALUATING -> COMPLETED
      -> (wait)  LISTENING ---------------^
LISTENING -> RESTART (3rd consecutive confirmed mistake) -> restart() -> READY
```

Matching rules:
- **Wait mode**: the cursor waits for the expected pitch set. Chord notes may arrive in any order. Wrong notes within 120 ms while a chord is expected form one attempt.
- **Timed mode**: each performed note is matched to the nearest open event within a window (min(half a beat, 350 ms)). Right pitch inside 30% of a beat (max 160 ms) is green, otherwise amber. Wrong pitch inside a window is a mistake. Notes outside every window are "extra". Events whose window passes are "missed".
- A correct event resets the consecutive-mistake counter. Uncertain input never changes it.

## Chord detection (microphone, piano mode)

1. **Onsets**: log-magnitude spectral flux on the latest 2048 samples every ~20 ms, adaptive threshold, 70 ms refractory period.
2. **New energy**: about 95 ms after an onset, the 8192-point spectrum of the last 4096 samples minus the spectrum from just before the onset. Notes already ringing cancel out.
3. **Multi-pitch estimation**: harmonic-sum salience with piano inharmonicity, using true spectral peaks only. The strongest note is taken, its partials are subtracted (keeping any excess that belongs to an overlapping note such as an octave) and the search repeats, up to 6 notes.
4. **Score-informed check**: the lesson publishes its expected notes (`input/expect.ts`). Expected notes get a small prior; any expected note the greedy pass missed is checked by a joint non-negative least-squares fit of harmonic templates. Unexpected notes need stronger evidence, and an unexpected note on an overtone of a detected note is downgraded to uncertain.
5. Confidence combines absolute evidence with strength relative to the loudest new note. Below the strictness threshold, a note is "unclear" and is never counted as a mistake.

## Voice pitch detection

YIN (cumulative mean normalized difference, threshold 0.15, parabolic interpolation) on 2048-sample frames every ~23 ms. Confidence = 1 minus aperiodicity. `OnsetTracker` emits a note only after 3 stable confident frames, once per sustained tone, and re-arms on silence, a pitch change or a fresh attack.

## Future backend schema (PostgreSQL, Phase 3)

Phase 1 stores progress in `localStorage` (`maestro.progress.v1`), matching this schema so sync is a straight upload.

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz default now()
);
create table learner_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  goals text[], weekly_minutes int, instrument text, notation_pref text,
  placement_level int, settings jsonb default '{}'
);
create table exercise_attempts (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  exercise_id text not null,
  started_at timestamptz not null,
  input_source text not null check (input_source in ('midi','mic','screen','computer-keyboard')),
  tempo_bpm numeric not null,
  score numeric(5,2) not null,
  passed boolean not null,
  components jsonb not null,      -- {pitch: 92, rhythm: null, ...}
  note_events jsonb,              -- per-event expected/detected/onset/deviation/confidence
  client_id uuid unique            -- idempotent offline sync
);
create index on exercise_attempts (user_id, exercise_id, started_at desc);
create table exercise_mastery (
  user_id uuid references users(id) on delete cascade,
  exercise_id text,
  best numeric(5,2), passes int default 0, leitner_box int default 0, review_due timestamptz,
  primary key (user_id, exercise_id)
);
create table practice_days (
  user_id uuid references users(id) on delete cascade,
  day date, seconds int default 0,
  primary key (user_id, day)
);
create table scores (            -- uploaded MusicXML (Phase 3), file in object storage
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text, composer text, storage_key text not null,
  parts jsonb, key_sig text, time_sig text, difficulty numeric,
  created_at timestamptz default now()
);
```
