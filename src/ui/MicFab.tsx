// A floating microphone button on the score: start or stop listening to a real piano without leaving the
// exercise. It also says when the earphones' own microphone is in use (it hears the earbuds, not the piano).
import { useEffect, useState } from 'react';
import { mic, micHelp } from '../input/mic';
import { Icon } from './Icon';

export function MicFab({ voice }: { voice?: boolean }) {
  const [, tick] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hideNote, setHideNote] = useState(false);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 600); return () => clearInterval(t); }, []);
  const on = mic.active;
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      if (on) mic.stop();
      else { await mic.start(); mic.settings.mode = voice ? 'voice' : 'piano'; }
    } catch (e) { setErr(micHelp(e)); }
    setBusy(false); tick((n) => n + 1);
  };
  return (
    <>
      <button className={`mic-fab ${on ? 'live' : ''}`} onClick={() => void toggle()} aria-pressed={on}
        aria-label={on ? 'Listening to your piano: tap to stop the microphone' : 'Listen with the microphone'} title={on ? 'Listening: tap to stop' : 'Listen with the microphone'}>
        <Icon name="mic" size={18} />
      </button>
      {(err || (on && mic.headsetMic && !hideNote)) && (
        <div className="mic-fab-note small" role="status">
          {err || 'Your earphones’ microphone is in use: it hears the earbuds more than the piano. Use earphones without a microphone, or a MIDI cable.'}
          <button className="link-btn" onClick={() => { setErr(''); setHideNote(true); }} aria-label="Close">✕</button>
        </div>
      )}
    </>
  );
}
