import { useEffect, useRef, useState } from 'react';

/**
 * Focus (practice) mode: only the score and the keyboard fill the screen, browser full screen
 * where supported. Esc (or leaving full screen) returns to the normal view.
 */
export function useFocusMode() {
  const [focus, setFocus] = useState(false);
  const [panel, setPanel] = useState<'info' | 'settings' | null>(null);
  const usingFs = useRef(false);
  const focusRef = useRef(false);
  focusRef.current = focus;

  const enter = () => {
    setFocus(true);
    setPanel(null);
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { usingFs.current = true; }).catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch { /* not available (e.g. iPhone): the app still fills the page */ }
  };
  const exit = () => {
    setFocus(false);
    setPanel(null);
    usingFs.current = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && focusRef.current) exit(); };
    const onFs = () => { if (!document.fullscreenElement && usingFs.current) { usingFs.current = false; setFocus(false); setPanel(null); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      document.documentElement.classList.remove('focus-on');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []); // eslint-disable-line

  useEffect(() => { document.documentElement.classList.toggle('focus-on', focus); }, [focus]);

  const togglePanel = (p: 'info' | 'settings') => setPanel((x) => (x === p ? null : p));
  return { focus, enter, exit, toggle: () => (focus ? exit() : enter()), panel, togglePanel, closePanel: () => setPanel(null) };
}
