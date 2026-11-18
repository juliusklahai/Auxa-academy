// Humdrum **kern (what the sheet reader writes) -> an editable score -> MusicXML.
// The reader outputs piano music as two spines: the left one is the bass staff, the right one the treble.

export interface SNote { midi: number; step: string; alter: number; octave: number; tie?: 'start' | 'stop' | 'both'; acc?: boolean } // acc: the reader wrote an accidental (#, - or n)
export interface SEvent { t: number; dur: number; notes: SNote[]; staff: 1 | 2; voice: number; grace?: boolean } // notes: [] is a rest
export interface SMeasure { events: SEvent[]; key?: number; time?: [number, number]; clef?: { 1?: string; 2?: string }; system: number; notes?: string[] }
export interface SScore { title: string; composer: string; rights: string; key: number; time: [number, number]; clefs: { 1: string; 2: string }; measures: SMeasure[] }

const STEPS = 'CDEFGAB';
const SEMI = [0, 2, 4, 5, 7, 9, 11];
export const midiOf = (step: string, alter: number, octave: number) => 12 * (octave + 1) + SEMI[STEPS.indexOf(step)] + alter;

/** One kern note or rest token, e.g. "8f#L", "2.GG", "4r", "[4cc", "16dd-J". */
export function parseToken(tok: string): { dur: number; note: SNote | null; grace: boolean } | null {
  const m = /(\d+)(\.*)/.exec(tok);
  const grace = /[qQ]/.test(tok);
  let dur = 0;
  if (m) {
    const d = parseInt(m[1], 10);
    dur = d === 0 ? 8 : 4 / d; // 0 is a breve
    let add = dur / 2;
    for (let i = 0; i < m[2].length; i++) { dur += add; add /= 2; }
  }
  if (/r/.test(tok)) return { dur, note: null, grace };
  const p = /([a-gA-G])\1*/.exec(tok);
  if (!p) return null;
  const letters = p[0];
  const lower = letters[0] === letters[0].toLowerCase();
  const octave = lower ? 3 + letters.length : 4 - letters.length;
  const step = letters[0].toUpperCase();
  const rest = tok.slice(p.index + letters.length);
  let alter = 0;
  const acc = /^(#+|-+|n)?/.exec(rest)?.[0] ?? '';
  if (acc.startsWith('#')) alter = acc.length; else if (acc.startsWith('-')) alter = -acc.length;
  let tie: SNote['tie'];
  if (tok.includes('[')) tie = 'start'; else if (tok.includes(']')) tie = 'stop'; else if (tok.includes('_')) tie = 'both';
  return { dur, note: { midi: midiOf(step, alter, octave), step, alter, octave, tie, acc: acc.length > 0 || undefined }, grace };
}

const keyFifths = (k: string) => { const inner = /\[(.*)\]/.exec(k)?.[1] ?? ''; const sharps = (inner.match(/#/g) || []).length; const flats = (inner.match(/-/g) || []).length; return sharps - flats; };
const clefOf = (s: string) => s.replace('*clef', ''); // G2, F4, C3 ...

interface Spine { staff: 1 | 2; voice: number; busy: number }

/**
 * Parse kern text. `systemOf(line)` is not needed: callers join systems with a "!!system N" comment line,
 * which marks the system each following measure came from (used to point at the right picture when fixing).
 */
export function parseKern(text: string, meta: Partial<Pick<SScore, 'title' | 'composer' | 'rights'>> = {}): SScore {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length);
  let spines: Spine[] = [{ staff: 2, voice: 1, busy: 0 }, { staff: 1, voice: 1, busy: 0 }];
  const sc: SScore = { title: meta.title ?? 'Scanned score', composer: meta.composer ?? '', rights: meta.rights ?? '', key: 0, time: [4, 4], clefs: { 1: 'G2', 2: 'F4' }, measures: [] };
  let system = 0;
  let t = 0; // time inside the current measure, in quarters
  let cur: SMeasure = { events: [], system };
  let started = false;
  const now = { clefs: { 1: 'G2', 2: 'F4' } as Record<number, string>, key: 0, time: [4, 4] as [number, number] }; // what is in force
  const flush = () => { if (cur.events.length || cur.key !== undefined || cur.time || cur.clef) sc.measures.push(cur); cur = { events: [], system }; t = 0; spines.forEach((s) => (s.busy = 0)); };
  for (const line of lines) {
    if (line.startsWith('!!system')) { if (cur.events.length) flush(); system = parseInt(line.slice(8), 10) || 0; cur.system = system; spines = [{ staff: 2, voice: 1, busy: 0 }, { staff: 1, voice: 1, busy: 0 }]; continue; }
    if (line.startsWith('!') || line.startsWith('**')) continue;
    const cols = line.split('\t');
    if (line.startsWith('*')) {
      // spine splits and merges change the column layout
      if (cols.some((c) => c === '*^' || c === '*v' || c === '*-')) {
        const next: Spine[] = [];
        for (let i = 0; i < cols.length && i < spines.length; i++) {
          const c = cols[i], s = spines[i];
          if (c === '*^') { next.push({ ...s }, { staff: s.staff, voice: s.voice + 1, busy: s.busy }); }
          else if (c === '*v') { if (cols[i - 1] === '*v' && next.length && next[next.length - 1].staff === s.staff) { next[next.length - 1].busy = Math.max(next[next.length - 1].busy, s.busy); continue; } next.push({ ...s }); }
          else if (c === '*-') continue;
          else next.push(s);
        }
        // voice numbers restart from 1 in each staff after a merge
        if (next.length) spines = next.map((s, i) => ({ ...s, voice: 1 + next.slice(0, i).filter((o) => o.staff === s.staff).length }));
        continue;
      }
      cols.forEach((c, i) => {
        const sp = spines[i];
        if (!sp) return;
        if (c.startsWith('*clef')) { const cl = clefOf(c); if (!started) sc.clefs[sp.staff] = cl as never; else if (cl !== now.clefs[sp.staff]) (cur.clef ??= {})[sp.staff] = cl; now.clefs[sp.staff] = cl; }
        else if (c.startsWith('*k[')) { const k = keyFifths(c); if (!started) sc.key = k; else if (k !== now.key) cur.key = k; now.key = k; }
        else if (/^\*M\d+\/\d+/.test(c)) { const [n, d] = c.slice(2).split('/').map(Number); if (!started) sc.time = [n, d]; else if (n !== now.time[0] || d !== now.time[1]) cur.time = [n, d]; now.time = [n, d]; }
      });
      continue;
    }
    if (line.startsWith('=')) { started = true; flush(); continue; }
    // a data line: every column with a token starts an event now; the line lasts until the next event starts
    started = true;
    cols.forEach((c, i) => {
      const sp = spines[i];
      if (!sp || c === '.' || !c.trim()) return;
      const parts = c.split(' ').map(parseToken).filter((x): x is NonNullable<ReturnType<typeof parseToken>> => !!x);
      if (!parts.length) return;
      const dur = parts.find((p) => p.dur > 0)?.dur ?? 0;
      const grace = parts.every((p) => p.grace);
      const notes = parts.map((p) => p.note).filter((n): n is SNote => !!n);
      cur.events.push({ t, dur: grace ? 0 : dur, notes, staff: sp.staff, voice: sp.voice, grace: grace || undefined });
      if (!grace) sp.busy = t + dur;
    });
    const nextT = Math.min(...spines.map((s) => s.busy).filter((b) => b > t + 1e-9), Infinity);
    if (Number.isFinite(nextT)) t = nextT;
  }
  flush();
  applyKey(sc);
  fixTimeChanges(sc);
  return sc;
}

/** Steps the key signature raises or lowers: 2 sharps -> F and C up. */
export function keyAlters(fifths: number): Record<string, number> {
  const r: Record<string, number> = {};
  if (fifths > 0) 'FCGDAEB'.slice(0, fifths).split('').forEach((s) => (r[s] = 1));
  if (fifths < 0) 'BEADGCF'.slice(0, -fifths).split('').forEach((s) => (r[s] = -1));
  return r;
}

/**
 * The reader often writes a note the way it is printed: with no sharp or flat when the key signature
 * or an accidental earlier in the bar supplies it. A note with no accidental of its own takes the one
 * written earlier in the bar (same staff and octave), or else the key signature's.
 */
export function applyKey(sc: SScore) {
  let key = sc.key;
  for (const m of sc.measures) {
    if (m.key !== undefined) key = m.key;
    const ka = keyAlters(key);
    const inBar = new Map<string, number>(); // accidentals written earlier in this bar hold until the barline
    for (const e of [...m.events].sort((a, b) => a.t - b.t)) {
      for (const n of e.notes) {
        const id = `${e.staff}|${n.step}${n.octave}`;
        if (n.acc) { inBar.set(id, n.alter); continue; }
        if (n.tie === 'stop' || n.tie === 'both') continue;
        const a = inBar.has(id) ? inBar.get(id)! : ka[n.step] ?? 0;
        if (a !== n.alter && n.alter === 0) { n.alter = a; n.midi = midiOf(n.step, n.alter, n.octave); }
      }
    }
  }
}

/**
 * The reader sometimes invents a time signature at the start of a new line. Keep a change only when
 * the bars that follow (up to the next change) fit it better than the old one.
 */
export function fixTimeChanges(sc: SScore) {
  let cur = sc.time;
  sc.measures.forEach((m, i) => {
    if (!m.time) return;
    const next = sc.measures.findIndex((x, j) => j > i && x.time);
    const span = sc.measures.slice(i, next < 0 ? undefined : next);
    const fits = (ts: [number, number]) => span.filter((x) => { const l = barFill(x); return l > 0 && Math.abs(l - measureLen(ts)) < 1e-6; }).length;
    if (fits(m.time) <= fits(cur)) delete m.time; else cur = m.time;
  });
}
/** The longest voice in a bar, in quarters. */
export function barFill(m: SMeasure) {
  let best = 0;
  for (const k of new Set(m.events.filter((e) => !e.grace).map((e) => `${e.staff}|${e.voice}`))) {
    const evs = m.events.filter((e) => !e.grace && `${e.staff}|${e.voice}` === k);
    best = Math.max(best, ...evs.map((e) => e.t + e.dur));
  }
  return best;
}

// ---------- checks ----------
export const measureLen = (time: [number, number]) => (time[0] * 4) / time[1];
/** Time signature in force at each measure. */
export function timesOf(sc: SScore) { let ts = sc.time; return sc.measures.map((m) => (ts = m.time ?? ts)); }

/** Bars whose notes do not add up to the time signature (the first bar may be a pickup, the last may be short). */
export function badBars(sc: SScore): { index: number; why: string }[] {
  const out: { index: number; why: string }[] = [];
  const ts = timesOf(sc);
  sc.measures.forEach((m, i) => {
    const want = measureLen(ts[i]);
    for (const staff of [1, 2] as const) {
      const evs = m.events.filter((e) => e.staff === staff && !e.grace);
      if (!evs.length) continue;
      const voices = [...new Set(evs.map((e) => e.voice))];
      for (const v of voices) {
        const end = Math.max(...evs.filter((e) => e.voice === v).map((e) => e.t + e.dur));
        const sum = evs.filter((e) => e.voice === v).reduce((a, e) => a + e.dur, 0);
        const got = Math.max(end, sum);
        if (Math.abs(got - want) < 1e-6) continue;
        if ((i === 0 || i === sc.measures.length - 1) && got < want) continue; // pickup or short last bar
        const hand = staff === 1 ? 'right hand' : 'left hand';
        out.push({ index: i, why: got > want ? `The ${hand} has ${fmtBeats(got, ts[i])}, but the bar holds ${fmtBeats(want, ts[i])}.` : `The ${hand} has only ${fmtBeats(got, ts[i])}; the bar needs ${fmtBeats(want, ts[i])}.` });
        return;
      }
    }
  });
  return out;
}
const fmtBeats = (q: number, ts: [number, number]) => { const b = (q * ts[1]) / 4; const s = Number.isInteger(b) ? String(b) : b.toFixed(2).replace(/0$/, ''); return `${s} beat${b === 1 ? '' : 's'}`; };

/** Same notes in both bars. */
export function sameBar(a: SMeasure, b: SMeasure) {
  const sig = (m: SMeasure) => m.events.map((e) => `${e.t}|${e.dur}|${e.staff}|${e.voice}|${e.notes.map((n) => n.midi).join(',')}`).sort().join(';');
  return sig(a) === sig(b);
}

/**
 * The reader sometimes writes a bar twice. When a line has more bars than the picture shows,
 * drop repeated bars in that line until the counts match. Returns how many were removed.
 */
export function dropRepeats(sc: SScore, barsInPicture: Record<number, number>): number {
  let removed = 0;
  for (const [sys, want] of Object.entries(barsInPicture).map(([k, v]) => [Number(k), v] as const)) {
    if (!want) continue;
    let idx = sc.measures.map((m, i) => (m.system === sys ? i : -1)).filter((i) => i >= 0);
    while (idx.length > want) {
      const j = idx.findIndex((x, k) => k > 0 && sameBar(sc.measures[idx[k - 1]], sc.measures[x]));
      if (j < 0) break;
      sc.measures.splice(idx[j], 1); removed++;
      idx = sc.measures.map((m, i) => (m.system === sys ? i : -1)).filter((i) => i >= 0);
    }
  }
  return removed;
}

// ---------- MusicXML ----------
const DIV = 96;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TYPES: [number, string][] = [[8, 'breve'], [4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd'], [0.0625, '64th']];
function noteType(dur: number): { type: string; dots: number; tuplet?: [number, number] } {
  for (const [v, n] of TYPES) {
    if (Math.abs(dur - v) < 1e-6) return { type: n, dots: 0 };
    if (Math.abs(dur - v * 1.5) < 1e-6) return { type: n, dots: 1 };
    if (Math.abs(dur - v * 1.75) < 1e-6) return { type: n, dots: 2 };
  }
  for (const [v, n] of TYPES) if (Math.abs(dur - (v * 2) / 3) < 1e-6) return { type: n, dots: 0, tuplet: [3, 2] };
  for (const [v, n] of TYPES) if (Math.abs(dur - (v * 4) / 5) < 1e-6) return { type: n, dots: 0, tuplet: [5, 4] };
  return { type: 'quarter', dots: 0 };
}
const clefXml = (c: string, n: number) => `<clef number="${n}"><sign>${c[0] === 'G' || c[0] === 'F' || c[0] === 'C' ? c[0] : 'G'}</sign><line>${c[1] ?? (c[0] === 'F' ? 4 : 2)}</line></clef>`;

export function toMusicXml(sc: SScore): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  out.push('<score-partwise version="4.0">');
  out.push(`<work><work-title>${esc(sc.title)}</work-title></work>`);
  out.push('<identification>' + (sc.composer ? `<creator type="composer">${esc(sc.composer)}</creator>` : '') + (sc.rights ? `<rights>${esc(sc.rights)}</rights>` : '') + '<encoding><software>Auxa sheet scan</software></encoding></identification>');
  out.push('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">');
  const ts = timesOf(sc);
  sc.measures.forEach((m, i) => {
    const len = measureLen(ts[i]);
    out.push(`<measure number="${i + 1}">`);
    const attr: string[] = [];
    if (i === 0) attr.push(`<divisions>${DIV}</divisions><key><fifths>${sc.key}</fifths></key><time><beats>${sc.time[0]}</beats><beat-type>${sc.time[1]}</beat-type></time><staves>2</staves>${clefXml(sc.clefs[1], 1)}${clefXml(sc.clefs[2], 2)}`);
    else {
      if (m.key !== undefined) attr.push(`<key><fifths>${m.key}</fifths></key>`);
      if (m.time) attr.push(`<time><beats>${m.time[0]}</beats><beat-type>${m.time[1]}</beat-type></time>`);
      if (m.clef?.[1]) attr.push(clefXml(m.clef[1], 1));
      if (m.clef?.[2]) attr.push(clefXml(m.clef[2], 2));
    }
    if (attr.length) out.push(`<attributes>${attr.join('')}</attributes>`);
    let pos = 0; // where the writer is in the bar, in divisions
    const groups = [...new Set(m.events.map((e) => `${e.staff}|${e.voice}`))].sort();
    if (!groups.length) groups.push('1|1');
    const barEnd = Math.max(len, ...m.events.map((e) => e.t + e.dur));
    for (const g of groups) {
      const [staff, voice] = g.split('|').map(Number);
      const vNum = (staff - 1) * 4 + voice;
      const evs = m.events.filter((e) => e.staff === staff && e.voice === voice).sort((a, b) => a.t - b.t);
      if (pos > 0) { out.push(`<backup><duration>${pos}</duration></backup>`); pos = 0; }
      for (const e of evs) {
        const at = Math.round(e.t * DIV);
        if (at > pos) { out.push(`<forward><duration>${at - pos}</duration><voice>${vNum}</voice><staff>${staff}</staff></forward>`); pos = at; }
        if (at < pos) continue; // overlaps inside one voice cannot be written; skip
        const d = Math.round(e.dur * DIV);
        const nt = noteType(e.dur);
        const typeXml = `<type>${nt.type}</type>${'<dot/>'.repeat(nt.dots)}${nt.tuplet ? `<time-modification><actual-notes>${nt.tuplet[0]}</actual-notes><normal-notes>${nt.tuplet[1]}</normal-notes></time-modification>` : ''}`;
        if (!e.notes.length) {
          const whole = Math.abs(e.dur - len) < 1e-6 && e.t === 0;
          out.push(`<note><rest${whole ? ' measure="yes"' : ''}/><duration>${d}</duration><voice>${vNum}</voice>${whole ? '' : typeXml}<staff>${staff}</staff></note>`);
        } else {
          e.notes.forEach((n, k) => {
            const ties = n.tie === 'start' ? ['start'] : n.tie === 'stop' ? ['stop'] : n.tie === 'both' ? ['stop', 'start'] : [];
            out.push(`<note>${e.grace ? '<grace/>' : ''}${k ? '<chord/>' : ''}<pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ''}<octave>${n.octave}</octave></pitch>${e.grace ? '' : `<duration>${d}</duration>`}${ties.map((x) => `<tie type="${x}"/>`).join('')}<voice>${vNum}</voice>${typeXml}<staff>${staff}</staff>${ties.length ? `<notations>${ties.map((x) => `<tied type="${x}"/>`).join('')}</notations>` : ''}</note>`);
          });
        }
        if (!e.grace) pos += d;
      }
    }
    const endDiv = Math.round(barEnd * DIV);
    if (pos < endDiv && pos > 0) { /* the writer may stop early; MusicXML allows it */ }
    out.push('</measure>');
  });
  out.push('</part></score-partwise>');
  return out.join('\n');
}

/** Join the reader's per-line outputs into one kern text, marking where each line starts. */
export function joinSystems(kerns: string[]): string {
  const out: string[] = ['**kern\t**kern'];
  kerns.forEach((k, i) => {
    const ls = k.split('\n').filter((l) => l.trim() && !l.startsWith('*-') && !l.startsWith('**'));
    out.push(`!!system ${i}`);
    out.push(...ls.map((l) => (l === '==\t==' ? '=\t=' : l)));
  });
  out.push('*-\t*-');
  return out.join('\n');
}
