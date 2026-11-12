// Voice coach: reads instructions aloud when a lesson step opens, then the example plays (like a teacher
// sitting next to you). Uses the phone's text-to-speech in the Android app, the browser's elsewhere.
import { native } from '../native/bridge';
import { getSettings } from './settings';
import { lineKey, speakable } from './speechText';
export { lineKey, speakable };

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


// ---------- recorded voice ----------
const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/');
let recorded: Promise<Set<string>> | null = null;
/** Which lines have a recording (voice/index.json lists them). */
function recordings(): Promise<Set<string>> {
  return (recorded ??= fetch(`${BASE}voice/index.json`, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : { lines: [] })).then((j: { lines: string[] }) => new Set(j.lines)).catch(() => new Set<string>()));
}
if (typeof window !== 'undefined') setTimeout(() => void recordings(), 1500); // warm up
let player: HTMLAudioElement | null = null;
let playing: ((ok: boolean) => void) | null = null;
function playRecording(key: string): Promise<boolean> {
  return new Promise((res) => {
    const a = player ?? (player = new Audio());
    playing = res;
    a.onended = () => { playing = null; res(true); };
    a.onerror = () => { playing = null; res(false); };
    a.src = `${BASE}voice/${key}.mp3`;
    a.play().then(() => setSilent(false)).catch(() => res(false));
  });
}
/** Load the next likely lines in the background so they start at once. */
export function prefetchLines(lines: string[]) {
  void recordings().then((have) => { for (const l of lines) { const k = lineKey(speakable(l)); if (have.has(k)) { const x = new Audio(); x.preload = 'auto'; x.src = `${BASE}voice/${k}.mp3`; } } });
}

/** Say something. Resolves when it has been spoken (or straight away if the voice is off/unavailable). */
export function say(text: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && !coachOn()) return Promise.resolve();
  const line = speakable(text);
  if (!line) return Promise.resolve();
  stopSpeaking();
  // a natural recorded voice when this line has been recorded, the device's speech otherwise
  const key = lineKey(line);
  return recordings().then((have) => (have.has(key) ? playRecording(key) : Promise.resolve(false))).then((ok) => (ok ? undefined : speakLive(line)));
}

function speakLive(line: string): Promise<void> {
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
  if (player) { player.onended = null; player.onerror = null; player.pause(); }
  if (playing) { const f = playing; playing = null; f(true); } // stopped on purpose: do not fall back to speech
  waiting.forEach((f) => f()); waiting.clear();
  native?.stopSpeaking?.();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
