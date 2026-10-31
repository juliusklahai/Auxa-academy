import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/musicxml/parse';
import { SONGS, songXml } from '../src/songs';
import { parseTokens } from '../src/songs/build';

const parse = (xml: string) => parseMusicXml(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document, xml);

describe('Built-in song library', () => {
  it.each(SONGS.map((s) => [s.title, s] as const))('%s: every voice fills every bar', (_, song) => {
    const bar = (song.spec.beats * 4) / song.spec.beatType;
    for (const part of song.spec.parts) for (const st of part.staves) {
      const ms = st.music.split('|');
      const lens = ms.map((m) => parseTokens(m).reduce((a, t) => a + t.q, 0));
      lens.forEach((l, i) => {
        const first = i === 0 && song.spec.pickup, last = i === lens.length - 1 && song.spec.pickup;
        if (!first && !last) expect([part.name, i, l]).toEqual([part.name, i, bar]);
      });
      if (song.spec.pickup) expect(lens[0] + lens[lens.length - 1]).toBeCloseTo(bar);
      expect(ms.length).toBe(song.spec.parts[0].staves[0].music.split('|').length);
    }
  });
  it.each(SONGS.map((s) => [s.title, s] as const))('%s: imports with right/left hand and play-along parts', (_, song) => {
    const s = parse(songXml(song.id));
    expect(s.title).toBe(song.spec.title);
    expect(s.tracks.some((t) => t.name === 'Piano · right hand')).toBe(true);
    expect(s.tracks.some((t) => t.name === 'Piano · left hand')).toBe(true);
    expect(s.tracks.every((t) => !t.role)).toBe(true);
    expect(s.parts.find((p) => p.id === 'P2')?.program).toBeGreaterThan(1);
    // instrument ranges are playable
    for (const n of s.notes) {
      const part = s.tracks.find((t) => t.key === n.track)!.partName;
      if (part === 'Violin') expect(n.midi).toBeGreaterThanOrEqual(55);
      if (part === 'Cello') expect(n.midi).toBeGreaterThanOrEqual(36);
      if (part === 'Flute') expect(n.midi).toBeGreaterThanOrEqual(60);
    }
  });
  it('no harsh clashes (minor seconds) between parts on strong beats', () => {
    const report: string[] = [];
    for (const song of SONGS) {
      const s = parse(songXml(song.id));
      for (let q = 0; q < s.totalQ; q += 1) {
        const sounding = s.notes.filter((n) => n.startQ <= q + 1e-9 && q < n.startQ + n.durQ - 1e-9);
        const starting = sounding.filter((n) => Math.abs(n.startQ - q) < 1e-9);
        for (const a of starting) for (const b of sounding) {
          if (a === b || a.track === b.track) continue;
          const iv = Math.abs(a.midi - b.midi) % 12;
          if (iv === 1 || iv === 11) report.push(`${song.id} q${q} ${a.midi}/${b.midi}`);
        }
      }
    }
    expect(report).toEqual([]);
  });
});
