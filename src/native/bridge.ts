// Bridge to the Maestro native apps (Android now, iOS later). In a normal browser everything here is a
// no-op and the web features are used instead.
//
// Native → web calls arrive on window.__maestroNative (MIDI bytes, device lists, the back button).

interface NativeApi {
  platform(): string;
  /** practice view: landscape, no system bars, screen stays on */
  setPractice(on: boolean): void;
  keepAwake(on: boolean): void;
  openExternal(url: string): void;
  /** start listening to every connected MIDI keyboard */
  midiStart(): void;
  /** status/navigation bar icons: dark on light pages */
  setBars?(lightBackground: boolean): void;
  appVersion?(): string;
  /** voice coach (Android text-to-speech) */
  speak?(text: string, id: string, rate: number): void;
  stopSpeaking?(): void;
}

declare global {
  interface Window {
    MaestroNative?: NativeApi;
    __maestroNative?: {
      onMidi?: (bytes: number[]) => void;
      onMidiDevices?: (names: string[]) => void;
      /** Android back button; return true when the app handled it */
      back?: () => boolean;
      onSpeechDone?: (id: string) => void;
    };
  }
}

export const native: NativeApi | null = typeof window !== 'undefined' && window.MaestroNative ? window.MaestroNative : null;
export const isNativeApp = !!native;
export const nativePlatform = native?.platform() ?? 'web';

const hooks = () => (window.__maestroNative ??= {});

/** Where sign-in emails and Google send people back to: the app itself when running inside it. */
export const AUTH_RETURN = isNativeApp ? 'io.github.juliusklahai.maestro://auth' : '';

/** Android back button: higher priority first (full-screen views before page navigation), then newest. */
const backStack: { f: () => boolean; p: number; n: number }[] = [];
let seq = 0;
export function onBack(handler: () => boolean, priority = 0) {
  const item = { f: handler, p: priority, n: seq++ };
  backStack.push(item);
  hooks().back = () => [...backStack].sort((a, b) => b.p - a.p || b.n - a.n).some((h) => h.f());
  return () => { const i = backStack.indexOf(item); if (i >= 0) backStack.splice(i, 1); };
}

export function onNativeMidi(onBytes: (b: number[]) => void, onDevices: (names: string[]) => void) {
  hooks().onMidi = onBytes;
  hooks().onMidiDevices = onDevices;
}
