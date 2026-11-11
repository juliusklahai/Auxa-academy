// Voice coach: reads instructions aloud when a lesson step opens, then the example plays (like a teacher
// sitting next to you). Uses the phone's text-to-speech in the Android app, the browser's elsewhere.
import { native } from '../native/bridge';
import { getSettings } from './settings';

import { useEffect, useState } from 'react';

let seq = 0;
/** true once the device has shown it cannot speak (no English voice, or speech never starts) */
let silent = false;
const subs = new Set<() => void>();
const setSilent = (v: boolean) => { if (silent !== v) { silent = v; subs.forEach((f) => f()); } };
export function useCoachSilent() {
  const [v, setV] = useState(silent);
  useEffect(() => { const f = () => setV(silent); subs.add(f); return () => { subs.delete(f); }; }, []);
  return v;
}
// Phones only allow speech after the person has touched the page once: prime it on the first tap.
if (typeof document !== 'undefined' && typeof speechSynthesis !== 'undefined') {
  const prime = () => { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* fine */ } };
  document.addEventListener('pointerdown', prime, { once: true, capture: true });
}
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
/** Phones load their voices a moment after the page; wait for them (up to ~1.5 s). */
let voicesP: Promise<void> | null = null;
function voicesReady(): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  if (speechSynthesis.getVoices().length) return Promise.resolve();
  return (voicesP ??= new Promise((res) => {
    const done = () => res();
    speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  }));
}

/** Is the coach voice on? */
export const coachOn = () => getSettings().coachVoice !== false;

const ROMAN: Record<string, string> = { i: 'one', ii: 'two', iii: 'three', iv: 'four', v: 'five', vi: 'six', vii: 'seven' };
const QUAL: [RegExp, string][] = [
  [/^maj7$|^Δ7?$/, ' major seven'], [/^maj9$/, ' major nine'], [/^m7b5$|^ø7?$/, ' half diminished'], [/^m7$|^-7$/, ' minor seven'], [/^m9$/, ' minor nine'],
  [/^m6$/, ' minor six'], [/^m$/, ' minor'], [/^dim7$|^°7$/, ' diminished seven'], [/^dim$|^°$/, ' diminished'], [/^aug$|^\+$/, ' augmented'],
  [/^7b9$/, ' seven flat nine'], [/^7$/, ' seven'], [/^9$/, ' nine'], [/^13$/, ' thirteen'], [/^6$/, ' six'], [/^sus4$/, ' sus four'],
];
const letter = (l: string, acc?: string) => l + (acc === '#' || acc === '♯' ? ' sharp' : acc === 'b' || acc === '♭' ? ' flat' : '');

