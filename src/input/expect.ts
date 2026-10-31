// Score-informed hints: the notes the current lesson expects right now.
// The polyphonic microphone detector uses them as a prior (like Simply Piano-style apps do);
// they never mark anything correct by themselves: the audio must still contain the notes.
let current: number[] | null = null;
export function setExpected(p: number[] | null) { current = p && p.length ? [...p] : null; }
export function getExpected(): number[] | null { return current; }
