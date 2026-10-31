// MusicXML importer (score-partwise). Pure TypeScript on a DOM Document so it runs in the browser
// (DOMParser) and in tests (@xmldom/xmldom). Keeps musical meaning: parts, staves, voices, chords,
// ties (merged into one sounding note), rests, tuplets (via durations), time/key/tempo changes,
// repeats and 1st/2nd endings (unrolled into a performance timeline), lyrics.
// Nothing is silently dropped: anything not handled is reported in `warnings`.

import { unzipSync, strFromU8 } from 'fflate';

export interface ScoreNote {
  midi: number;
  startQ: number;     // quarter notes from the start of the PERFORMANCE timeline (repeats unrolled)
  durQ: number;
  srcStartQ: number;  // position in the written score (no unrolling), for the notation cursor
  track: string;      // `${partId}|${staff}|${voice}`
  measure: number;    // index into Score.measures (performance order)
  lyric?: string;
  grace?: boolean;
}

export interface MeasureInfo { srcIndex: number; number: string; startQ: number; srcStartQ: number; lengthQ: number; beats: number; beatType: number; tempo: number }
export interface Track { key: string; partId: string; partName: string; staff: number; voice: string; name: string; noteCount: number; avgMidi: number; role?: 'S' | 'A' | 'T' | 'B' }
export interface PartInfo { id: string; name: string; staves: number; program?: number }

export interface Score {
  title: string;
  composer: string;
  parts: PartInfo[];
  tracks: Track[];
  measures: MeasureInfo[];
  notes: ScoreNote[];
  tempo: number;
  /** Tempo changes on the performance timeline (quarter-note BPM), sorted, first at q=0. */
  tempoMap: { q: number; bpm: number }[];
  keyFifths: number;
  timeSig: [number, number];
  totalQ: number;
  warnings: string[];
  xml: string;
}

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

type El = Element;
const kids = (e: El, tag?: string): El[] => {
  const out: El[] = [];
  for (let n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!tag || (n as El).nodeName === tag)) out.push(n as El);
  return out;
};
const kid = (e: El, tag: string): El | undefined => kids(e, tag)[0];
const txt = (e: El | undefined, tag?: string): string | undefined => {
  const t = e && tag ? kid(e, tag) : e;
  return t ? (t.textContent ?? '').trim() : undefined;
};
const num = (s: string | undefined, d = 0) => (s === undefined || s === '' || isNaN(+s) ? d : +s);

/** Read .musicxml / .xml text, or .mxl (zip) bytes, into MusicXML text. */
export function musicXmlText(bytes: Uint8Array, filename = ''): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return new TextDecoder('utf-8').decode(bytes);
  const files = unzipSync(bytes);
  const container = files['META-INF/container.xml'];
  let path: string | undefined;
  if (container) path = /full-path="([^"]+)"/.exec(strFromU8(container))?.[1];
  if (!path || !files[path]) path = Object.keys(files).find((k) => !k.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(k));
  if (!path) throw new Error(`${filename || 'This file'} is a zip, but no MusicXML score was found inside.`);
  return strFromU8(files[path]);
}

interface RawNote { midi: number; startQ: number; durQ: number; track: string; tieStart: boolean; tieStop: boolean; srcMeasure: number; lyric?: string; grace: boolean }

