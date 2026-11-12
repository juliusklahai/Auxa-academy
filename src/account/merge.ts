// Merge progress from two devices without losing anything: per exercise keep the most passes, the best
// score and the latest attempts; per day keep the longest practice time.
import type { ProgressData } from '../progress/store';

export function mergeProgress(a: ProgressData | null | undefined, b: ProgressData | null | undefined): ProgressData {
  const out: ProgressData = { version: 1, exercises: {}, practiceLog: {} };
  for (const src of [a, b]) {
    if (!src || src.version !== 1) continue;
    for (const [id, ex] of Object.entries(src.exercises ?? {})) {
      const cur = out.exercises[id];
      if (!cur) { out.exercises[id] = { ...ex, attempts: [...(ex.attempts ?? [])] }; continue; }
      const attempts = [...cur.attempts, ...(ex.attempts ?? [])]
        .filter((x, i, all) => all.findIndex((y) => y.at === x.at && y.score === x.score) === i)
        .sort((x, y) => x.at - y.at).slice(-5);
      out.exercises[id] = {
        best: Math.max(cur.best, ex.best), passes: Math.max(cur.passes, ex.passes), attempts,
        box: Math.max(cur.box, ex.box), reviewDue: Math.max(cur.reviewDue ?? 0, ex.reviewDue ?? 0) || undefined,
      };
    }
    for (const [d, s] of Object.entries(src.practiceLog ?? {})) out.practiceLog[d] = Math.max(out.practiceLog[d] ?? 0, s);
    if (src.placementSkipped) out.placementSkipped = true;
    if (src.placedLevel !== undefined) out.placedLevel = Math.max(out.placedLevel ?? -1, src.placedLevel);
    for (const [lv, d] of Object.entries(src.certs ?? {})) { out.certs ??= {}; if (!out.certs[lv] || d < out.certs[lv]) out.certs[lv] = d; }
  }
  return out;
}
