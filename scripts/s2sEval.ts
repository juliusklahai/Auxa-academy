// Score Sing to Score against hand-checked recordings (syllables from lyrics aligned to the audio).
// usage: vite-node scripts/s2sEval.ts [v1|v2]   (recordings + truth live outside the repo)
import { readFileSync, existsSync } from 'node:fs';
import { framesFromSamples } from '../src/compose/audioFile';
import { transcribe, cleanFrames, segment, tidy, alignSyllables, type SungNote, type Melody } from '../src/compose/transcribe';

// recordings (raw mono float32 at 48 kHz, not in the repo) live in S2S_DIR; the answer keys live next to this file
const DIR = process.env.S2S_DIR ?? '/tmp/s2s';
const TRUTH = new URL('./s2s-truth/', import.meta.url).pathname;
const SONGS: [string, [number, number]][] = [['amazing_grace', [3, 4]], ['happy_birthday', [3, 4]], ['rock_of_ages', [3, 4]], ['the_morning_breaks', [3, 4]], ['we_thank_the_o_God', [4, 4]], ['hail_to_the_brighness', [3, 4]]];
interface Truth { syl: string; start: number; vowel: number; end: number; midi: number | null }
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

type Pipe = (x: Float32Array, sr: number) => { notes: SungNote[]; meter?: [number, number]; bpm?: number; melody?: Melody | null };
const v1: Pipe = (x, sr) => {
  const fr = framesFromSamples(x, sr);
  const notes = tidy(alignSyllables(tidy(segment(cleanFrames(fr))), fr));
  const m = transcribe(fr);
  return { notes, meter: m?.timeSig, bpm: m?.bpm, melody: m };
};
const pipes: Record<string, Pipe> = { v1 };
export function register(name: string, p: Pipe) { pipes[name] = p; }

/** Align written notes with the sheet music (any transposition): exact pitch matches, missing, extra, and note values. */
function vsScore(mel: Melody, ref: [number, number][]) {
  const det = mel.notes.filter((n) => n.midi !== null) as { midi: number; beats: number }[];
  let best: { ok: number; miss: number; extra: number; durOk: number; pairs: number; T: number; s: number; ops: string[] } | null = null;
  for (let T = 30; T <= 80; T++) for (const s of [0.5, 1, 2]) {
    const n = ref.length, m = det.length;
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = 0; i <= n; i++) D[i][0] = i; for (let j = 0; j <= m; j++) D[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const sub = det[j - 1].midi === ref[i - 1][0] + T ? 0 : Math.abs(det[j - 1].midi - ref[i - 1][0] - T) <= 1 ? 0.6 : 1.2;
      D[i][j] = Math.min(D[i - 1][j - 1] + sub, D[i - 1][j] + 1, D[i][j - 1] + 1);
    }
    let i = n, j = m, ok = 0, miss = 0, extra = 0, durOk = 0, pairs = 0;
    const ops: string[] = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0) {
        const sub = det[j - 1].midi === ref[i - 1][0] + T ? 0 : Math.abs(det[j - 1].midi - ref[i - 1][0] - T) <= 1 ? 0.6 : 1.2;
        if (Math.abs(D[i][j] - (D[i - 1][j - 1] + sub)) < 1e-9) { ops.push(`${nm(ref[i - 1][0] + T)}${sub ? '≠' + nm(det[j - 1].midi) : ''}:${ref[i - 1][1]}${Math.abs(det[j - 1].beats * s - ref[i - 1][1]) < 1e-6 ? '' : '≠' + det[j - 1].beats * s}`); pairs++; if (sub === 0) ok++; if (Math.abs(det[j - 1].beats * s - ref[i - 1][1]) < 1e-6) durOk++; i--; j--; continue; }
      }
      if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) { ops.push(`[MISS ${nm(ref[i - 1][0] + T)}]`); miss++; i--; } else { ops.push(`[+${nm(det[j - 1].midi)}]`); extra++; j--; }
    }
    const score = ok * 3 + durOk - extra - miss;
    if (!best || score > best.ok * 3 + best.durOk - best.extra - best.miss) best = { ok, miss, extra, durOk, pairs, T, s, ops: ops.reverse() };
  }
  return best!;
}

