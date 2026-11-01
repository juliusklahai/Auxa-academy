# Technical limitations and compatibility (Phase 1)

## Honest limits

- **Acoustic piano chords are detected, with honest limits.** `src/input/poly.ts` finds two or more simultaneous notes. Tests on synthesized piano chords pass for pairs, triads, sevenths, octaves and C3 + C4-E4-G4 when the lesson's notes are known (score-informed). In free play, with nothing expected, dense chords that double a note an octave apart can lose the upper note; those results are only displayed, never scored. Real pianos, rooms and phone microphones vary, so the Setup page has a live readout and a strictness slider. Unexpected notes need stronger evidence than expected ones, and a note that sits on an overtone of another note is downgraded to "unclear" so it is never a confirmed mistake. MIDI remains the most precise input.
- **Notes still ringing** are ignored by comparing the spectrum just before each onset, so a held note is not counted twice. Re-striking the same key is detected from its new attack.
- **Fingering is not detected.** Finger numbers are shown as guidance only.
- **Dynamics are not scored.** Shown as "not measured" with weight redistributed. MIDI velocity is captured for future use.
- **Note duration is scored only when note-off is known** (MIDI, on-screen, computer keyboard). Microphone attempts redistribute that weight.
- **Piano sound is synthesized**, not sampled. It is clear and pitch-accurate but not a concert grand. A sampled instrument can be dropped into `audio/engine.ts`.
- **Microphone timing** is compensated by a user-set latency (tap test in Settings). Speaker bleed is reduced by muting detection while the app plays; headphones are best.
- **Very low notes** (below about C2) are hard to separate by microphone with an ~85 ms window. Lessons stay above C3 for now.
- **Progress is per device** (localStorage). Export is available in Settings; cloud sync arrives with the Phase 3 backend.
- **Imported scores**: tempo changes are followed (sound tempo marks and metronome marks, including mid-measure), and you can switch that off. Gradual changes written only as words (rit., accel.) without a metronome or sound mark are not timed. Transposition (up or down 12 semitones) applies to the notation, playback, practice targets and keyboard. Timewise MusicXML is rejected with a clear message. Percussion and grace notes are shown but not scored.
- **Microphone with play-along through speakers**: the app knows exactly which notes it plays, so the detector removes them first and never reports them (echo gate), and the play-along is quieter in Speakers mode. If the play-along plays the very same note you are expected to play at the same moment, the app cannot tell the two apart; headphones remain the most reliable.
- **Bluetooth earphones**: while a microphone is open, many earphones switch to a low-quality "headset" mode that sounds crackly. The app closes the microphone while you only Listen, and Setup lets you choose the built-in microphone instead.
- **Play-along instruments** are synthesized (no downloaded samples), so violin, cello and flute sound clean but simpler than recordings. Copyrighted songs are not included; open licensed MusicXML of any song in My Music and it gets the same play-along.
- **Not yet built**: lesson grand staff (Levels 2+), challenges, adaptive tutor, placement test. They are shown on the roadmap, never as fake screens.

## Browser support

| Feature | Chrome / Edge (desktop) | Firefox (desktop) | Safari macOS | iOS / iPadOS | Android Chrome |
|---|---|---|---|---|---|
| App, sound, notation | Yes | Yes | Yes | Yes | Yes |
| Microphone | Yes | Yes | Yes | Yes | Yes |
| Web MIDI | Yes | Yes (108+) | No | No | Yes (USB OTG) |
| Install as app (PWA) | Yes | No | Yes (Add to Dock) | Add to Home Screen | Yes |
| Offline single file | Yes | Yes | Yes | Limited | Yes |

Mic and MIDI require a secure context: `https://`, `http://localhost`, or (in Chromium) a local file.

## Test coverage

`npm test` runs 77 tests: polyphonic detection on synthesized piano chords (including wrong-note-in-chord, held notes, repeated notes, onset timing and noise),: note math, YIN on synthesized harmonic tones (C3 to C6, with noise, intonation in cents), low confidence for noise, onset de-duplication, spec tests 1, 2, 3 (including chord grouping), 4, 7, 8, 9, 10, rubric redistribution and spaced repetition. Hardware tests (real piano, real MIDI keyboard, real singing, latency measurement) must be run manually; use Settings for live verification.

## 3D hands
- The hand model is procedurally generated from anatomical measurements, not sculpted by an artist. The renderer only needs a skinned mesh with the same 17-bone layout, so a professionally sculpted rigged GLB can replace `handData.ts` later without touching the IK, fingering or animation code.
- Seen straight from above, a thumb passing under the hand is (correctly) hidden by the palm; its finger number label still shows where it plays.
- Fingering suggestions follow standard teaching rules; unusual passages may need a learner correction in the Hands panel.
