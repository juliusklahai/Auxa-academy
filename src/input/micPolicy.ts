// What the microphone's piano notes are allowed to mean for assessment.
//
// A microphone cannot always tell a struck key from the overtones, the room or the hammer thump around it.
// A tutor must never call correct playing wrong because of that, so this decides, per onset:
//   - notes the lesson expects that were heard clearly count;
//   - when expected notes were heard, any other note in the same onset that could be their overtone or
//     undertone (octave, twelfth, two octaves...) is only "unsure", never a mistake;
//   - a clear note with no expected note heard is reported as played (a wrong key really is wrong).
export interface HeardNote { midi: number; confidence: number }
export interface Judged { midi: number; confidence: number; unsure: boolean }

/** intervals at which a partial (or a missing fundamental) of one note can pass for another */
const RELATED = [12, 19, 24, 28, 31, 34, 36];
export const related = (a: number, b: number) => RELATED.includes(Math.abs(a - b));

export function judgeOnset(notes: HeardNote[], expected: number[] | null, minConf: number): Judged[] {
  const sure = notes.filter((n) => n.confidence >= minConf);
  if (!expected?.length) {
    // free playing: report clear notes; a clear note that sits on an overtone of a louder clear note is unsure
    const out = sure.map((n) => ({ ...n, unsure: sure.some((m) => m !== n && m.midi < n.midi && related(m.midi, n.midi) && m.confidence >= n.confidence) }));
    return out.length ? out : bestUnsure(notes);
  }
  const exp = new Set(expected);
  let hits = sure.filter((n) => exp.has(n.midi));
  if (hits.length && expected.length > 1) {
    // a chord: once part of it is heard clearly, the rest is judged in that light. An expected note heard
    // fairly clearly counts; an expected note hidden under its own octave or overtone (it shares all its
    // partials with notes that did sound) cannot be told apart, so it is given the benefit of the doubt.
    const soft = notes.filter((n) => exp.has(n.midi) && n.confidence >= 0.65 && !hits.includes(n));
    hits = [...hits, ...soft];
    const heard = notes.filter((n) => n.confidence >= 0.65).map((n) => n.midi);
    for (const m of expected) {
      if (hits.some((h) => h.midi === m)) continue;
      if (heard.some((h) => related(h, m)) || hits.some((h) => related(h.midi, m))) hits.push({ midi: m, confidence: 0.86 });
    }
  }
  if (hits.length) {
    const out: Judged[] = hits.map((n) => ({ ...n, unsure: false }));
    for (const n of sure) {
      if (exp.has(n.midi)) continue;
      // an extra beside a correct note: a real second key only if it is very clear and not a partial of
      // anything that sounded
      const ghost = [...expected, ...hits.map((h) => h.midi)].some((m) => related(m, n.midi)) || n.confidence < 0.97;
      out.push({ ...n, unsure: ghost });
    }
    return out;
  }
  // nothing expected was heard clearly. An expected note heard faintly is still the expected note: unsure.
  if (notes.some((n) => exp.has(n.midi))) return notes.filter((n) => exp.has(n.midi)).map((n) => ({ ...n, unsure: true }));
  // a clear unexpected note: the learner played another key. If it is only an overtone/undertone of the
  // expected note (the phone heard the wrong part of the sound), it is unsure.
  const out = sure.map((n) => ({ ...n, unsure: expected.some((m) => related(m, n.midi)) }));
  return out.length ? out : bestUnsure(notes);
}

const bestUnsure = (notes: HeardNote[]): Judged[] => {
  const b = [...notes].sort((a, c) => c.confidence - a.confidence)[0];
  return b ? [{ ...b, unsure: true }] : [];
};