export async function run(which = process.argv[2] ?? 'v1', verbose = process.argv.includes('-v')) {
  if (which === 'v2') { const m = await import('./s2sV2'); register('v2', m.pipe); }
  if (which === 'app') {
    const { scoreFromVoice } = await import('../src/compose/singToScore2');
    register('app', (x, sr) => {
      const r = scoreFromVoice(x, sr);
      const notes = (r?.syllables ?? []).map((s) => ({ midi: s.midi, start: s.start, end: s.end, cents: s.cents, spread: s.spread }));
      return { notes, meter: r?.timeSig, bpm: r?.bpm, melody: r };
    });
  }
  const tot = { truth: 0, det: 0, hit: 0, pitchOk: 0, pitchN: 0, meterOk: 0, songs: 0, refN: 0, refOk: 0, refExtra: 0, refMiss: 0, refDur: 0, refPairs: 0 };
  const refs = existsSync(`${TRUTH}refs.json`) ? JSON.parse(readFileSync(`${TRUTH}refs.json`, 'utf8')) : {};
  for (const [name, meter] of SONGS) {
    const f = `${DIR}/${name}.f32`, tf = `${TRUTH}${name}.truth.json`;
    if (!existsSync(f) || !existsSync(tf)) continue;
    const b = readFileSync(f); const x = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    const truth: Truth[] = JSON.parse(readFileSync(tf, 'utf8'));
    const out = pipes[which](x, 48000);
    const det = out.notes;
    // match each truth syllable to the nearest unused detected note start within 150 ms (of its consonant or vowel)
    const used = new Set<number>();
    let hit = 0, pOk = 0, pN = 0;
    const rows: string[] = [];
    for (const t of truth) {
      let bi = -1, bd = Infinity;
      det.forEach((n, i) => { if (used.has(i)) return; const d = Math.min(Math.abs(n.start / 1000 - t.start), Math.abs(n.start / 1000 - t.vowel)); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0 && bd <= 0.15) {
        used.add(bi); hit++;
        if (t.midi !== null) { pN++; if (det[bi].midi === Math.round(t.midi)) pOk++; }
        rows.push(`${t.syl}:${t.midi !== null ? nm(Math.round(t.midi)) : '?'}=${nm(det[bi].midi)}${det[bi].midi === Math.round(t.midi ?? -99) ? '' : '✗'}`);
      } else rows.push(`${t.syl}:MISSING`);
    }
    const extra = det.filter((_, i) => !used.has(i)).map((n) => `${(n.start / 1000).toFixed(2)}${nm(n.midi)}`);
    const mOk = out.meter && out.meter[0] === meter[0] ? 1 : 0;
    console.log(`${name.padEnd(22)} syllables ${truth.length}  found ${hit} (${Math.round((100 * hit) / truth.length)}%)  extra ${det.length - hit}  pitch ${pOk}/${pN}  meter ${out.meter?.join('/') ?? '-'}${mOk ? '' : '✗'}  ${out.bpm ?? ''}bpm`);
    const ref = refs[name];
    if (ref && out.melody) {
      const r = vsScore(out.melody, ref.notes);
      console.log(`${''.padEnd(22)} vs sheet music: ${ref.notes.length} notes, right pitch ${r.ok}, missing ${r.miss}, extra ${r.extra}, right note value ${r.durOk}/${r.pairs}${r.s !== 1 ? ` (at x${r.s})` : ''}`);
      if (verbose) console.log('    ', r.ops.join(' '));
      tot.refN += ref.notes.length; tot.refOk += r.ok; tot.refExtra += r.extra; tot.refMiss += r.miss; tot.refDur += r.durOk; tot.refPairs += r.pairs;
    }
    if (verbose) { console.log('   ', rows.join(' ')); if (extra.length) console.log('    extra:', extra.join(' ')); }
    tot.truth += truth.length; tot.det += det.length; tot.hit += hit; tot.pitchOk += pOk; tot.pitchN += pN; tot.meterOk += mOk; tot.songs++;
  }
  const P = tot.hit / tot.det, R = tot.hit / tot.truth;
  console.log(`\nALL ${which}: syllables found ${(100 * R).toFixed(1)}%  precision ${(100 * P).toFixed(1)}%  F1 ${(200 * P * R / (P + R)).toFixed(1)}  pitch ${(100 * tot.pitchOk / tot.pitchN).toFixed(1)}%  meter ${tot.meterOk}/${tot.songs}`);
  if (tot.refN) console.log(`SHEET ${which}: right pitch ${(100 * tot.refOk / tot.refN).toFixed(1)}%  missing ${tot.refMiss}  extra ${tot.refExtra}  right note value ${(100 * tot.refDur / Math.max(1, tot.refPairs)).toFixed(1)}%  (of ${tot.refN} notes)`);
}
if (!(globalThis as { __noRun?: boolean }).__noRun) void run();
