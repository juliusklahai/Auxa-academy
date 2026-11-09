// One light/dark setting for the whole app and the home page. Starts from the phone/computer setting.
import { useSyncExternalStore } from 'react';
import { native } from '../native/bridge';

export type Theme = 'dark' | 'light';
const KEY = 'maestro.landing.theme';
const subs = new Set<() => void>();
const read = (): Theme => {
  try { const t = localStorage.getItem(KEY); if (t === 'dark' || t === 'light') return t; } catch { /* fine */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};
let theme: Theme = typeof window !== 'undefined' ? read() : 'dark';
const apply = () => {
  const h = document.documentElement;
  h.classList.toggle('theme-dark', theme === 'dark');
  h.classList.toggle('theme-light', theme === 'light');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#181818' : '#f5f5f3');
  native?.setBars?.(theme === 'light');
};
if (typeof window !== 'undefined') apply();
export const getTheme = () => theme;
export function setTheme(t: Theme) {
  theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* fine */ }
  apply(); subs.forEach((f) => f());
}
export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
export const useTheme = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => theme, () => theme);
