// Choose the piano's sound from recorded instruments. Free accounts play the concert grand and can
// listen to every other sound; choosing one is a Pro and Plus feature.
import { useState } from 'react';
import { audio } from '../audio/engine';
import { SOUNDS, type SoundDef, type SoundId } from '../audio/samples';
import { allowFeature } from '../account/gate';
import { openUpgrade, useAccount } from '../account/store';
import { setSettings, useSettings } from './settings';
import { Icon } from './Icon';

/** keyboard-friendly sounds only (the orchestra and bass are play-along voices in My Music) */
const PICKABLE = SOUNDS.filter((s) => s.group !== 'Orchestra' && s.id !== 'abass' && s.id !== 'ebass');

export function SoundPicker({ compact = false }: { compact?: boolean }) {
  const st = useSettings();
  const a = useAccount();
  const can = allowFeature(a.ent, 'sounds');
  const current: SoundId = can ? st.pianoSound : 'grand';
  const [busy, setBusy] = useState<SoundId | null>(null);
  const hear = async (id: SoundId) => {
    setBusy(id);
    try { await audio.preview(id); } catch { /* offline: nothing to play */ } finally { setBusy(null); }
  };
  const choose = (s: SoundDef) => {
    if (s.id !== 'grand' && !can) { void hear(s.id); openUpgrade('Choose from all the instrument sounds with Pro or Plus'); return; }
    setSettings({ pianoSound: s.id });
    void hear(s.id);
  };
  const groups = [...new Set(PICKABLE.map((s) => s.group))];
  return (
    <div className={`sound-picker ${compact ? 'compact' : ''}`}>
      {groups.map((g) => (
        <div key={g} className="sp-group">
          <small className="sp-head">{g}</small>
          <div className="sp-grid">
            {PICKABLE.filter((s) => s.group === g).map((s) => {
              const locked = s.id !== 'grand' && !can;
              return (
                <div key={s.id} className={`sp-card ${current === s.id ? 'on' : ''}`}>
                  <button className="sp-pick" onClick={() => choose(s)} aria-pressed={current === s.id}>
                    <b>{s.label}</b>
                    {current === s.id ? <span className="sp-tag on"><Icon name="check" size={11} />In use</span> : locked ? <span className="sp-tag"><Icon name="lock" size={11} />Pro</span> : null}
                  </button>
                  <button className="sp-hear" onClick={() => void hear(s.id)} aria-label={`Hear ${s.label}`} title="Hear it">
                    {busy === s.id ? <span className="sp-dots">…</span> : <Icon name="play" size={12} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!can && <p className="muted small sp-note">Free accounts play the concert grand. Tap ▶ to hear any sound; choosing one comes with Pro or Plus.</p>}
    </div>
  );
}

/** "Sound" button for the keyboard bar: the picker in a small floating panel */
export function SoundButton() {
  const [open, setOpen] = useState(false);
  const st = useSettings();
  const a = useAccount();
  const cur = SOUNDS.find((x) => x.id === (allowFeature(a.ent, 'sounds') ? st.pianoSound : 'grand'));
  return (
    <>
      <button className={`hands-chip ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Piano sound" title={cur?.label}><Icon name="wave" size={14} /> Sound</button>
      {open && (
        <div className="hands-panel float-card sound-panel" role="dialog" aria-label="Piano sound">
          <div className="hp-head"><b>Sound</b><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={14} /></button></div>
          <SoundPicker compact />
        </div>
      )}
    </>
  );
}
