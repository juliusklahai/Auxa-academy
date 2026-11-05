# Maestro Academy (Phase 1)

An interactive piano, music-reading and musicianship academy that listens to you play and teaches like a private teacher:
**see it, hear it, understand it, play it, get feedback, correct it, master it.**

Phase 1 is a working foundation: a real first-note-to-first-melody course with genuine input analysis, assessment and progression rules. Nothing is mocked.

## What works today

- **Interactive piano**: 25, 61 or 88 keys, correct key geometry, mouse, touch, computer keyboard, MIDI and acoustic piano (microphone). Letter, solfège or no labels. Finger numbers.
- **Piano sound** synthesized once per note into audio buffers (offline, no downloads): light enough to play four-part scores without crackling, with a limiter against clipping and a Smooth / Lowest-delay setting.
- **Standard notation** rendered with VexFlow (bundled, offline). Notes turn green (correct), amber (right pitch, needs work), red (wrong), grey (not yet played).
- **MIDI input** (Web MIDI): exact keys, note-on/off timing, chords, velocity, sustain.
- **Microphone for many instruments**: acoustic piano, digital/electric/stage piano, organ and harmonium, keyboards and synths (all with chords), single-note instruments (violin, flute, sax, trumpet, guitar melody) and voice. Choose the sound in Setup.
- **Microphone input, chords included**: acoustic piano mode hears two or more notes at once (intervals, triads, sevenths, octaves, both hands). It uses onset detection, a "new energy" spectrum that ignores notes still ringing, multi-pitch estimation with harmonic subtraction, and score-informed listening: it knows which notes the lesson expects and checks for them first, the way apps like Simply Piano do, but those notes still have to be in the sound. Voice mode tracks one sung note with cents. Unclear sounds are never scored as mistakes.
- **Play stage**: notation and keyboard together, a lime glow on the note to play, a teal moving line in timed mode, and a score strip that slides to the next measures as you finish the ones on screen.
- **3D virtual pianist**: two anatomical, semi-transparent 3D hands (Three.js) over the keyboard, with knuckles, nails and creases that bend with the fingers. Independent finger IK presses white and black keys at their real heights, passes the thumb under, crosses fingers over, plays chords, legato, staccato and repeated notes, and moves the hand ahead of time. Fingering comes from the MusicXML, a built-in fingering planner, or your own corrections. The Hands panel sets style (3D or line art), opacity (80% default), colour, line weight, left/right/both, and finger numbers. After a mistake, the correct finger turns orange and shows the press. In My Music both hands play the whole piano part (the other hand plays its accompaniment while you practice one), and they also play while you Listen.
- **47 lessons in 10 levels** (Beginner to Advanced) with 159 exercises, including play-along pieces where the band plays and you play only the notes you just learned.
- **Song library of 35 pieces**, graded Beginner, Easy, Intermediate and Advanced: public-domain classics plus original practice pieces.
- **Singing levels** from Easy (encouraging) to Pro coach (strict tuning).
- **Keyboard you can size or hide**: drag the bar above the keys to give the notes more room, pick Auto, 25, 37, 49, 61 or 88 keys (the hands scale with the keys), or hide the on-screen keyboard when you play on a MIDI keyboard or piano.
- **My Music (MusicXML)**: open .musicxml, .xml or compressed .mxl (MuseScore, Sibelius, Finale, Dorico...). Faithful notation (OpenSheetMusicDisplay, bundled offline), a personal library, Listen with a moving cursor, and **Practice**: choose right hand, left hand, both hands or any SATB voice. In "Waits for me" mode the score stops on each note until you play it on your MIDI keyboard, acoustic piano (mic) or screen, then moves on while the other parts answer. "Keeps time" mode follows the beat with a count-in and accompaniment. Every note turns green, amber or red on the score. Mixer with mute, solo and volume per part, bar range, loop, tempo 20-150%, click, **tempo changes followed**, **transpose ±12 semitones** (notation too), and a **Speakers mode** in which the microphone ignores the app's own play-along.
- **Play-along band for any score**: open any MusicXML and Maestro works out its chords bar by bar, then adds a strings pad, a bass line and an optional melody guide (each with its own sound and volume), plus an optional drum groove.
- **Full-screen practice**: when you press Start or Practice, only the score and the keyboard fill the screen. Teacher feedback and parts/mixer open as floating panels; Esc (or the Exit button) returns.
- **Voice Studio**: pitch matching with a live tuning meter, range finder with a suggested choir part, a live pitch curve of your voice against the target notes, four sight-singing lessons (any octave counts, intonation in cents), and "sing in a choir": sing your SATB part while the other voices play.
- **Assessment engine**: READY, COUNT_IN, LISTENING, EVALUATING, FEEDBACK, COMPLETED or RESTART. Wait-for-note mode and timed mode. Explained mistakes, a hint on the second, and a restart of the current attempt on the third consecutive confirmed mistake. A badly played chord counts as one attempt.
- **Transparent rubric**: pitch 40, rhythm 25, duration 15, continuity 10, dynamics 10. Anything that cannot be measured is shown as "not measured" and its weight is redistributed, never assumed correct.
- **80% mastery gate** plus repeated passes for foundational skills. Completed lessons stay open for review.
- **Technique (Level 2)**: right hand finger independence, thumb under (C scale), staccato and broken chords; left hand five-finger patterns, cross over (C scale), Alberti bass and waltz bass, with fingering shown by the guide hands.
- **Songs with play-along**: Twinkle Twinkle, Ode to Joy, Minuet in G, Für Elise (opening), Canon in D and Greensleeves, arranged for this app (public domain). Practice right hand, left hand or both while violin, cello, flute or strings play along, with an optional drum groove. Every part's sound can be changed in the mixer (piano, violin, viola, cello, flute, strings, bass, choir), for imported MusicXML too.
- **Curriculum**: Level 0 and Level 1, nine lessons and fifteen assessed exercises (middle C, black-key groups, musical alphabet, sharps, pulse, treble reading, note values, bass clef and left hand, Ode to Joy in two phrases, two-note intervals, and the C, F and G chords).
- **Metronome**: 20 to 300 BPM, accents, subdivisions, count-in, visual pulse, volume. Practice tempo 20% to 150% with presets.
- **Progress dashboard**: separate skill measures, streak, practice time, spaced-repetition reviews (1, 3, 7, 14, 30, 60 days).
- **Settings and calibration**: MIDI connect, mic test with live note and cents meter, background-noise measurement, tap latency test, A4 reference (415 to 466 Hz), high-contrast mode, supported (no-restart) practice mode.
- **Works offline**: as a single HTML file, or as an installable PWA with a service worker.
- **125 automated tests** covering the spec's acceptance tests 1, 2, 3, 4, 7, 8, 9 and 10, plus MusicXML import (ties, chords, voices, repeats with endings, pickups, .mxl), SATB part practice, chord detection on synthesized piano chords, singing (octaves, cents) and hand positions.
- **Tablet-first design**: a dark rounded frame, a title tab joined to the page by an S-curve, pill navigation, lime timeline nodes and a floating dark control dock. Works from tablet size up, and on phones.

