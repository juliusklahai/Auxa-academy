// Pure timing math shared by metronome, playback and the evaluator so they use ONE timebase.

/** Milliseconds per beat at a given BPM. */
export const msPerBeat = (bpm: number) => 60000 / bpm;

/** Effective BPM after the practice tempo factor (20%..150%). */
export function effectiveBpm(writtenBpm: number, factorPct: number): number {
  const f = Math.min(150, Math.max(20, factorPct));
  return (writtenBpm * f) / 100;
}

/** Expected onset (ms after exercise start, i.e. after count-in) for a beat position. */
export function beatToMs(beat: number, bpm: number): number {
  return beat * msPerBeat(bpm);
}

/** Times (ms) of count-in clicks preceding beat 0. */
export function countInTimes(beatsPerBar: number, bpm: number): number[] {
  const d = msPerBeat(bpm);
  return Array.from({ length: beatsPerBar }, (_, i) => -(beatsPerBar - i) * d);
}

/** Metronome click schedule within [fromMs, toMs) with accent on bar downbeats. */
export function metronomeClicks(
  fromMs: number,
  toMs: number,
  bpm: number,
  beatsPerBar: number,
  subdivision = 1
): { time: number; accent: boolean; sub: boolean }[] {
  const step = msPerBeat(bpm) / subdivision;
  const out: { time: number; accent: boolean; sub: boolean }[] = [];
  const first = Math.ceil(fromMs / step - 1e-9) + 0; // +0 normalizes -0
  for (let i = first; i * step < toMs; i++) {
    const isBeat = i % subdivision === 0;
    const beatIdx = Math.floor(i / subdivision);
    out.push({ time: i * step + 0, accent: isBeat && ((beatIdx % beatsPerBar) + beatsPerBar) % beatsPerBar === 0, sub: !isBeat });
  }
  return out;
}

/** Swing: an off-beat eighth (x.5) is played at x + 2/3, the long-short jazz feel. Other positions are unchanged. */
export function swingBeat(beat: number): number {
  const w = Math.floor(beat + 1e-9), f = beat - w;
  return Math.abs(f - 0.5) < 1e-6 ? w + 2 / 3 : beat;
}
/** Beat position as heard: swung when the exercise swings. */
export const feelBeat = (beat: number, swing?: boolean) => (swing ? swingBeat(beat) : beat);
