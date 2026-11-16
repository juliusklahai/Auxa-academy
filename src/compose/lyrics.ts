// Lyrics for Sing to Score. Speech recognition is unreliable for singing (and does not exist for Mende),
// so the singer types the words and Auxa places each syllable under the note it was sung on.
//
// Typing rules (the same ones hymn books use):
//   - a space separates words, a hyphen separates syllables of one word:  "A-maz-ing grace"
//   - an underscore holds the syllable before it over one more note (a melisma): "Glo _ _ ri-a"
// When there are fewer syllables than notes and no underscores, the extra notes become melismas on the
// notes most likely to be one: short, stepwise, straight after a sung note (never after a rest).

import type { MelodyNote } from './transcribe';

export type Syllabic = 'single' | 'begin' | 'middle' | 'end';
export interface LyricSyl { text: string; syllabic: Syllabic }
/** a syllable, or '_' (hold the last one) */
export type LyricToken = LyricSyl | '_';

export function splitLyrics(text: string): LyricToken[] {
  const out: LyricToken[] = [];
  for (const word of text.replace(/[‐-—]/g, '-').split(/\s+/).filter(Boolean)) {
    if (/^_+$/.test(word)) { for (let i = 0; i < word.length; i++) out.push('_'); continue; }
    const parts = word.split('-').filter(Boolean);
    parts.forEach((p, i) => {
      const holds = (p.match(/_+$/)?.[0].length) ?? 0;
      const t = p.replace(/_+$/, '');
      if (t) out.push({ text: t, syllabic: parts.length === 1 ? 'single' : i === 0 ? 'begin' : i === parts.length - 1 ? 'end' : 'middle' });
      for (let k = 0; k < holds; k++) out.push('_');
    });
  }
  return out;
}

export const syllableCount = (text: string) => splitLyrics(text).filter((t) => t !== '_').length;

export interface FitResult { notes: MelodyNote[]; /** syllables with no note left for them */ extra: number; /** notes sung as a melisma */ held: number }

/** Put the typed lyrics under the sung notes (rests are skipped). Returns new notes; the input is not changed. */
export function fitLyrics(notes: MelodyNote[], text: string): FitResult {
  const toks = splitLyrics(text);
  const out = notes.map((n) => ({ ...n, lyric: undefined as string | undefined, syllabic: undefined as Syllabic | undefined }));
  const idx = out.map((n, i) => (n.midi !== null ? i : -1)).filter((i) => i >= 0);
  if (!toks.length || !idx.length) return { notes: out, extra: 0, held: 0 };
  const sylls = toks.filter((t): t is LyricSyl => t !== '_');
  const N = idx.length;

  // which notes start a new syllable (true) or carry the one before (false)
  let starts: boolean[];
  if (toks.includes('_')) {
    // the singer said exactly where the holds go
    starts = [];
    for (const t of toks) starts.push(t !== '_');
    while (starts.length < N) starts.push(true);
    starts = starts.slice(0, N);
  } else if (sylls.length >= N) {
    starts = new Array(N).fill(true);
  } else {
    // choose N - S notes to be melismas, by dynamic programming over (note, syllables used)
    const S = sylls.length;
    const holdCost = (k: number) => {
      const n = out[idx[k]], prev = out[idx[k - 1]];
      if (!prev || idx[k] - idx[k - 1] !== 1 || prev.midi === null) return 99; // after a rest: a new syllable
      const step = Math.abs((n.midi ?? 0) - (prev.midi ?? 0));
      return (n.beats <= 0.5 ? 0 : n.beats <= 1 ? 0.6 : 1.6) + (step === 0 ? 1.2 : step <= 2 ? 0 : step <= 4 ? 0.5 : 1.2) + (prev.beats <= 1 ? 0 : 0.3);
    };
    const INF = 1e9;
    const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(S + 1).fill(INF));
    const ch: boolean[][] = Array.from({ length: N + 1 }, () => new Array(S + 1).fill(true));
    dp[1][1] = 0; // the first note always takes the first syllable
    for (let k = 1; k < N; k++) for (let s = 1; s <= S; s++) {
      if (dp[k][s] >= INF) continue;
      if (s + 1 <= S && dp[k][s] < dp[k + 1][s + 1]) { dp[k + 1][s + 1] = dp[k][s]; ch[k + 1][s + 1] = true; }
      const h = dp[k][s] + holdCost(k);
      if (h < dp[k + 1][s]) { dp[k + 1][s] = h; ch[k + 1][s] = false; }
    }
    starts = new Array(N).fill(true);
    for (let k = N, s = S; k > 1; k--) { starts[k - 1] = ch[k][s]; if (ch[k][s]) s--; }
  }

  let si = 0, held = 0;
  for (let k = 0; k < N; k++) {
    if (starts[k] && si < sylls.length) { out[idx[k]].lyric = sylls[si].text; out[idx[k]].syllabic = sylls[si].syllabic; si++; }
    else if (k > 0) held++;
  }
  // syllables left over: hang them on the last note so nothing typed is lost
  const extra = sylls.length - si;
  if (extra > 0) { const last = out[idx[N - 1]]; last.lyric = [last.lyric, ...sylls.slice(si).map((x) => x.text)].filter(Boolean).join(' '); }
  return { notes: out, extra, held };
}
