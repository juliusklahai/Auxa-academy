// The Android app's low-latency piano for MIDI keyboards. When a keyboard is connected, the phone loads
// the chosen piano sound itself and plays every key straight from the MIDI driver, so the sound no longer
// waits for the web page and its audio buffer. Lesson playback (the band, the metronome) stays in the page.
import { native, onNativePiano } from '../native/bridge';
import { audio } from './engine';
import { loadBank, rootsOf, soundDef } from './samples';
import { midiIn } from '../input/midi';

let active = false;
let want = true;
let loadedFor = '';
export const nativePianoAvailable = () => !!native?.pianoSetup;
export const nativePianoActive = () => active;

onNativePiano((ok) => { active = ok; listeners.forEach((f) => f()); });
const listeners = new Set<() => void>();
export function onNativePianoChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); }

/** Load (or reload) the native piano for the current sound and level, if a keyboard is connected. */
export async function syncNativePiano() {
  if (!native?.pianoSetup) return;
  const def = soundDef(audio.pianoSound);
  if (!want || !midiIn.devices.length || !def || def.sustain) {
    if (active) { native.pianoDisable?.(); active = false; loadedFor = ''; listeners.forEach((f) => f()); }
    return;
  }
  try {
    const bank = await loadBank(audio.ensure(), def.id);
    // the same loudness the page would use for this sound, so switching paths is seamless
    const gain = bank.norm * def.gain * 0.62;
    const key = `${def.id}`;
    const json = JSON.stringify({ id: def.id, layers: def.layers, roots: rootsOf(def), release: def.release, gain, volume: audio.liveLevel });
    if (key !== loadedFor || !active) { loadedFor = key; native.pianoSetup(json); }
    else native.pianoVolume?.(audio.liveLevel);
  } catch { /* the page keeps playing the sound */ }
}

export function setNativePianoWanted(on: boolean) { want = on; void syncNativePiano(); }

if (native?.pianoSetup) {
  midiIn.onDevicesChanged = () => void syncNativePiano();
  audio.onMix = () => { if (active) native?.pianoVolume?.(audio.liveLevel); };
}

/** Numbers for the latency check. */
export function nativePianoStatus(): Record<string, number | boolean | string> | null {
  try { return native?.pianoStatus ? JSON.parse(native.pianoStatus()) : null; } catch { return null; }
}
