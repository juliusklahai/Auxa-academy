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
    const changed = trimHiddenPadding(doc) + hideEmptyStaves(doc);
    return changed ? new XMLSerializer().serializeToString(doc) : xml;
  } catch { return xml; }
}

/**
 * Some exporters (music21 for one) end every voice with an invisible rest that overfills the bar,
 * e.g. 4 beats of notes plus 3 hidden beats in 4/4. Trim those hidden rests to the time signature
 * (and shorten the backups that follow them) so the notation renderer and the player agree.
 */
export function trimHiddenPadding(doc: Document): number {
  let trimmed = 0;
  const kidEls = (e: Element) => Array.from(e.childNodes).filter((c): c is Element => c.nodeType === 1);
  const first = (e: Element, tag: string) => e.getElementsByTagName(tag)[0];
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    let divisions = 1, beats = 4, beatType = 4;
    for (const m of Array.from(part.getElementsByTagName('measure'))) {
      const kids = kidEls(m);
      for (const a of kids.filter((k) => k.tagName === 'attributes')) {
        const d = first(a, 'divisions'); if (d) divisions = +(d.textContent ?? divisions) || divisions;
        const t = first(a, 'time');
        if (t) { const b = first(t, 'beats')?.textContent; const bt = first(t, 'beat-type')?.textContent; if (b) beats = b.split('+').reduce((x, y) => x + +y, 0) || beats; if (bt) beatType = +bt || beatType; }
      }
      const nominal = Math.round((beats * 4 * divisions) / beatType);
      let pos = 0, cut = 0;
      for (const el of kids) {
        const durEl = first(el, 'duration');
        const dur = durEl ? +(durEl.textContent ?? 0) : 0;
        if (el.tagName === 'note') {
          if (first(el, 'chord') || first(el, 'grace')) continue;
          const hidden = !!first(el, 'rest') && el.getAttribute('print-object') === 'no';
          if (hidden && pos + dur > nominal) {
            const keep = Math.max(0, nominal - pos);
            cut += dur - keep; trimmed++;
            if (keep === 0) m.removeChild(el); else durEl!.textContent = String(keep);
            pos += keep;
          } else pos += dur;
        } else if (el.tagName === 'backup' && durEl) {
          const nd = dur - cut; cut = 0;
          if (nd <= 0) m.removeChild(el); else durEl.textContent = String(nd);
          pos -= nd;
        } else if (el.tagName === 'forward') pos += dur;
      }
    }
  }
  return trimmed;
}
