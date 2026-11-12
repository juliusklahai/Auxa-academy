// When the voice coach cannot speak on this device: what to do, step by step, for the phone in hand.
import { useState } from 'react';
import { Icon } from './Icon';
import { testVoice, useCoachSilent, coachOn } from './voice';
import { isNativeApp } from '../native/bridge';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
const isAndroid = /Android/i.test(ua);
const isSamsung = /SamsungBrowser/i.test(ua);

function steps(): string[] {
  if (isIOS) return [
    'Open Settings, then Accessibility, then Spoken Content.',
    'Tap Voices, then English, and download a voice (for example "Samantha" or an "Enhanced" one).',
    'Make sure the phone is not on silent (the switch on the side) and the volume is up.',
    'Come back here and tap "Test the voice".',
  ];
  if (isAndroid) return [
    'Open the phone Settings and search for "Text-to-speech" (often under System, then Languages and input).',
    'Set the Preferred engine to "Speech Services by Google". If it is missing, install it from the Play Store.',
    'Tap the gear next to it, then "Install voice data", and download English (United States).',
    'Set the Language to English, then press Play there to check you can hear it.',
    ...(isSamsung ? ['Samsung Internet may still stay quiet: open Auxa in Chrome instead.'] : []),
    ...(isNativeApp ? [] : ['Come back, reload this page, and tap "Test the voice".']),
  ];
  return [
    'Turn your sound up and check the right speaker or headphones are chosen.',
    'Use Chrome, Edge or Safari: they come with English voices.',
    'On Windows: Settings, Time and language, Speech, then add an English voice.',
    'Come back and tap "Test the voice".',
  ];
}

/** A small note shown on lesson steps when the coach is on but silent; opens the steps above. */
export function VoiceHelp() {
  const silent = useCoachSilent();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  if (!silent || !coachOn()) return null;
  const test = async () => { setMsg('Listening…'); const ok = await testVoice(); setMsg(ok ? 'It works! The coach will read each step.' : 'Still quiet. Follow the steps above, then try again.'); };
  return (
    <div className="voice-help">
      <button className="vh-bar" onClick={() => setOpen(!open)}>
        <Icon name="mute" size={16} /><span>The voice coach can't speak on this device yet.</span><b>{open ? 'Hide' : 'How to fix'}</b>
      </button>
      {open && (
        <div className="vh-body">
          <ol>{steps().map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="vh-actions">
            <button className="btn lime" onClick={() => void test()}><Icon name="speaker" size={15} />Test the voice</button>
            {msg && <span className="muted small">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