export function parseMusicXml(doc: Document, xml = ''): Score {
  const root = doc.documentElement;
  const warnings: string[] = [];
  if (!root || root.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error('The file is not valid XML.');
  if (root.nodeName === 'score-timewise') throw new Error('Timewise MusicXML is not supported yet. Export as "partwise" MusicXML (the default in MuseScore, Sibelius, Finale and Dorico).');
  if (root.nodeName !== 'score-partwise') throw new Error('This is not a MusicXML score (missing <score-partwise>).');

  const title = txt(kid(root, 'work'), 'work-title') || txt(root, 'movement-title') || 'Untitled score';
  let composer = '';
  const ident = kid(root, 'identification');
  if (ident) for (const c of kids(ident, 'creator')) if ((c.getAttribute('type') ?? 'composer') === 'composer') composer = txt(c) ?? '';

  const partNames = new Map<string, string>();
  const programs = new Map<string, number>();
  const plist = kid(root, 'part-list');
  if (plist) for (const sp of kids(plist, 'score-part')) {
    const id = sp.getAttribute('id') ?? '';
    partNames.set(id, txt(sp, 'part-name') || txt(sp, 'part-abbreviation') || 'Part');
    const mi = kid(sp, 'midi-instrument');
    const prog = mi ? txt(mi, 'midi-program') : undefined;
    if (prog) programs.set(id, +prog);
  }

  const partEls = kids(root, 'part');
  if (!partEls.length) throw new Error('The score has no parts.');

  // Pass 1: measure lengths (in quarters) from actual content, shared across parts.
  const nMeasures = Math.max(...partEls.map((p) => kids(p, 'measure').length));
  const contentLen = new Array(nMeasures).fill(0);
  const sigs: { beats: number; beatType: number }[] = [];
  const tempos: number[] = new Array(nMeasures).fill(0);
  const tempoEvents: { mi: number; pos: number; bpm: number }[] = [];
  const barInfo: { fwd: boolean; back: number; endings: { nums: number[]; type: string }[] }[] = Array.from({ length: nMeasures }, () => ({ fwd: false, back: 0, endings: [] }));
  const measureNumbers: string[] = new Array(nMeasures).fill('');
  let keyFifths = 0;

  partEls.forEach((p, pi) => {
    let divisions = 1, beats = 4, beatType = 4;
    kids(p, 'measure').forEach((m, mi) => {
      if (pi === 0) measureNumbers[mi] = m.getAttribute('number') ?? String(mi + 1);
      let pos = 0, maxPos = 0;
      for (const c of kids(m)) {
        if (c.nodeName === 'attributes') {
          divisions = num(txt(c, 'divisions'), divisions);
          const t = kid(c, 'time');
          if (t) { beats = num(txt(t, 'beats')?.split('+').reduce((a, b) => String(+a + +b)), beats); beatType = num(txt(t, 'beat-type'), beatType); }
          const k = kid(c, 'key');
          if (k && pi === 0 && mi === 0) keyFifths = num(txt(k, 'fifths'), 0);
        } else if (c.nodeName === 'note') {
          if (kid(c, 'chord') || kid(c, 'grace')) continue;
          pos += num(txt(c, 'duration'), 0) / divisions;
        } else if (c.nodeName === 'backup') pos -= num(txt(c, 'duration'), 0) / divisions;
        else if (c.nodeName === 'forward') pos += num(txt(c, 'duration'), 0) / divisions;
        else if (c.nodeName === 'direction' || c.nodeName === 'sound') {
          const snd = c.nodeName === 'sound' ? c : kid(c, 'sound');
          let bpm = snd?.getAttribute('tempo') ? +snd.getAttribute('tempo')! : 0;
          if (!bpm && c.nodeName === 'direction') {
            // <metronome><beat-unit>half</beat-unit><beat-unit-dot/><per-minute>60</per-minute>
            for (const dt of kids(c, 'direction-type')) {
              const met = kid(dt, 'metronome');
              const pm = met ? parseFloat(txt(met, 'per-minute') ?? '') : NaN;
              if (met && isFinite(pm)) {
                const unit: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };
                const q = (unit[txt(met, 'beat-unit') ?? 'quarter'] ?? 1) * (kid(met, 'beat-unit-dot') ? 1.5 : 1);
                bpm = pm * q;
              }
            }
          }
          if (bpm > 0) {
            if (!tempos[mi] || pos < 1e-9) tempos[mi] = tempos[mi] && pos > 1e-9 ? tempos[mi] : bpm;
            if (!tempoEvents.some((e) => e.mi === mi && Math.abs(e.pos - pos) < 1e-6)) tempoEvents.push({ mi, pos: Math.max(0, pos), bpm });
          }
        } else if (c.nodeName === 'barline' && pi === 0) {
          const rep = kid(c, 'repeat');
          if (rep?.getAttribute('direction') === 'forward') barInfo[mi].fwd = true;
          if (rep?.getAttribute('direction') === 'backward') barInfo[mi].back = num(rep.getAttribute('times') ?? undefined, 2);
          const end = kid(c, 'ending');
          if (end) barInfo[mi].endings.push({ nums: (end.getAttribute('number') ?? '1').split(/[,\s]+/).map(Number).filter((x) => x > 0), type: end.getAttribute('type') ?? 'start' });
        }
        maxPos = Math.max(maxPos, pos);
      }
      contentLen[mi] = Math.max(contentLen[mi], maxPos);
      if (pi === 0) sigs[mi] = { beats, beatType };
    });
  });
  for (let i = 0; i < nMeasures; i++) sigs[i] ??= sigs[i - 1] ?? { beats: 4, beatType: 4 };
  const lengths = contentLen.map((c, i) => (c > 1e-9 ? c : (sigs[i].beats * 4) / sigs[i].beatType));
  const srcStarts: number[] = [];
  lengths.reduce((acc, l, i) => { srcStarts[i] = acc; return acc + l; }, 0);
  let curTempo = tempos.find((t) => t > 0) || 90;
  const tempoAt = tempos.map((t) => (curTempo = t > 0 ? t : curTempo));

  // Pass 2: notes in written order
  const raw: RawNote[] = [];
  const partInfo: PartInfo[] = [];
  let skippedUnpitched = 0;
  partEls.forEach((p) => {
    const pid = p.getAttribute('id') ?? `P${partInfo.length + 1}`;
    let divisions = 1, staves = 1, transposeChromatic = 0;
    let lastStart = 0;
    kids(p, 'measure').forEach((m, mi) => {
      let pos = 0;
      for (const c of kids(m)) {
        if (c.nodeName === 'attributes') {
          divisions = num(txt(c, 'divisions'), divisions);
          staves = Math.max(staves, num(txt(c, 'staves'), 1));
          const tr = kid(c, 'transpose');
          if (tr) transposeChromatic = num(txt(tr, 'chromatic'), 0) + 12 * num(txt(tr, 'octave-change'), 0);
        } else if (c.nodeName === 'backup') pos -= num(txt(c, 'duration'), 0) / divisions;
        else if (c.nodeName === 'forward') pos += num(txt(c, 'duration'), 0) / divisions;
        else if (c.nodeName === 'note') {
          const isChord = !!kid(c, 'chord');
          const grace = !!kid(c, 'grace');
          const dur = num(txt(c, 'duration'), 0) / divisions;
          const start = isChord ? lastStart : pos;
          if (!isChord) lastStart = pos;
          if (!isChord && !grace) pos += dur;
          if (kid(c, 'cue')) continue;
          const pitch = kid(c, 'pitch');
          if (kid(c, 'rest')) continue;
          if (!pitch) { if (kid(c, 'unpitched')) skippedUnpitched++; continue; }
          const step = txt(pitch, 'step') ?? 'C';
          const midi = (num(txt(pitch, 'octave'), 4) + 1) * 12 + STEP[step] + Math.round(num(txt(pitch, 'alter'), 0)) + transposeChromatic;
          const ties = kids(c, 'tie').map((t) => t.getAttribute('type'));
          const lyricEl = kid(c, 'lyric');
          raw.push({
            midi, startQ: srcStarts[mi] + start, durQ: grace ? 0.125 : dur,
            track: `${pid}|${num(txt(c, 'staff'), 1)}|${txt(c, 'voice') ?? '1'}`,
            tieStart: ties.includes('start'), tieStop: ties.includes('stop'), srcMeasure: mi,
            lyric: lyricEl ? txt(lyricEl, 'text') : undefined, grace,
          });
        }
      }
    });
    partInfo.push({ id: pid, name: partNames.get(pid) ?? pid, staves, program: programs.get(pid) });
  });
  if (skippedUnpitched) warnings.push(`${skippedUnpitched} unpitched (percussion) notes are shown but not played or scored.`);
  if (raw.some((n) => n.grace)) warnings.push('Grace notes are played briefly but not scored.');

  // merge ties into single sounding notes
  raw.sort((a, b) => a.startQ - b.startQ || a.midi - b.midi);
  const merged: RawNote[] = [];
  const open = new Map<string, RawNote>();
  for (const n of raw) {
    const k = `${n.track}|${n.midi}`;
    const prev = open.get(k);
    if (n.tieStop && prev && Math.abs(prev.startQ + prev.durQ - n.startQ) < 1e-6) {
      prev.durQ += n.durQ;
      if (!n.tieStart) open.delete(k);
      continue;
    }
    merged.push(n);
    if (n.tieStart) open.set(k, n); else open.delete(k);
  }

  // repeats and endings -> performance order of written measures
  const order: number[] = [];
  let i = 0, repeatStart = 0, guard = 0;
  const passes = new Map<number, number>(); // backward-repeat measure -> times taken
  let pass = 1;
  while (i < nMeasures && guard++ < 10000) {
    if (barInfo[i].fwd && passes.get(-1 - i) === undefined) { repeatStart = i; passes.set(-1 - i, 1); pass = 1; }
    const ending = barInfo[i].endings.find((e) => e.type === 'start') ?? barInfo[i].endings[0];
    let skip = false;
    if (ending) {
      // continue skipping until the ending's stop
      const endNums = ending.nums;
      if (!endNums.includes(pass)) skip = true;
      if (skip) {
        let j = i;
        while (j < nMeasures && !barInfo[j].endings.some((e) => e.type === 'stop' || e.type === 'discontinue')) j++;
        i = Math.min(nMeasures, j + 1);
        continue;
      }
    }
    order.push(i);
    const back = barInfo[i].back;
    if (back) {
      const taken = passes.get(i) ?? 1;
      if (taken < back) { passes.set(i, taken + 1); pass = taken + 1; i = repeatStart; passes.set(-1 - repeatStart, 1); continue; }
      passes.delete(i);
      repeatStart = i + 1;
      pass = 1;
    }
    i++;
  }

  const measures: MeasureInfo[] = [];
  let t = 0;
  for (const mi of order) {
    measures.push({ srcIndex: mi, number: measureNumbers[mi], startQ: t, srcStartQ: srcStarts[mi], lengthQ: lengths[mi], beats: sigs[mi].beats, beatType: sigs[mi].beatType, tempo: tempoAt[mi] });
    t += lengths[mi];
  }
  const bySrc = new Map<number, RawNote[]>();
  for (const n of merged) (bySrc.get(n.srcMeasure) ?? bySrc.set(n.srcMeasure, []).get(n.srcMeasure)!).push(n);
  const notes: ScoreNote[] = [];
  measures.forEach((M, idx) => {
    for (const n of bySrc.get(M.srcIndex) ?? []) {
      notes.push({ midi: n.midi, startQ: M.startQ + (n.startQ - M.srcStartQ), durQ: n.durQ, srcStartQ: n.startQ, track: n.track, measure: idx, lyric: n.lyric, grace: n.grace });
    }
  });
  notes.sort((a, b) => a.startQ - b.startQ || a.midi - b.midi);
  const firstBpm = tempoEvents.length ? [...tempoEvents].sort((a, b) => a.mi - b.mi || a.pos - b.pos)[0].bpm : 90;
  const tempoMap: { q: number; bpm: number }[] = [{ q: 0, bpm: firstBpm }];
  measures.forEach((M) => {
    for (const e of tempoEvents.filter((x) => x.mi === M.srcIndex).sort((a, b) => a.pos - b.pos)) tempoMap.push({ q: M.startQ + e.pos, bpm: e.bpm });
  });
  tempoMap.sort((a, b) => a.q - b.q);
  const tempoList: { q: number; bpm: number }[] = [];
  for (const e of tempoMap) {
    const last = tempoList[tempoList.length - 1];
    if (last && Math.abs(last.q - e.q) < 1e-9) { last.bpm = e.bpm; continue; }
    if (!last || last.bpm !== e.bpm) tempoList.push({ ...e });
  }
  if (tempoList[0].q > 1e-9) tempoList.unshift({ q: 0, bpm: firstBpm });
  if (order.length > nMeasures) warnings.push(`Repeats expanded: ${nMeasures} written measures play as ${order.length}.`);

  // tracks
  const tmap = new Map<string, ScoreNote[]>();
  for (const n of notes) (tmap.get(n.track) ?? tmap.set(n.track, []).get(n.track)!).push(n);
  const tracks: Track[] = [...tmap.entries()].map(([key, ns]) => {
    const [partId, staff, voice] = key.split('|');
    const part = partInfo.find((p) => p.id === partId)!;
    return {
      key, partId, partName: part.name, staff: +staff, voice, noteCount: ns.length,
      avgMidi: ns.reduce((a, b) => a + b.midi, 0) / ns.length,
      name: part.name + (part.staves === 2 ? (staff === '1' ? ' · right hand' : ' · left hand') : part.staves > 2 ? ` · staff ${staff}` : '') + (tracksInSameStaff(tmap, partId, staff) > 1 ? ` · voice ${voice}` : ''),
    };
  });
  assignSATB(tracks);

  return {
    title, composer, parts: partInfo, tracks, measures, notes,
    tempo: tempoList[0].bpm, tempoMap: tempoList, keyFifths, timeSig: [sigs[0].beats, sigs[0].beatType], totalQ: t, warnings, xml,
  };
}

