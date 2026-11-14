import { useSyncExternalStore } from 'react';
import { audio } from '../audio/engine';
import { mic } from '../input/mic';
import { browserKV, ProgressStore } from '../progress/store';

export interface AppSettings {
  labels: 'letters' | 'solfege' | 'none';
  fingers: boolean;
  keyHints: boolean;
  highContrast: boolean;
  a4: number;
  volume: number;
  metronomeVolume: number;
  latencyMs: number;
  noiseGate: number;
  micSensitivity: number; // min confidence
  wrongBeep: boolean;
  mistakePolicy: 'restart' | 'pause';
  hands: boolean;
  micMode: 'piano' | 'voice';
  voiceLow: number;
  voiceHigh: number;
  outputMode: 'headphones' | 'speakers';
  latencyMode: 'smooth' | 'low';
  micDeviceId: string;
  /** what the microphone is hearing */
  micInstrument: 'piano' | 'epiano' | 'organ' | 'synth' | 'mono' | 'voice';
  /** go full screen automatically when practice starts */
  autoFocus: boolean;
  /** voice coach reads lesson steps aloud */
  coachVoice: boolean;
  /** guide hands: anatomical 3D model or the older line drawing */
  handStyle: '3d' | '2d';
  handOpacity: number;
  handColor: 'white' | 'skin' | 'blue' | 'pink';
  /** realistic scanned hands, or the drawn sketch-style hands */
  handLook: 'real' | 'drawn';
  handStroke: number;
  handsShow: 'both' | 'RH' | 'LH';
  /** hands also play along while listening (My Music) */
  handsListen: boolean;
  /** on-screen keyboard: shown, size (drag handle) and number of keys */
  keyboard: boolean;
  kbScale: number;
  kbKeys: 'auto' | 25 | 37 | 49 | 61 | 88;
  /** singing level: easy (encouraging) to pro (strict vocal coaching) */
  voiceLevel: 'easy' | 'standard' | 'strict' | 'pro';
}

const KEY = 'maestro.settings.v1';
const DEFAULTS: AppSettings = {
  labels: 'letters', fingers: true, keyHints: false, highContrast: false, a4: 440, volume: 0.8, metronomeVolume: 0.6,
  latencyMs: 60, noiseGate: 0.002, micSensitivity: 0.85, wrongBeep: false, mistakePolicy: 'restart', hands: true, micMode: 'piano', voiceLow: 57, voiceHigh: 74, outputMode: 'headphones', latencyMode: 'smooth', micDeviceId: '', micInstrument: 'piano', autoFocus: true, coachVoice: true,
  handStyle: '3d', handOpacity: 0.8, handColor: 'white', handLook: 'real', handStroke: 1, handsShow: 'both',
  handsListen: true, keyboard: true, kbScale: 1, kbKeys: 'auto', voiceLevel: 'easy',
};

const kv = browserKV();
let state: AppSettings = (() => {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(kv.getItem(KEY) ?? '{}') } as AppSettings;
    // older versions used a high fixed gate that ignored soft playing; the listener now adapts to the room
    if (s.noiseGate > 0.005) s.noiseGate = DEFAULTS.noiseGate;
    return s;
  } catch { return DEFAULTS; }
})();
const subs = new Set<() => void>();

function apply(s: AppSettings) {
  audio.a4 = s.a4;
  audio.setVolume(s.volume);
  audio.metronomeVolume = s.metronomeVolume;
  mic.settings.latencyMs = s.latencyMs;
  mic.settings.noiseGate = s.noiseGate;
  mic.settings.minConfidence = s.micSensitivity;
  mic.settings.mode = s.micMode;
  mic.deviceId = s.micDeviceId;
  if (s.micInstrument === 'piano' || s.micInstrument === 'epiano' || s.micInstrument === 'organ' || s.micInstrument === 'synth') mic.profile = s.micInstrument;
  void audio.setLatencyMode(s.latencyMode);
  document.documentElement.classList.toggle('hc', s.highContrast);
}
apply(state);

export const getSettings = () => state;

export function setSettings(p: Partial<AppSettings>) {
  state = { ...state, ...p };
  kv.setItem(KEY, JSON.stringify(state));
  apply(state);
  subs.forEach((f) => f());
}
export function useSettings(): AppSettings {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

// Progress store singleton + change signal for React.
export const progress = new ProgressStore(kv);
let progressVersion = 0;
const psubs = new Set<() => void>();
export function bumpProgress() { progressVersion++; psubs.forEach((f) => f()); }
export function useProgressVersion() {
  return useSyncExternalStore((f) => { psubs.add(f); return () => psubs.delete(f); }, () => progressVersion);
}
