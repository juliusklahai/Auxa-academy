// Voice coach: reads instructions aloud when a lesson step opens, then the example plays (like a teacher
// sitting next to you). Uses the phone's text-to-speech in the Android app, the browser's elsewhere.
import { native } from '../native/bridge';
import { getSettings } from './settings';

let seq = 0;
const waiting = new Map<string, () => void>();
if (typeof window !== 'undefined') {
  (window.__maestroNative ??= {}).onSpeechDone = (id: string) => { const f = waiting.get(id); waiting.delete(id); f?.(); };
}

function bestVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (!vs.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|enhanced|premium/i.test(v.name) ? 6 : 0) + (/google/i.test(v.name) ? 4 : 0) + (/samantha|aria|jenny|guy|daniel|serena/i.test(v.name) ? 3 : 0) +
    (v.lang === 'en-US' ? 2 : v.lang === 'en-GB' ? 1.5 : 0) + (v.localService ? 0.5 : 0);
  return [...vs].sort((a, b) => score(b) - score(a))[0];
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => { /* voices load lazily */ };

/** Is the coach voice on? */
export const coachOn = () => getSettings().coachVoice !== false;

/** Clean text for speaking: no symbols that read badly. */
export function speakable(t: string): string {
  return t.replace(/[–—]/g, ', ').replace(/\s*·\s*/g, ', ').replace(/\b([A-G])b(\d?)\b/g, '$1 flat$2').replace(/\b([A-G])#/g, '$1 sharp')
    .replace(/\bbpm\b/gi, 'beats per minute').replace(/\s+/g, ' ').trim();
}

/** Say something. Resolves when it has been spoken (or straight away if the voice is off/unavailable). */
export function say(text: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && !coachOn()) return Promise.resolve();
  const line = speakable(text);
  if (!line) return Promise.resolve();
  stopSpeaking();
  const n = native;
  if (n?.speak) {
    const id = `s${++seq}`;
    return new Promise((res) => { waiting.set(id, res); n.speak!(line, id, 1); setTimeout(() => { if (waiting.delete(id)) res(); }, 40 + line.length * 120); });
  }
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(line);
    const v = bestVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1; u.pitch = 1;
    let done = false;
    const end = () => { if (!done) { done = true; res(); } };
    u.onend = end; u.onerror = end;
    setTimeout(end, 40 + line.length * 120); // never wait forever
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  waiting.forEach((f) => f()); waiting.clear();
  native?.stopSpeaking?.();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
