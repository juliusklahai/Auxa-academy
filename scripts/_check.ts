import { allLines } from '../src/curriculum/spoken';
import { LESSONS } from '../src/curriculum/lessons';
import { speakable } from '../src/ui/speechText';
const pats = /\b[A-G]s\b|\b[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add)?\d+\b|[A-Z]{2,}|\d+\/\d+|\b\w+-\w+-\w+|[^\x00-\x7F]|\b(Fine|ta-a|ti-ti|bpm|vs|e\.g|etc)\b|\(|\)|:|;|\d-\d/;
const seen = new Set<string>();
for (const line of allLines(LESSONS)) {
  const s = speakable(line);
  const m = s.match(new RegExp(pats.source, 'g'));
  if (m) for (const x of m) seen.add(x);
}
console.log([...seen].sort().join(' | '));
