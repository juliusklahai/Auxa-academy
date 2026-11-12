import { useState } from 'react';
import { Icon } from './Icon';
import { isPhone } from './focus';
import { dismissInstall, installApp, useInstall } from './install';

/** Overview banner on phones: install for true full screen (no address bar, no full-screen notice). */
export function InstallBanner() {
  const st = useInstall();
  const [ios, setIos] = useState(false);
  if (st.installed || st.dismissed || !isPhone() || (!st.canPrompt && !st.ios)) return null;
  return (
    <div className="install-banner">
      <img src="./icon-192.png" alt="" width={40} height={40} />
      <div className="ib-text">
        <b>Install Auxa on your phone</b>
        <span>{ios ? 'Tap the Share button, then “Add to Home Screen”.' : 'Opens full screen with no address bar, and works offline.'}</span>
      </div>
      {!ios && <button className="btn lime sm" onClick={() => (st.canPrompt ? void installApp() : setIos(true))}>Install</button>}
      <button className="icon-btn" onClick={dismissInstall} aria-label="Not now"><Icon name="close" size={14} /></button>
    </div>
  );
}

/** One line under the "turn your phone" hint. */
export function InstallHint({ dark }: { dark?: boolean }) {
  const st = useInstall();
  if (st.installed || (!st.canPrompt && !st.ios)) return null;
  return st.canPrompt
    ? <button className={`link ${dark ? 'on-dark' : ''}`} onClick={() => void installApp()}>Install Auxa for true full screen</button>
    : <small className={dark ? 'on-dark' : ''}>Tip: Share → Add to Home Screen opens Auxa full screen.</small>;
}
