import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { SONGS, songXml } from '../src/songs';
import { parseTokens } from '../src/songs/build';
import { parseMusicXml } from '../src/musicxml/parse';

describe('Song library', () => {
  it('every bar of every staff has the right length', () => {
    const bad: string[] = [];
    for (const s of SONGS) {
      const barQ = (s.spec.beats * 4) / s.spec.beatType;
      for (const p of s.spec.parts) for (const st of p.staves) {
        const bars = st.music.split('|');
        bars.forEach((b, i) => {
          const q = parseTokens(b).reduce((a, t) => a + t.q, 0);
          const edge = s.spec.pickup && (i === 0 || i === bars.length - 1);
          if (!edge && Math.abs(q - barQ) > 1e-6) bad.push(`${s.id} ${p.name} bar ${i + 1}: ${q} != ${barQ}`);
        });
        const n0 = s.spec.parts[0].staves[0].music.split('|').length;
        if (bars.length !== n0) bad.push(`${s.id} ${p.name}: ${bars.length} bars, expected ${n0}`);
      }
      if (s.spec.pickup) {
        const first = s.spec.parts.flatMap((p) => p.staves.map((st) => parseTokens(st.music.split('|')[0]).reduce((a, t) => a + t.q, 0)));
        if (new Set(first).size > 1) bad.push(`${s.id}: pickup lengths differ ${first}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every song imports cleanly and is graded', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(25);
    const order = ['Beginner', 'Easy', 'Intermediate', 'Advanced'];
    SONGS.forEach((s, i) => { if (i) expect(order.indexOf(s.level)).toBeGreaterThanOrEqual(order.indexOf(SONGS[i - 1].level)); });
    for (const s of SONGS) {
      const xml = songXml(s.id);
      const sc = parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, xml);
      expect(sc.notes.length, s.id).toBeGreaterThan(8);
      expect(sc.tracks.some((t) => t.staff === 2), s.id).toBe(true);
    }
    expect(SONGS.filter((s) => s.original).length).toBeGreaterThanOrEqual(8);
  });
});
