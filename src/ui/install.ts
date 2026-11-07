// "Install Maestro" (add to home screen): the installed app opens full screen, with no browser bar and
// no full-screen notice. Chrome/Android offers a prompt we can trigger; iPhone needs Share → Add to Home Screen.
import { useSyncExternalStore } from 'react';
import { isInstalled } from './focus';

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: Prompt | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as Prompt; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
}
const DISMISS = 'maestro.install.dismissed';
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export interface InstallState { canPrompt: boolean; ios: boolean; installed: boolean; dismissed: boolean }
let snap: InstallState | null = null;
const read = (): InstallState => {
  const next = { canPrompt: !!deferred, ios: isIOS(), installed: isInstalled(), dismissed: (() => { try { return localStorage.getItem(DISMISS) === '1'; } catch { return false; } })() };
  if (!snap || Object.keys(next).some((k) => next[k as keyof InstallState] !== snap![k as keyof InstallState])) snap = next;
  return snap;
};
export const useInstall = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, read);
export async function installApp() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; ping();
  return outcome === 'accepted';
}
export const dismissInstall = () => { try { localStorage.setItem(DISMISS, '1'); } catch { /* fine */ } ping(); };
