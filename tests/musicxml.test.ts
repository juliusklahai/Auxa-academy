import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { parseMusicXml, musicXmlText } from '../src/musicxml/parse';
import { demoChoraleXml } from '../src/musicxml/demo';

const parse = (xml: string) => parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, xml);
const wrap = (measures: string, parts = '<score-part id="P1"><part-name>Piano</part-name></score-part>', extraParts = '') =>
  `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>T</work-title></work><part-list>${parts}</part-list><part id="P1">${measures}</part>${extraParts}</score-partwise>`;
const n = (step: string, oct: number, dur: number, extra = '') => `<note>${extra.includes('<chord/>') ? '<chord/>' : ''}<pitch><step>${step}</step>${extra.includes('alter') ? '<alter>1</alter>' : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration>${extra.replace('<chord/>', '').replace('alter', '')}</note>`;
const attrs = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';

describe('Test 5: MusicXML import', () => {
  it('reads pitches, accidentals, chords, rests and durations', () => {
    const s = parse(wrap(`<measure number="1">${attrs}${n('C', 4, 1)}${n('E', 4, 1, '<chord/>')}${n('G', 4, 1, '<chord/>')}<note><rest/><duration>1</duration></note>${n('F', 4, 2, 'alter')}</measure>`));
    expect(s.notes.map((x) => [x.midi, x.startQ, x.durQ])).toEqual([[60, 0, 1], [64, 0, 1], [67, 0, 1], [66, 2, 2]]);
    expect(s.timeSig).toEqual([4, 4]);
  });
  it('merges tied notes across a barline into one sounding note', () => {
    const s = parse(wrap(`<measure number="1">${attrs}<note><rest/><duration>3</duration></note>${n('D', 4, 1, '<tie type="start"/>')}</measure><measure number="2">${n('D', 4, 2, '<tie type="stop"/>')}${n('E', 4, 2)}</measure>`));
    expect(s.notes.map((x) => [x.midi, x.startQ, x.durQ])).toEqual([[62, 3, 3], [64, 6, 2]]);
  });
  it('keeps multiple voices on one staff apart (backup)', () => {
    const s = parse(wrap(`<measure number="1">${attrs}${n('E', 5, 4, '<voice>1</voice>')}<backup><duration>4</duration></backup>${n('C', 5, 2, '<voice>2</voice>')}${n('B', 4, 2, '<voice>2</voice>')}</measure>`));
    expect(s.tracks.map((t) => t.voice).sort()).toEqual(['1', '2']);
    expect(s.notes.filter((x) => x.track.endsWith('|2')).map((x) => x.startQ)).toEqual([0, 2]);
  });
  it('expands repeats with first and second endings', () => {
    const m = (i: number, inner: string) => `<measure number="${i}">${i === 1 ? attrs : ''}${inner}</measure>`;
    const xml = wrap(
      m(1, `<barline location="left"><repeat direction="forward"/></barline>${n('C', 4, 4)}`) +
      m(2, `<barline location="left"><ending number="1" type="start"/></barline>${n('D', 4, 4)}<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>`) +
      m(3, `<barline location="left"><ending number="2" type="start"/></barline>${n('E', 4, 4)}<barline location="right"><ending number="2" type="stop"/></barline>`) +
      m(4, n('F', 4, 4)));
    const s = parse(xml);
    expect(s.notes.map((x) => x.midi)).toEqual([60, 62, 60, 64, 65]);
    expect(s.measures.map((x) => x.number)).toEqual(['1', '2', '1', '3', '4']);
    expect(s.notes[2].srcStartQ).toBe(0);
    expect(s.notes[2].startQ).toBe(8);
  });
  it('reads tempo, key and handles a pickup measure', () => {
    const s = parse(wrap(`<measure number="0" implicit="yes"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="100"/></direction>${n('A', 4, 2)}</measure><measure number="1">${n('D', 5, 6)}</measure>`));
    expect(s.tempo).toBe(100);
    expect(s.keyFifths).toBe(2);
    expect(s.notes.map((x) => x.startQ)).toEqual([0, 1]);
  });
  it('opens compressed .mxl files', () => {
    const xml = wrap(`<measure number="1">${attrs}${n('C', 4, 4)}</measure>`);
    const zip = zipSync({ 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'), 'score.xml': strToU8(xml) });
    expect(parse(musicXmlText(zip, 'x.mxl')).notes[0].midi).toBe(60);
  });
  it('rejects non-MusicXML with a clear message', () => {
    expect(() => parse('<html><body/></html>')).toThrow(/not a MusicXML score/);
  });
});

describe('Test 6: four-part (SATB) detection', () => {
  const s = parse(demoChoraleXml());
  it('finds Soprano, Alto, Tenor and Bass on two hymn staves', () => {
    expect(s.tracks.map((t) => t.role)).toEqual(['S', 'A', 'T', 'B']);
    expect(s.tracks.map((t) => t.staff)).toEqual([1, 1, 2, 2]);
    expect(s.measures).toHaveLength(8);
    expect(s.notes.filter((x) => x.lyric).length).toBeGreaterThan(10);
  });
  it('voices never cross and every beat is a full chord', () => {
    const byT = (r: string) => s.notes.filter((x) => s.tracks.find((t) => t.key === x.track)!.role === r);
    const at = (r: string, q: number) => byT(r).find((x) => x.startQ <= q + 1e-9 && q < x.startQ + x.durQ - 1e-9)!.midi;
    for (let q = 0; q < s.totalQ; q++) {
      const [S, A, T, B] = ['S', 'A', 'T', 'B'].map((r) => at(r, q));
      expect(S).toBeGreaterThanOrEqual(A); expect(A).toBeGreaterThanOrEqual(T); expect(T).toBeGreaterThanOrEqual(B);
      expect(new Set([S, A, T, B].map((m) => m % 12)).size).toBeGreaterThanOrEqual(2);
    }
  });
});

import { buildPractice, notesInRange } from '../src/musicxml/practice';
import { AssessmentSession } from '../src/assessment/session';
describe('Test 6: practising one SATB part', () => {
  const s = parse(demoChoraleXml());
  const alto = s.tracks.find((t) => t.role === 'A')!;
  const { exercise } = buildPractice(s, { tracks: [alto.key], fromMeasure: 0, toMeasure: 7, mode: 'wait' }, 76);
  it('scores only the alto notes', () => {
    const altoNotes = s.notes.filter((n) => n.track === alto.key);
    expect(exercise.events.length).toBe(altoNotes.length);
    expect(exercise.events.every((e) => e.pitches.length === 1)).toBe(true);
    const sess = new AssessmentSession(exercise);
    sess.begin();
    altoNotes.forEach((n, i) => sess.input({ midi: n.midi, time: i * 500, source: 'midi', confidence: 1 }));
    expect(sess.report!.score).toBe(100);
  });
  it('accompaniment (other voices) is separate from the scored part', () => {
    const acc = notesInRange(s, 0, 7, new Set(s.tracks.filter((t) => t.key !== alto.key).map((t) => t.key)));
    expect(acc.some((n) => n.track === alto.key)).toBe(false);
    expect(acc.length).toBe(s.notes.length - exercise.events.length);
  });
  it('both piano hands: right-hand staff gives chords of soprano+alto', () => {
    const rh = s.tracks.filter((t) => t.staff === 1).map((t) => t.key);
    const b = buildPractice(s, { tracks: rh, fromMeasure: 2, toMeasure: 3, mode: 'timed' }, 76);
    expect(b.exercise.events[0].pitches.length).toBeGreaterThanOrEqual(1);
    expect(b.exercise.events[0].hand).toBe('RH');
    expect(b.exercise.events[0].beat).toBe(0);
  });
});

import { Timeline } from '../src/musicxml/tempo';
describe('Tempo changes', () => {
  const xml = wrap(
    `<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>${n('C', 4, 4)}</measure>` +
    `<measure number="2"><direction><sound tempo="120"/></direction>${n('D', 4, 2)}<direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>30</per-minute></metronome></direction-type></direction>${n('E', 4, 2)}</measure>`);
  const s = parse(xml);
  it('reads tempo changes including mid-measure and metronome-only marks', () => {
    expect(s.tempoMap).toEqual([{ q: 0, bpm: 60 }, { q: 4, bpm: 120 }, { q: 6, bpm: 60 }]);
  });
  it('maps score positions to time through every change', () => {
    const tl = new Timeline(s.tempoMap, 0, 100);
    expect(tl.msAt(4)).toBe(4000);       // 4 beats at 60
    expect(tl.msAt(6)).toBe(5000);       // + 2 beats at 120
    expect(tl.msAt(8)).toBe(7000);       // + 2 beats at 60
    expect(tl.qAt(4500)).toBeCloseTo(5);
    expect(new Timeline(s.tempoMap, 0, 50).msAt(4)).toBe(8000);
    expect(new Timeline(s.tempoMap, 0, 100, false).msAt(8)).toBe(8000); // follow off = first tempo
    expect(new Timeline(s.tempoMap, 4, 100).msAt(6)).toBe(1000);        // starting mid-piece
  });
});

import { transposedKey } from '../src/ui/keyname';
describe('Transposition', () => {
  const s = parse(demoChoraleXml());
  it('demo chorale carries its tempo changes', () => {
    expect(s.tempoMap.map((t) => t.bpm)).toEqual([76, 88, 60]);
  });
  it('transposes practice targets and names the new key', () => {
    const alto = s.tracks.find((t) => t.role === 'A')!;
    const b0 = buildPractice(s, { tracks: [alto.key], fromMeasure: 0, toMeasure: 0, mode: 'wait' }, 76);
    const b2 = buildPractice(s, { tracks: [alto.key], fromMeasure: 0, toMeasure: 0, mode: 'wait', transpose: 2 }, 76);
    expect(b2.exercise.events.map((e) => e.pitches[0])).toEqual(b0.exercise.events.map((e) => e.pitches[0] + 2));
    expect(transposedKey(0, 2)).toBe('D major');
    expect(transposedKey(1, -2)).toBe('F major');
    expect(transposedKey(-3, -12)).toBe('Eb major');
  });
});

describe('MusicXML fingering for the guide hands', () => {
  it('reads <technical><fingering> and carries it into practice events', async () => {
    const { buildPractice: bp } = await import('../src/musicxml/practice');
    const f = (k: number) => `<notations><technical><fingering>${k}</fingering></technical></notations>`;
    const s = parse(wrap(`<measure number="1">${attrs}${n('C', 4, 1, f(1))}${n('D', 4, 1, f(2))}${n('E', 4, 1)}${n('F', 4, 1, f(1))}</measure>`));
    expect(s.notes.map((x) => x.finger)).toEqual([1, 2, undefined, 1]);
    const b = bp(s, { tracks: s.tracks.map((t) => t.key), fromMeasure: 0, toMeasure: 0, mode: 'wait' }, 90);
    expect(b.exercise.events.map((e) => e.fingers?.[0] ?? 0)).toEqual([1, 2, 0, 1]);
    const { planFingering } = await import('../src/hands3d/fingering');
    expect(planFingering(b.exercise.events).flat()).toEqual([1, 2, 3, 1]); // gap filled, written fingers kept
  });
});

describe('Guide hands for choir scores', () => {
  // five parts like a MuseScore choir export: every part carries a hidden, empty second staff
  const part = (id: string, step: string, oct: number) => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>` +
    `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><backup><duration>4</duration></backup><note><rest measure="yes"/><duration>4</duration><voice>5</voice><staff>2</staff></note></measure></part>`;
  const names = [['P1', 'Lead', 'E', 5], ['P2', 'Soprano', 'C', 5], ['P3', 'Alto', 'G', 4], ['P4', 'Tenor', 'E', 4], ['P5', 'Bass', 'C', 3]] as const;
  const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${names.map(([id, n]) => `<score-part id="${id}"><part-name>${n}</part-name></score-part>`).join('')}</part-list>${names.map(([id, , s, o]) => part(id, s, o)).join('')}</score-partwise>`;
  it('hidden empty staves are not called hands, and every voice is played: S A (Lead) right, T B left', async () => {
    const { handTracksFor, buildPractice: bp } = await import('../src/musicxml/practice');
    const s = parse(xml);
    expect(s.tracks.some((t) => /hand/.test(t.name))).toBe(false);
    const plan = handTracksFor(s, [s.tracks[0].key]);
    expect(plan.keys.length).toBe(5);
    const b = bp(s, { tracks: plan.keys, fromMeasure: 0, toMeasure: 0, mode: 'timed', handOf: plan.handOf }, 90);
    const ev = b.exercise.events[0];
    expect(ev.pitches).toEqual([48, 64, 67, 72, 76]);
    expect(ev.hands).toEqual(['LH', 'LH', 'RH', 'RH', 'RH']);
  });
  it('a real piano part still gives the hands its own two staves', async () => {
    const { handTracksFor } = await import('../src/musicxml/practice');
    const s = parse(wrap(`<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>${n('C', 5, 4, '<staff>1</staff>')}<backup><duration>4</duration></backup>${n('C', 3, 4, '<staff>2</staff>')}</measure>`));
    const plan = handTracksFor(s, []);
    expect(plan.keys.map(plan.handOf)).toEqual(['RH', 'LH']);
  });
});

describe('Display clean-up', () => {
  it('removes a hidden empty second staff but keeps every note and the timing', async () => {
    const { hideEmptyStaves } = await import('../src/musicxml/display');
    const xml = wrap(`<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>${n('C', 5, 2, '<voice>1</voice><staff>1</staff>')}${n('D', 5, 2, '<voice>1</voice><staff>1</staff>')}<backup><duration>4</duration></backup><note><rest measure="yes"/><duration>4</duration><voice>5</voice><staff>2</staff></note></measure>`);
    const doc = new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
    expect(hideEmptyStaves(doc)).toBe(1);
    const { XMLSerializer } = await import('@xmldom/xmldom');
    const out = new XMLSerializer().serializeToString(doc as never);
    expect(out).not.toMatch(/<staves>|<staff>|number="2"|<backup>/);
    const s = parse(out);
    expect(s.notes.map((x) => [x.midi, x.startQ])).toEqual([[72, 0], [74, 2]]);
  });
});
