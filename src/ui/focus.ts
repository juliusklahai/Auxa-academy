import { useEffect, useRef, useState } from 'react';

/**
 * Focus (practice) mode: only the score and the keyboard fill the screen, browser full screen
 * where supported. Esc (or leaving full screen) returns to the normal view.
 */
/** running as an installed app (home-screen icon): already full screen, no browser bar, no notice */
export const isInstalled = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);
export const isPhone = () => window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const isPortrait = () => window.innerHeight > window.innerWidth;
type OrientationLock = { lock?: (o: string) => Promise<void>; unlock?: () => void };

export function useFocusMode() {
  const [focus, setFocus] = useState(false);
  const [panel, setPanel] = useState<'info' | 'settings' | null>(null);
  /** practice controls folded into a floating button while practicing */
  const [dockOpen, setDockOpen] = useState(false);
  /** phone still upright (the browser would not turn it): suggest turning it sideways */
  const [rotateHint, setRotateHint] = useState(false);
  const usingFs = useRef(false);
  const focusRef = useRef(false);
  focusRef.current = focus;

  const enter = () => {
    setFocus(true);
    setPanel(null);
    setDockOpen(false);
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    // phones: landscape gives the score and keyboard room (Android turns the screen; iPhone gets a hint)
    const landscape = () => {
      if (!isPhone()) return;
      const o = screen.orientation as unknown as OrientationLock | undefined;
      Promise.resolve(o?.lock ? o.lock('landscape') : Promise.reject(new Error('no lock')))
        .then(() => setRotateHint(false)).catch(() => setRotateHint(isPortrait()));
      // some browsers never answer the lock request: check again once the screen had time to turn
      window.setTimeout(() => { if (isPortrait()) setRotateHint(true); }, 1200);
    };
    // installed app: it is full screen already, so only turn the screen (no browser full-screen notice)
    if (isInstalled()) { landscape(); return; }
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { usingFs.current = true; landscape(); }).catch(landscape);
      else { el.webkitRequestFullscreen?.(); landscape(); }
    } catch { landscape(); /* not available (e.g. iPhone): the app still fills the page */ }
  };
  const exit = () => {
    setFocus(false);
    setPanel(null);
    setDockOpen(false);
    setRotateHint(false);
    try { (screen.orientation as unknown as OrientationLock | undefined)?.unlock?.(); } catch { /* fine */ }
    usingFs.current = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && focusRef.current) exit(); };
    const onFs = () => { if (!document.fullscreenElement && usingFs.current) { usingFs.current = false; setFocus(false); setPanel(null); } };
    const onTurn = () => { if (!isPortrait()) setRotateHint(false); };
    window.addEventListener('resize', onTurn);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onTurn);
      try { (screen.orientation as unknown as OrientationLock | undefined)?.unlock?.(); } catch { /* fine */ }
      document.removeEventListener('fullscreenchange', onFs);
      document.documentElement.classList.remove('focus-on');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []); // eslint-disable-line

  useEffect(() => { document.documentElement.classList.toggle('focus-on', focus); }, [focus]);

  const togglePanel = (p: 'info' | 'settings') => setPanel((x) => (x === p ? null : p));
  return {
    focus, enter, exit, toggle: () => (focus ? exit() : enter()), panel, togglePanel, closePanel: () => setPanel(null),
    dockOpen, toggleDock: () => setDockOpen((x) => !x), closeDock: () => setDockOpen(false), rotateHint, dismissRotate: () => setRotateHint(false),
  };
}
