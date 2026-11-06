import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { goHome } from './nav';

/** Floating controls shown in full-screen practice: open/close the floating panels, leave (Esc). */
export function FocusBar({ title, panel, onPanel, onExit, infoLabel = 'Info', settingsLabel }: {
  title: string; panel: 'info' | 'settings' | null; onPanel: (p: 'info' | 'settings') => void; onExit: () => void; infoLabel?: string; settingsLabel?: string;
}) {
  return (
    <div className="focus-bar" role="toolbar" aria-label="Practice view controls">
      <button className="circle brand focus-home" onClick={goHome} aria-label="Home" title="Home"><i /><i /><i /></button>
      <span className="focus-title">{title}</span>
      <div className="focus-actions">
      {settingsLabel && <button className={`fbtn ${panel === 'settings' ? 'on' : ''}`} onClick={() => onPanel('settings')}><Icon name="sliders" size={15} /> {settingsLabel}</button>}
      <button className={`fbtn ${panel === 'info' ? 'on' : ''}`} onClick={() => onPanel('info')}><Icon name="doc" size={15} /> {infoLabel}</button>
      <button className="fbtn exit" onClick={onExit} title="Leave full screen (Esc)"><Icon name="close" size={15} /> Exit <kbd>Esc</kbd></button>
      </div>
    </div>
  );
}

/** Header of a floating panel (only visible in full-screen practice). */
export function FloatHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="float-head"><b>{title}</b><button className="fclose" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close" size={14} /></button></div>;
}

/** While practicing full screen, the bottom controls fold into floating buttons: the main action stays
 *  one tap away, everything else opens from the controls button. */
export function DockFab({ open, onToggle, primary }: { open: boolean; onToggle: () => void; primary: ReactNode }) {
  return (
    <div className="fab-stack">
      <button className={`fab ${open ? 'on' : ''}`} onClick={onToggle} aria-expanded={open} aria-label={open ? 'Hide controls' : 'Show controls'} title="Controls">
        <Icon name={open ? 'close' : 'sliders'} size={18} />
      </button>
      {primary}
    </div>
  );
}

/** Phone held upright in practice: suggest turning it (when the browser could not turn it itself). */
export function RotateHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rotate-hint" role="dialog" aria-label="Turn your phone">
      <div className="rotate-phone" aria-hidden><i /></div>
      <b>Turn your phone sideways</b>
      <p>The score and the keyboard get much more room.</p>
      <button className="btn ghost sm" onClick={onDismiss}>Keep it upright</button>
    </div>
  );
}
