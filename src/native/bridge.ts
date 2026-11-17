// Bridge to the Auxa native apps (Android now, iOS later). In a normal browser everything here is a
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
  /** low-latency piano for MIDI keyboards (Android): load a sound (JSON), set its level, stop, report */
  pianoSetup?(json: string): void;
  pianoVolume?(v: number): void;
  pianoDisable?(): void;
  pianoStatus?(): string;
  /** the clock MIDI arrival is stamped with */
  uptimeMs?(): number;
  /** save a file (base64) to Pictures/Auxa or Downloads/Auxa; returns a content:// address, "" on failure,
   *  or "picker" on Android 8–9, where the answer comes back on __maestroNative.onSaved */
  saveFile?(base64: string, name: string, mime: string): string;
  /** open a saved file in the phone's viewer */
  openFile?(uri: string, mime: string): void;
  /** the phone's share sheet with this text */
  shareText?(title: string, text: string): void;
}

declare global {
  interface Window {
    MaestroNative?: NativeApi;
    __maestroNative?: {
      /** MIDI bytes; sounded = the phone already played them; got = arrival time (uptimeMs clock) */
      onMidi?: (bytes: number[], sounded?: boolean, got?: number) => void;
      onPiano?: (ok: boolean) => void;
      onMidiDevices?: (names: string[]) => void;
      /** Android back button; return true when the app handled it */
      back?: () => boolean;
      onSpeechDone?: (id: string) => void;
      /** Android 8–9 save picker: the saved file's address, or "" when cancelled */
      onSaved?: (uri: string) => void;
    };
  }
}

export const native: NativeApi | null = typeof window !== 'undefined' && window.MaestroNative ? window.MaestroNative : null;
export const isNativeApp = !!native;
export const nativePlatform = native?.platform() ?? 'web';

const hooks = () => (window.__maestroNative ??= {});

/** Where sign-in emails and Google send people back to: the app itself when running inside it. */
export const AUTH_RETURN = isNativeApp ? 'com.auxa.academy://auth' : '';

/** Android back button: higher priority first (full-screen views before page navigation), then newest. */
const backStack: { f: () => boolean; p: number; n: number }[] = [];
let seq = 0;
export function onBack(handler: () => boolean, priority = 0) {
  const item = { f: handler, p: priority, n: seq++ };
  backStack.push(item);
  hooks().back = () => [...backStack].sort((a, b) => b.p - a.p || b.n - a.n).some((h) => h.f());
  return () => { const i = backStack.indexOf(item); if (i >= 0) backStack.splice(i, 1); };
}

export function onNativeMidi(onBytes: (b: number[], sounded?: boolean, got?: number) => void, onDevices: (names: string[]) => void) {
  hooks().onMidi = onBytes;
  hooks().onMidiDevices = onDevices;
}

export function onNativePiano(f: (ok: boolean) => void) { hooks().onPiano = f; }
