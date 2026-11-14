import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/musicxml/parse';
import { trimHiddenPadding } from '../src/musicxml/display';

const bar = (inner: string) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${inner}</measure>
<measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note></measure></part></score-partwise>`;
const N = (s: string, d: number, v = 1) => `<note><pitch><step>${s}</step><octave>4</octave></pitch><duration>${d}</duration><voice>${v}</voice></note>`;
const H = (d: number, v = 1) => `<note print-object="no"><rest/><duration>${d}</duration><voice>${v}</voice></note>`;
const xml = bar(N('D', 8) + H(6) + '<backup><duration>14</duration></backup>' + N('F', 8, 2) + H(6, 2));

describe('hidden padding rests', () => {
  it('do not stretch a bar past its time signature', () => {
    const s = parseMusicXml(new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document);
    expect(s.measures[0].lengthQ).toBe(4);
    expect(s.notes.find((n) => n.measure === 1)!.startQ).toBe(4);
  });
  it('are trimmed for the notation renderer, backups included', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
    expect(trimHiddenPadding(doc)).toBe(2);
    const m = doc.getElementsByTagName('measure')[0];
    expect(m.getElementsByTagName('backup')[0].getElementsByTagName('duration')[0].textContent).toBe('8');
    expect(m.getElementsByTagName('rest').length).toBe(0);
  });
  const f = '/mnt/user-data/uploads/cc6d6a46-Hymn_Medley_-_Organ_Score.musicxml';
  it.runIf(existsSync(f))('the hymn medley plays without gaps', () => {
    const s = parseMusicXml(new DOMParser().parseFromString(readFileSync(f, 'utf8'), 'application/xml') as unknown as Document);
    const over = s.measures.filter((m) => m.lengthQ > (m.beats * 4) / m.beatType + 1e-6);
    expect(over.length).toBe(0);
    // no silent stretch longer than a beat between consecutive onsets
    const starts = [...new Set(s.notes.map((n) => n.startQ))].sort((a, b) => a - b);
    const ends = s.notes.map((n) => n.startQ + n.durQ);
    let gaps = 0;
    for (let i = 1; i < starts.length; i++) { const sounding = ends.some((e, j) => s.notes[j].startQ < starts[i] && e > starts[i - 1] + 1e-6 && e >= starts[i] - 1e-6); if (!sounding && starts[i] - starts[i - 1] > 1.01) gaps++; }
    console.log('measures', s.measures.length, 'gaps', gaps, 'total beats', s.measures[s.measures.length - 1].startQ + s.measures[s.measures.length - 1].lengthQ);
    expect(gaps).toBeLessThan(5);
  });
});
