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
}

const KEY = 'maestro.settings.v1';
const DEFAULTS: AppSettings = {
  labels: 'letters', fingers: true, keyHints: false, highContrast: false, a4: 440, volume: 0.8, metronomeVolume: 0.6,
  latencyMs: 60, noiseGate: 0.012, micSensitivity: 0.85, wrongBeep: false, mistakePolicy: 'restart', hands: true, micMode: 'piano', voiceLow: 57, voiceHigh: 74, outputMode: 'headphones', latencyMode: 'smooth', micDeviceId: '',
};

const kv = browserKV();
let state: AppSettings = (() => { try { return { ...DEFAULTS, ...JSON.parse(kv.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; } })();
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
  void audio.setLatencyMode(s.latencyMode);
  document.documentElement.classList.toggle('hc', s.highContrast);
}
apply(state);

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
