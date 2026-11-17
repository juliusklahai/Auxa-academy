// Sound and latency check: what each part of the path from a key press to the sound actually costs on
// this device, measured live, plus a plain-language verdict and what to change.
import { useEffect, useState } from 'react';
import { audio } from '../audio/engine';
import { nativePianoActive, nativePianoAvailable, nativePianoStatus, onNativePianoChange } from '../audio/nativePiano';
import { midiIn } from '../input/midi';
import { mic } from '../input/mic';
import { Icon } from './Icon';

interface Row { label: string; ms: number | null; note?: string }

export function webAudioMs() {
  const c = audio.ctx as (AudioContext & { outputLatency?: number }) | null;
  return c ? { base: (c.baseLatency || 0) * 1000, out: (c.outputLatency || 0) * 1000 } : null;
}

export function LatencyCheck() {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 700); const off = onNativePianoChange(() => tick((n) => n + 1)); return () => { clearInterval(t); off(); }; }, []);
  const wa = webAudioMs();
  const nat = nativePianoActive() ? nativePianoStatus() : null;
  const keyboards = midiIn.devices;
  const rows: Row[] = [];
  let total: number | null = null;
  if (nat) {
    const out = Number(nat.outputMs) > 0 ? Number(nat.outputMs) : Number(nat.bufferMs);
    rows.push({ label: 'Key press to the phone\'s piano', ms: Number(nat.pressToRenderMs) >= 0 ? Number(nat.pressToRenderMs) : null, note: 'MIDI driver to the audio thread (measured on your last key)' });
    rows.push({ label: 'Phone audio output buffer', ms: out, note: `${nat.burst} frames per burst at ${nat.rate} Hz` });
    total = out + Math.max(0, Number(nat.pressToRenderMs) || 0) + 3; // + USB/MIDI transport (~1-3 ms)
  } else {
    if (midiIn.bridgeMs >= 0) rows.push({ label: 'Phone MIDI to the page', ms: midiIn.bridgeMs, note: 'the native bridge (measured on your keys)' });
    if (wa) {
      rows.push({ label: 'Browser audio buffer', ms: wa.base });
      rows.push({ label: 'Device output (as reported)', ms: wa.out || null, note: wa.out ? undefined : 'not reported by this browser' });
      total = wa.base + (wa.out || 0) + Math.max(0, midiIn.bridgeMs) + 3;
    }
  }
  const bt = !!nat?.bluetooth;
  const verdict = total === null ? null : total < 25 ? 'Excellent: you should not notice any delay.' : total < 45 ? 'Good: most players will not notice.' : total < 90 ? 'Noticeable for fast playing.' : 'Too slow for comfortable playing.';
  return (
    <div className="lat-check">
      <div className="lat-head"><b>Key-to-sound delay</b>{total !== null && <span className={`lat-total ${total < 45 ? 'ok' : total < 90 ? 'mid' : 'bad'}`}>≈ {Math.round(total)} ms</span>}</div>
      <p className="muted small">
        {nat ? <>Your MIDI keyboard is played by the phone's own low-latency piano ({String(nat.sound)}). The band and the metronome still come from the app.</>
          : keyboards.length && nativePianoAvailable() ? <>Loading the phone's low-latency piano for your keyboard…</>
          : keyboards.length ? <>Your keyboard is played through the browser's audio.</>
          : <>Connect a MIDI keyboard to measure the delay of its sound.</>}
      </p>
      {rows.length > 0 && <table className="lat-rows"><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}{r.note && <small className="muted"> · {r.note}</small>}</td><td>{r.ms === null ? '–' : `${Math.round(r.ms)} ms`}</td></tr>)}</tbody></table>}
      {verdict && <p className="small"><b>{verdict}</b></p>}
      {bt && <p className="lat-warn small"><Icon name="info" size={14} />Bluetooth headphones or speakers add 100 to 300 ms that no app can remove. For playing, use wired headphones, the phone speaker, or your piano's own speakers.</p>}
      {!nat && wa && wa.out > 80 && <p className="lat-warn small"><Icon name="info" size={14} />This device reports a large output delay ({Math.round(wa.out)} ms). Bluetooth audio is the usual cause.</p>}
      {Number(nat?.underruns) > 0 && <p className="lat-warn small"><Icon name="info" size={14} />The phone's audio skipped {String(nat!.underruns)} time(s). Close other apps if you hear crackles.</p>}
      {mic.active && <p className="muted small">Microphone listening runs {mic.engine === 'worker' ? `in the background (${Math.round(mic.workerLoad * 100)}% of real time)` : 'in the page'}.</p>}
    </div>
  );
}
