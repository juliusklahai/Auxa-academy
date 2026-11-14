// Run Sing to Score over raw f32 recordings and print what it writes (troubleshooting / evaluation).
import { readFileSync } from 'node:fs';
import { framesFromSamples } from '../src/compose/audioFile';
import { transcribe } from '../src/compose/transcribe';
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m: number) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f); const x = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const fr = framesFromSamples(x, 48000);
  const m = transcribe(fr);
  if (!m) { console.log(f, 'nothing'); continue; }
  console.log(`\n${f.split('/').pop()} -> ${m.bpm} bpm ${m.timeSig.join('/')} ${m.key.name}, ${m.notes.filter((n) => n.midi !== null).length} notes`);
  console.log(m.notes.map((n) => (n.midi === null ? `r${n.beats}` : `${nm(n.midi)}:${n.beats}`)).join(' '));
}
