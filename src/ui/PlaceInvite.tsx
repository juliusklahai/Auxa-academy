import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/* Floating placement invite: pops up over a blurred page a moment after Home opens.
   "Maybe later" hides it for this session; "No thanks" hides it for good. */
const LATER = 'auxa.placeLater';

export function PlaceInvite({ plays, onSkip }: { plays: boolean; onSkip: () => void }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let later = false;
    try { later = sessionStorage.getItem(LATER) === '1'; } catch { /* ignore */ }
    if (later) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!open) return null;

  function close(later: boolean, then?: () => void) {
    if (later) { try { sessionStorage.setItem(LATER, '1'); } catch { /* ignore */ } }
    setLeaving(true);
    setTimeout(() => { setOpen(false); setLeaving(false); then?.(); }, 220);
  }

  return createPortal(
    <div className={`pi-back${leaving ? ' out' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) close(true); }}>
      <div className="pi-card" role="dialog" aria-modal="true" aria-labelledby="pi-title">
        <button className="pi-x" aria-label="Maybe later" onClick={() => close(true)}><Icon name="close" size={16} /></button>
        <span className="pi-seal"><Icon name="award" size={26} /></span>
        <h2 id="pi-title">{plays ? 'You already play. Skip ahead?' : 'Already play a little?'}</h2>
        <p>{plays ? 'A quick 5-minute placement test opens your path at your level.' : 'Take the 5-minute placement test and start at your level, not from scratch.'}</p>
        <button className="btn lime pi-go" onClick={() => close(true, () => window.dispatchEvent(new CustomEvent('maestro:placement')))}>Take the test</button>
        <button className="pi-no" onClick={() => close(false, onSkip)}>No thanks, start from the beginning</button>
      </div>
    </div>,
    document.body,
  );
}
