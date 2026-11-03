// Display-only clean-up of imported MusicXML: many exports (MuseScore choir templates, for example)
// give every part a hidden, empty second staff. The notation renderer would draw it anyway, wasting
// half the screen, so staves that never hold a pitched note are removed before rendering.
// Timing is untouched (notes, backups for real voices and measures stay), so the cursor still lines up.

export function hideEmptyStaves(doc: Document): number {
  let removed = 0;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const staves = Math.max(1, ...Array.from(part.getElementsByTagName('staves')).map((s) => +(s.textContent ?? '1')));
    if (staves !== 2) continue;
    const notes = Array.from(part.getElementsByTagName('note'));
    const staffOf = (n: Element) => n.getElementsByTagName('staff')[0]?.textContent?.trim() ?? '1';
    const pitched = (n: Element) => n.getElementsByTagName('pitch').length > 0 || n.getElementsByTagName('unpitched').length > 0;
    const used = new Set(notes.filter(pitched).map(staffOf));
    if (used.size !== 1) continue;
    const keep = [...used][0];
    const drop = keep === '1' ? '2' : '1';
    for (const m of Array.from(part.getElementsByTagName('measure'))) {
      const kids = Array.from(m.childNodes).filter((c): c is Element => c.nodeType === 1);
      kids.forEach((el, i) => {
        if (el.tagName === 'note' && staffOf(el) === drop) { m.removeChild(el); return; }
        // a backup that only leads into the dropped staff
        if (el.tagName === 'backup') {
          const next = kids.slice(i + 1).find((k) => k.tagName === 'note' || k.tagName === 'backup' || k.tagName === 'forward');
          if (!next || (next.tagName === 'note' && staffOf(next) === drop)) m.removeChild(el);
        }
        if (el.tagName === 'direction' && el.getElementsByTagName('staff')[0]?.textContent?.trim() === drop) m.removeChild(el);
      });
      for (const a of Array.from(m.getElementsByTagName('attributes'))) {
        for (const el of Array.from(a.childNodes).filter((c): c is Element => c.nodeType === 1)) {
          const num = el.getAttribute('number');
          if (el.tagName === 'staves' || el.tagName === 'staff-details' || ((el.tagName === 'clef' || el.tagName === 'key' || el.tagName === 'time') && num === drop)) a.removeChild(el);
          else if (el.tagName === 'clef' && num) el.removeAttribute('number');
        }
      }
      for (const n of Array.from(m.getElementsByTagName('staff'))) n.parentNode?.removeChild(n);
    }
    removed++;
  }
  return removed;
}

/** Browser helper: cleaned MusicXML text for the notation renderer (unchanged if nothing to do or on error). */
export function displayXml(xml: string): string {
  try {
    if (/<score-timewise/.test(xml)) return xml;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    return hideEmptyStaves(doc) ? new XMLSerializer().serializeToString(doc) : xml;
  } catch { return xml; }
}
