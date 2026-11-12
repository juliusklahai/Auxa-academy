// Writes every line the voice coach says (exactly as spoken) to scripts/voice/lines.json for recording.
// Run: npx vite-node scripts/voice/lines.ts
import { writeFileSync } from 'node:fs';
import { LESSONS } from '../../src/curriculum/lessons';
import { allLines } from '../../src/curriculum/spoken';
import { lineKey, speakable } from '../../src/ui/speechText';

const lines = allLines(LESSONS).map((t) => { const s = speakable(t); return { key: lineKey(s), text: s }; });
writeFileSync(new URL('./lines.json', import.meta.url), JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines`);