/** Roman numeral chord (IV, ii7, V7, vii°, bII7, I64) in words. */
function romanWords(tok: string): string | null {
  const m = /^(b|♭|#)?(vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(°|ø)?(maj7|7b9|7|64|6|9)?$/.exec(tok);
  if (!m) return null;
  const [, acc, num, dim, ext] = m;
  const word = ROMAN[num.toLowerCase()];
  const minor = num === num.toLowerCase() && num !== 'v' ? ' minor' : num === 'v' ? ' minor' : '';
  return `${acc ? (acc === '#' ? 'sharp ' : 'flat ') : ''}${word}${dim === '°' ? ' diminished' : dim === 'ø' ? ' half diminished' : ''}${!dim && minor && !ext ? '' : ''}${ext === 'maj7' ? ' major seven' : ext === '7b9' ? ' seven flat nine' : ext === '7' ? ' seven' : ext === '64' ? ' six four' : ext === '6' ? ' six' : ext === '9' ? ' nine' : ''}`;
}

/** Clean text for speaking: abbreviations in full, chords and numerals as words, no symbols that read badly. */
export function speakable(t: string): string {
  let x = ` ${t} `;
  // words and abbreviations
  x = x.replace(/\bRH\b/g, 'right hand').replace(/\bLH\b/g, 'left hand').replace(/\bSATB\b/g, 'soprano, alto, tenor and bass')
    .replace(/\bBPM\b|\bbpm\b/g, 'beats per minute').replace(/\bMIDI\b/g, 'midi').replace(/\bMusicXML\b/g, 'music X M L')
    .replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\bvs\.?\b/g, 'versus').replace(/&/g, ' and ')
    .replace(/\b(\d)\/4\b/g, (_m, n) => `${n} 4`).replace(/\b6\/8\b/g, 'six eight')
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, (_m, n: string) => ({ '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth', '6': 'sixth', '7': 'seventh', '8': 'eighth', '9': 'ninth' } as Record<string, string>)[n] ?? `${n}th`);
  // chord symbols: Dm7, Cmaj7, G7, Bb7, F#m, C/E
  x = x.replace(/\b([A-G])(#|b|♯|♭)?(maj7|maj9|m7b5|m7|m9|m6|dim7|dim|aug|7b9|sus4|m|7|9|13|6|°7|°|ø7|ø)(?=[\s,.;:!?)/–—-]|$)/g, (_m, l: string, a: string | undefined, q: string) => {
    const w = QUAL.find(([re]) => re.test(q));
    return letter(l, a) + (w ? w[1] : '');
  });
  x = x.replace(/\b([A-G])(#|b|♯|♭)?\/([A-G])(#|b|♯|♭)?\b/g, (_m, l, a, l2, a2) => `${letter(l, a)} over ${letter(l2, a2)}`);
  // note names with octave numbers (C4), sharps and flats (F#, Bb)
  x = x.replace(/\b([A-G])(#|b|♯|♭)?\d\b/g, (_m, l: string, a?: string) => letter(l, a));
  x = x.replace(/\b([A-G])(#|♯)(?=\W)/g, (_m, l) => `${l} sharp`).replace(/\b([A-G])(b|♭)(?=[\s,.;:!?)–—-]|$)/g, (_m, l) => `${l} flat`);
  // Roman numeral progressions: "I – IV – V – I", "ii–V–I", "V7", "vii°"
  x = x.replace(/(?<![A-Za-z])((?:b|♭|#)?(?:vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?)(?:\s*[–—-]\s*((?:b|♭|#)?(?:vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?))+(?![A-Za-z])/g, (seq) =>
    seq.split(/\s*[–—-]\s*/).map((tk) => romanWords(tk) ?? tk).join(', '));
  x = x.replace(/(?<![A-Za-z'])((?:b|♭)?(?:vii|iii|ii|iv|vi|VII|III|II|IV|VI|V)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?)(?![A-Za-z'])/g, (tk) => romanWords(tk) ?? tk);
  x = x.replace(/(?<![A-Za-z'])(I)(maj7|7|64|6)(?![A-Za-z'])/g, (tk) => romanWords(tk) ?? tk);
  // punctuation that reads badly
  x = x.replace(/[–—]/g, ', ').replace(/\s*·\s*/g, ', ').replace(/[()[\]{}"“”]/g, ' ').replace(/\s*:\s*/g, ', ').replace(/\s*\/\s*/g, ' or ')
    .replace(/\s*\|\s*/g, ', ').replace(/\+/g, ' and ').replace(/\.\.\./g, ',').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s+([,.!?])/g, '$1');
  x = x.replace(/\s+/g, ' ').replace(/\b([A-G](?: sharp| flat)?) \1\b/g, '$1'); // "middle C (C4)" -> "middle C"
  return x.replace(/\s+/g, ' ').trim();
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
  return voicesReady().then(() => new Promise<void>((res) => {
    const v = bestVoice();
    // no English voice on this device: stay quiet rather than read English with another language's voice
    if (!v) { setSilent(true); res(); return; }
    const u = new SpeechSynthesisUtterance(line);
    u.voice = v; u.lang = v.lang || 'en-US';
    u.rate = 0.98; u.pitch = 1.03;
    let done = false, started = false;
    const end = () => { if (!done) { done = true; res(); } };
    u.onstart = () => { started = true; setSilent(false); };
    u.onend = end; u.onerror = end;
    setTimeout(() => { if (!started && !done) { setSilent(true); end(); } }, 3000); // speech never began
    setTimeout(end, 40 + line.length * 120); // never wait forever
    speechSynthesis.speak(u);
  }));
}

/**
 * Try the voice right now, inside a tap (phones need that). Resolves true if speech started.
 */
export function testVoice(): Promise<boolean> {
  const n = native;
  if (n?.speak) { n.speak('Hello! I am your Maestro coach.', 'test', 1); return Promise.resolve(true); }
  if (typeof speechSynthesis === 'undefined') { setSilent(true); return Promise.resolve(false); }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Hello! I am your Maestro coach.');
  const v = bestVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
  return new Promise((res) => {
    let ok = false;
    u.onstart = () => { ok = true; setSilent(false); res(true); };
    setTimeout(() => { if (!ok) { setSilent(true); res(false); } }, 2500);
    speechSynthesis.speak(u);
  });
}

/** Can this device speak English? (false: show the switch as unavailable) */
export async function canSpeak(): Promise<boolean> {
  if (native?.speak) return true;
  await voicesReady();
  return !!bestVoice();
}

export function stopSpeaking() {
  waiting.forEach((f) => f()); waiting.clear();
  native?.stopSpeaking?.();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