## Run it in your IDE (VS Code, WebStorm, Cursor...)

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd maestro
npm install        # once, needs internet
npm run dev        # http://localhost:5173 with hot reload
npm test           # run the test suite
npm run build      # production PWA in dist/
npm run preview    # serve dist/ on localhost (installable, offline after first load)
npm run build:single   # ONE self-contained file: dist-single/index.html
```

### Fully offline use

- **Easiest**: open `dist-single/index.html` (a prebuilt copy is included as `Maestro.html`) by double-clicking it. Everything, including notation and sound, is inside that file.
- **Microphone and MIDI need a secure context.** Chrome and Edge usually allow them from a local file; if they are blocked, run `npm run preview` and use `http://localhost:4173`, which always counts as secure.
- **Install as an app**: open the `npm run preview` URL in Chrome or Edge and choose "Install Maestro" in the address bar. It then launches in its own window and works without internet.

## Quick user guide

1. **Home** shows your next lesson, skill profile and reviews due.
2. **Learn** opens a lesson. The *Learn* tab walks through the concept with notation, highlighted keys and sound. Press **Hear it**.
3. **Practice and assess**: press **Demo** to watch and listen (never scored), then **Start**. Play the highlighted key. Each note is checked instantly and every mistake is explained.
4. Score **80% or more** (sometimes twice) to unlock the next lesson.
5. **Piano Studio** is free play with a full metronome.
6. **Settings**: connect MIDI, or start the microphone, press *Measure background noise* and check that the live meter shows the note you play.

Computer keyboard: `A S D F G H J K L` are white keys from middle C, `W E T Y U O P` are black keys, `Z` and `X` shift the octave.

## Project layout

```
src/
  core/         music math (MIDI, names, frequency, cents) and data contracts
  audio/        synth engine, metronome scheduler, shared timing math
  input/        MIDI, microphone (poly.ts chords, pitch.ts voice), expect.ts hints, learner-input bus
  assessment/   state machine, matching, three-mistake rule, rubric, report
  curriculum/   Level 0 and 1 lessons and exercises
  progress/     mastery gate, persistence, competencies, spaced repetition
  musicxml/     importer (parse.ts), practice builder, library (IndexedDB), demo SATB chorale
  ui/           React views: overview, lessons, play stage, My Music, Voice Studio, piano, hands, pitch roll, studio, setup
tests/          Vitest suites mapped to the spec's acceptance tests
docs/           architecture, curriculum map, limitations and roadmap
```

See `docs/ARCHITECTURE.md`, `docs/CURRICULUM.md` and `docs/LIMITATIONS.md`.
