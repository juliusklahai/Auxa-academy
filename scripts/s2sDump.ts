import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeVoice, findSyllables } from '../src/compose/voiceNotes';
for (const name of process.argv.slice(2)) {
  const b = readFileSync(`/tmp/s2s/${name}.f32`); const x = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const v = analyzeVoice(x, 48000);
  writeFileSync(`/tmp/s2s/${name}.v2.json`, JSON.stringify({ syl: findSyllables(v), low: Array.from(v.low), high: Array.from(v.high), f0: v.f0 }));
}