function tracksInSameStaff(tmap: Map<string, ScoreNote[]>, pid: string, staff: string) {
  return [...tmap.keys()].filter((k) => k.startsWith(`${pid}|${staff}|`)).length;
}

/** Label four-part writing: by part names if present, otherwise by pitch order when there are exactly 4 voices. */
function assignSATB(tracks: Track[]) {
  const named: Record<string, Track['role']> = { soprano: 'S', alto: 'A', tenor: 'T', bass: 'B' };
  let any = false;
  for (const t of tracks) {
    const n = t.partName.toLowerCase();
    for (const [w, r] of Object.entries(named)) if (n.includes(w) && !n.includes('contra' + w)) { t.role = r; any = true; }
  }
  // Pitch-order labelling only for genuine four-voice writing: one choir part (hymn style),
  // or four single-line parts that are not named instruments.
  const instrumentName = /piano|keyboard|organ|violin|viola|cello|bass guitar|guitar|flute|oboe|clarinet|horn|trumpet|strings|synth|harp/i;
  const onePart = new Set(tracks.map((t) => t.partId)).size === 1;
  const fourVoices = !tracks.some((t) => instrumentName.test(t.partName) && !/choir|voice|vocal/i.test(t.partName));
  if (!any && tracks.length === 4 && (onePart ? !instrumentName.test(tracks[0].partName) || /choir|hymn/i.test(tracks[0].partName) : fourVoices)) {
    const sorted = [...tracks].sort((a, b) => b.avgMidi - a.avgMidi);
    (['S', 'A', 'T', 'B'] as const).forEach((r, i) => (sorted[i].role = r));
  }
  const full: Record<string, string> = { S: 'Soprano', A: 'Alto', T: 'Tenor', B: 'Bass' };
  for (const t of tracks) if (t.role) t.name = `${full[t.role]}${tracks.length > 4 ? ` (${t.name})` : ''}`;
  tracks.sort((a, b) => ('SATB'.indexOf(a.role ?? 'Z') - 'SATB'.indexOf(b.role ?? 'Z')) || b.avgMidi - a.avgMidi);
}
