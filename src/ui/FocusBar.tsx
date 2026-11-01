import { Icon } from './Icon';

/** Floating controls shown in full-screen practice: open/close the floating panels, leave (Esc). */
export function FocusBar({ title, panel, onPanel, onExit, infoLabel = 'Info', settingsLabel }: {
  title: string; panel: 'info' | 'settings' | null; onPanel: (p: 'info' | 'settings') => void; onExit: () => void; infoLabel?: string; settingsLabel?: string;
}) {
  return (
    <div className="focus-bar" role="toolbar" aria-label="Practice view controls">
      <span className="focus-title">{title}</span>
      <span className="focus-fill" />
      {settingsLabel && <button className={`fbtn ${panel === 'settings' ? 'on' : ''}`} onClick={() => onPanel('settings')}><Icon name="sliders" size={15} /> {settingsLabel}</button>}
      <button className={`fbtn ${panel === 'info' ? 'on' : ''}`} onClick={() => onPanel('info')}><Icon name="doc" size={15} /> {infoLabel}</button>
      <button className="fbtn exit" onClick={onExit} title="Leave full screen (Esc)"><Icon name="close" size={15} /> Exit <kbd>Esc</kbd></button>
    </div>
  );
}

/** Header of a floating panel (only visible in full-screen practice). */
export function FloatHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="float-head"><b>{title}</b><button className="fclose" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close" size={14} /></button></div>;
}
