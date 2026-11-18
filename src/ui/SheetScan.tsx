// Scan sheet music: photos or a PDF -> rights check -> on-device reading -> review and fix -> MusicXML.
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { loadPages, Scanner, type PageImage } from '../scan/engine';
import { badBars, barFill, dropRepeats, joinSystems, measureLen, parseKern, timesOf, toMusicXml, type SEvent, type SMeasure, type SScore } from '../scan/kern';
import { cropX, type Gray } from '../scan/segment';
import { Icon } from './Icon';

type Rights = 'mine' | 'public' | 'licensed';
type Step = 'pick' | 'rights' | 'reading' | 'review';
interface SysView { page: number; img: string; barXs: number[]; x0: number; width: number; bars: number; staves: number }

const RIGHTS: { id: Rights; label: string; note: string }[] = [
  { id: 'mine', label: 'I wrote or arranged it', note: 'Your own music.' },
  { id: 'public', label: 'It is in the public domain', note: 'For example, the composer died more than 70 years ago and this edition is old or free.' },
  { id: 'licensed', label: 'I own this copy or a licence, for my own practice', note: 'The scan stays private to you.' },
];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LENGTHS: [number, string][] = [[4, 'Whole'], [2, 'Half'], [1, 'Quarter'], [0.5, '8th'], [0.25, '16th']];
const nameOf = (n: { step: string; alter: number; octave: number }) => `${n.step}${n.alter > 0 ? '#'.repeat(n.alter) : n.alter < 0 ? 'b'.repeat(-n.alter) : ''}${n.octave}`;
const lenName = (d: number) => { for (const [v, n] of LENGTHS) { if (Math.abs(d - v) < 1e-6) return n; if (Math.abs(d - v * 1.5) < 1e-6) return 'Dotted ' + n.toLowerCase(); } return `${+(d.toFixed(2))} beats`; };
const spell = (midi: number, prefer: number) => { const pc = ((midi % 12) + 12) % 12; let nm = NAMES[pc]; if (prefer > 0 && nm.endsWith('b')) nm = NAMES[(pc + 11) % 12][0] + '#'; const step = nm[0]; const alter = nm.length > 1 ? (nm[1] === '#' ? 1 : -1) : 0; return { step, alter, octave: Math.floor(midi / 12) - 1, midi }; };

function grayUrl(g: Gray, x0 = 0, x1 = g.w, y0 = 0, y1 = g.h, maxW = 1400): string {
  const w = x1 - x0, h = y1 - y0, s = Math.min(1, maxW / w);
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  const full = document.createElement('canvas'); full.width = w; full.height = h;
  const fx = full.getContext('2d')!, id = fx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = g.px[(y0 + y) * g.w + x0 + x], j = (y * w + x) * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
  fx.putImageData(id, 0, 0);
  c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

export function SheetScan({ onClose, onDone }: { onClose: () => void; onDone: (xml: string) => void }) {
  const [step, setStep] = useState<Step>('pick');
  const [pages, setPages] = useState<PageImage[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [rights, setRights] = useState<Rights | null>(null);
  const [notice, setNotice] = useState('');
  const [agree, setAgree] = useState(false);
  const [load, setLoad] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState({ page: 0, system: 0, systems: 0, tokens: 0 });
  const [views, setViews] = useState<SysView[]>([]);
  const [score, setScore] = useState<SScore | null>(null);
  const [fixed, setFixed] = useState(0);
  const [edit, setEdit] = useState<number | null>(null);
  const scanner = useRef<Scanner | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const t0 = useRef(0);

  useEffect(() => () => { scanner.current?.dispose(); audio.stopAll(); }, []);

  const addFiles = async (fs: FileList | null) => {
    if (!fs?.length) return;
    const list = [...fs]; // the input is cleared right after this call, which empties its FileList
    setErr(''); setBusy('Opening your pages…');
    try {
      const got = await loadPages(list);
      setPages((p) => [...p, ...got]);
      if (!title) setTitle(list[0].name.split('.')[0].replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());
    } catch (e) { setErr('Could not open that file: ' + (e as Error).message); }
    setBusy('');
  };

  const read = async () => {
    setStep('reading'); setErr('');
    const sc = (scanner.current ??= new Scanner());
    const kerns: string[] = [];
    const vs: SysView[] = [];
    const barsIn: Record<number, number> = {};
    t0.current = performance.now();
    try {
      await sc.load({ onLoading: (g, t) => setLoad([g, t]) });
      setLoad(null);
      for (let p = 0; p < pages.length; p++) {
        let base = kerns.length;
        await sc.read(pages[p].gray, {
          onLayout: (l) => {
            base = kerns.length;
            const g = { w: l.page.w, h: l.page.h, px: l.page.px };
            l.systems.forEach((s, i) => {
              const [x0, x1] = cropX(s, s.gap, g.w);
              vs[base + i] = { page: p, img: grayUrl(g, x0, x1, s.top, s.bottom), barXs: s.barXs.map((x) => x - x0), x0, width: x1 - x0, bars: s.bars, staves: s.staves };
              barsIn[base + i] = s.bars;
            });
            setViews([...vs]);
            setStatus((st) => ({ ...st, page: p, systems: base + l.systems.length }));
          },
          onProgress: (i, n) => setStatus((st) => ({ ...st, system: base + i, tokens: n })),
          onSystem: (i, k) => { kerns[base + i] = k; setStatus((st) => ({ ...st, system: base + i + 1, tokens: 0 })); },
        });
      }
      if (!kerns.length) { setErr('No lines of music were found. Try a flatter, brighter photo with the whole page in view.'); setStep('pick'); return; }
      const s = parseKern(joinSystems(kerns), { title: title.trim() || 'Scanned score', composer: composer.trim(), rights: rightsText() });
      setFixed(dropRepeats(s, barsIn));
      setScore(s);
      setStep('review');
    } catch (e) {
      const m = (e as Error).message;
      if (m !== 'cancelled') setErr(m.includes('download') || m.includes('fetch') ? 'Could not download the reader. Check your connection and try again.' : 'Reading stopped: ' + m);
      setStep('rights');
    }
  };

  const rightsText = () => {
    const who = composer.trim() || 'the composer';
    if (rights === 'mine') return `© ${new Date().getFullYear()} ${who}`;
    if (rights === 'public') return 'Public domain' + (notice ? ` (${notice})` : '');
    return `${notice || `© ${who}`}. Personal practice copy, not for sharing.`;
  };

  const bad = useMemo(() => (score ? badBars(score) : []), [score]);
  const badSet = useMemo(() => new Map(bad.map((b) => [b.index, b.why])), [bad]);

  const update = (f: (s: SScore) => void) => setScore((s) => { if (!s) return s; const c: SScore = structuredClone(s); f(c); return c; });

  const playBars = (from: number, to: number) => {
    if (!score) return;
    audio.stopAll();
    const ts = timesOf(score), bpm = 90, q = 60000 / bpm;
    let at = 0;
    const notes: { midi: number; startMs: number; durMs: number }[] = [];
    for (let i = from; i <= to; i++) {
      const m = score.measures[i];
      for (const e of m.events) if (!e.grace) for (const n of e.notes) if (n.tie !== 'stop' && n.tie !== 'both') notes.push({ midi: n.midi, startMs: (at + e.t) * q, durMs: Math.max(120, e.dur * q * 0.95) });
      at += Math.max(barFill(m), i === 0 ? 0 : measureLen(ts[i]));
    }
    audio.playNotes(notes);
  };

  const save = () => {
    if (!score) return;
    onDone(toMusicXml({ ...score, title: title.trim() || score.title, composer: composer.trim(), rights: rightsText() }));
  };

  // ---------- screens ----------
  const head = (h: string, sub?: string) => (
    <div className="scan-head">
      <div><h2>{h}</h2>{sub && <p className="muted small">{sub}</p>}</div>
      <button className="btn icon" onClick={() => { scanner.current?.cancel(); onClose(); }} aria-label="Close"><Icon name="close" /></button>
    </div>
  );

  if (step === 'pick') return (
    <div className="scan card">
      {head('Scan sheet music', 'Printed piano music on two staves reads best. Everything happens on this device; your pages are not uploaded.')}
      <div className="row wrap">
        <button className="btn dark" onClick={() => camIn.current?.click()}><Icon name="camera" size={16} /> Take a photo</button>
        <button className="btn" onClick={() => fileIn.current?.click()}><Icon name="upload" size={16} /> Choose PDF or pictures</button>
      </div>
      <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={fileIn} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
      {busy && <p className="muted small">{busy}</p>}
      {pages.length > 0 && (
        <div className="scan-pages">
          {pages.map((p, i) => (
            <figure key={i} className="scan-thumb">
              <img src={p.thumb} alt={`Page ${i + 1}`} />
              <figcaption>Page {i + 1}<button className="link" onClick={() => setPages(pages.filter((_, j) => j !== i))} aria-label={`Remove page ${i + 1}`}>Remove</button></figcaption>
            </figure>
          ))}
        </div>
      )}
      <ul className="scan-tips small muted">
        <li>Lay the page flat in good light, with the whole page in the picture.</li>
        <li>Handwritten music, guitar tabs and lyrics are not read.</li>
      </ul>
      {err && <p className="small tip">{err}</p>}
      <div className="row end"><button className="btn dark" disabled={!pages.length || !!busy} onClick={() => setStep('rights')}>Next</button></div>
    </div>
  );

  if (step === 'rights') return (
    <div className="scan card">
      {head('About this music', 'Before reading, tell us what you have the right to copy.')}
      <div className="scan-form">
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title on the page" /></label>
        <label>Composer or arranger<input value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="As printed" /></label>
      </div>
      <div className="scan-rights" role="radiogroup" aria-label="Who owns this music">
        {RIGHTS.map((r) => (
          <button key={r.id} role="radio" aria-checked={rights === r.id} className={`scan-right ${rights === r.id ? 'on' : ''}`} onClick={() => setRights(r.id)}>
            <b>{r.label}</b><span className="muted small">{r.note}</span>
          </button>
        ))}
      </div>
      <label className="scan-field">Copyright line on the page, if there is one<input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="For example: © 2019 Hal Leonard" /></label>
      <label className="scan-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I confirm this. Copyrighted scores stay private and are for my own practice only.</label>
      {err && <p className="small tip">{err}</p>}
      <div className="row end">
        <button className="btn" onClick={() => setStep('pick')}>Back</button>
        <button className="btn dark" disabled={!rights || !agree} onClick={() => void read()}>Read the music</button>
      </div>
    </div>
  );

  if (step === 'reading') {
    const done = status.system, total = Math.max(status.systems, 1);
    const el = (performance.now() - t0.current) / 1000;
    const left = done > 0 ? Math.round((el / done) * (total - done)) : null;
    return (
      <div className="scan card">
        {head('Reading the music', load ? 'Getting the reader ready. This happens once; after that it works offline.' : `Page ${status.page + 1} of ${pages.length}, line ${Math.min(done + 1, total)} of ${status.systems || '…'}`)}
        {load && <div className="scan-bar"><i style={{ width: `${load[1] ? (100 * load[0]) / load[1] : 10}%` }} /><span>{(load[0] / 1e6).toFixed(1)} of {load[1] ? (load[1] / 1e6).toFixed(1) : '…'} MB</span></div>}
        {!load && <div className="scan-bar"><i style={{ width: `${(100 * (done + Math.min(0.95, status.tokens / 400))) / total}%` }} /><span>{left !== null ? `About ${left < 60 ? `${left} s` : `${Math.ceil(left / 60)} min`} left` : 'Starting…'}</span></div>}
        <div className="scan-lines">
          {views.map((v, i) => (
            <div key={i} className={`scan-line ${i === done ? 'now' : i < done ? 'done' : ''}`}><img src={v.img} alt={`Line ${i + 1}`} /></div>
          ))}
        </div>
        <div className="row end"><button className="btn" onClick={() => { scanner.current?.cancel(); setStep('rights'); }}>Stop</button></div>
      </div>
    );
  }

  // review
  if (!score) return null;
  const bySystem = views.map((_, s) => score.measures.map((m, i) => (m.system === s ? i : -1)).filter((i) => i >= 0));
  return (
    <div className="scan card">
      {head('Check and fix', `${score.measures.length} bars read. ${bad.length ? `${bad.length} bar${bad.length > 1 ? 's' : ''} need a look (marked).` : 'Every bar adds up.'} Play each line and compare it with the page; tap a bar to fix a note.`)}
      <label className="scan-field">Name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of the piece" maxLength={120} /></label>
      {fixed > 0 && <p className="small muted">Removed {fixed} repeated bar{fixed > 1 ? 's' : ''} the reader wrote twice.</p>}
      <div className="scan-review">
        {views.map((v, s) => {
          const idx = bySystem[s] ?? [];
          const shows = v.bars && idx.length > v.bars ? `The page seems to show ${v.bars} bar${v.bars === 1 ? '' : 's'} here, but ${idx.length} were read. Check for a repeated bar.` : '';
          return (
            <div key={s} className="scan-sys">
              <img src={v.img} alt={`Line ${s + 1} as printed`} />
              <div className="scan-bars">
                <button className="btn small" onClick={() => idx.length && playBars(idx[0], idx[idx.length - 1])}><Icon name="play" size={14} /> Line {s + 1}</button>
                {idx.map((i) => <button key={i} className={`bar-chip ${badSet.has(i) ? 'bad' : ''}`} onClick={() => setEdit(i)} title={badSet.get(i) ?? 'Bar ' + (i + 1)}>{i + 1}</button>)}
                {v.staves !== 2 && <span className="small muted">This line has {v.staves === 1 ? 'one staff' : `${v.staves} staves`}; the reader is made for piano (two staves), so check it closely.</span>}
                {shows && <span className="small warn-text">{shows}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row end">
        <button className="btn" onClick={() => playBars(0, score.measures.length - 1)}><Icon name="play" size={15} /> Play all</button>
        <button className="btn dark" onClick={save}><Icon name="check" size={15} /> Save to My Music</button>
      </div>
      {edit !== null && score.measures[edit] && (
        <BarEditor
          index={edit} m={score.measures[edit]} len={measureLen(timesOf(score)[edit])} keyFifths={score.key} why={badSet.get(edit)}
          view={views[score.measures[edit].system]} posInLine={(bySystem[score.measures[edit].system] ?? []).indexOf(edit)}
          onChange={(m) => update((s) => { s.measures[edit] = m; })}
          onDelete={() => { update((s) => { s.measures.splice(edit, 1); }); setEdit(null); }}
          onInsert={() => update((s) => { s.measures.splice(edit + 1, 0, { events: [], system: s.measures[edit].system }); })}
          onPlay={() => playBars(edit, edit)} onClose={() => setEdit(null)}
          onPrev={edit > 0 ? () => setEdit(edit - 1) : undefined} onNext={edit < score.measures.length - 1 ? () => setEdit(edit + 1) : undefined}
        />
      )}
    </div>
  );
}

function BarEditor({ index, m, len, keyFifths, why, view, posInLine, onChange, onDelete, onInsert, onPlay, onClose, onPrev, onNext }: {
  index: number; m: SMeasure; len: number; keyFifths: number; why?: string; view?: SysView; posInLine: number;
  onChange: (m: SMeasure) => void; onDelete: () => void; onInsert: () => void; onPlay: () => void; onClose: () => void; onPrev?: () => void; onNext?: () => void;
}) {
  const [sel, setSel] = useState<{ e: number; n: number } | null>(null);
  useEffect(() => setSel(null), [index]);
  const evs = m.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.e.voice - b.e.voice);
  const change = (f: (evs: SEvent[]) => void) => { const c: SMeasure = structuredClone(m); f(c.events); retime(c.events); onChange(c); };
  const cur = sel ? m.events[sel.e] : null;
  const curNote = sel && cur && cur.notes[sel.n];
  // crop the picture to this bar: from the barline before it to the barline after it
  const xs = view ? [0, ...view.barXs] : [];
  const a = xs[posInLine] ?? 0, b = xs[posInLine + 1] ?? view?.width ?? 1;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet scan-edit" onClick={(e) => e.stopPropagation()}>
        <div className="scan-head">
          <div><h3>Bar {index + 1}</h3>{why ? <p className="small warn-text">{why}</p> : <p className="small muted">Adds up correctly.</p>}</div>
          <div className="row">
            <button className="btn icon" disabled={!onPrev} onClick={onPrev} aria-label="Previous bar"><Icon name="back" /></button>
            <button className="btn icon" disabled={!onNext} onClick={onNext} aria-label="Next bar"><Icon name="next" /></button>
            <button className="btn icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        </div>
        {view && <BarPic src={view.img} from={a} to={b} width={view.width} />}
        {[1, 2].map((staff) => {
          const row = evs.filter(({ e }) => e.staff === staff);
          return (
            <div key={staff} className="hand-row">
              <span className="small muted">{staff === 1 ? 'Right hand' : 'Left hand'}</span>
              <div className="note-chips">
                {row.map(({ e, i }) => (e.notes.length ? e.notes : [null]).map((n, k) => (
                  <button key={`${i}-${k}`} className={`note-chip ${sel?.e === i && sel.n === k ? 'on' : ''}`} onClick={() => setSel({ e: i, n: k })}>
                    <b>{n ? nameOf(n) : 'Rest'}</b><span>{lenName(e.dur)}</span>
                  </button>
                )))}
                <button className="note-chip add" onClick={() => change((list) => { const last = list.filter((x) => x.staff === staff).sort((x, y) => x.t - y.t).pop(); const midi = last?.notes[0]?.midi ?? (staff === 1 ? 72 : 48); list.push({ t: 99, dur: 1, notes: [{ ...spell(midi, keyFifths) }], staff: staff as 1 | 2, voice: 1 }); })}>+ Note</button>
              </div>
            </div>
          );
        })}
        {cur && (
          <div className="note-tools">
            <div className="row wrap">
              {curNote && <>
                <button className="btn" onClick={() => change((l) => { const n = l[sel!.e].notes[sel!.n]; Object.assign(n, spell(n.midi + 1, 1)); })}>Up</button>
                <button className="btn" onClick={() => change((l) => { const n = l[sel!.e].notes[sel!.n]; Object.assign(n, spell(n.midi - 1, -1)); })}>Down</button>
                <button className="btn" onClick={() => change((l) => { const n = l[sel!.e].notes[sel!.n]; Object.assign(n, { octave: n.octave + 1, midi: n.midi + 12 }); })}>Octave up</button>
                <button className="btn" onClick={() => change((l) => { const n = l[sel!.e].notes[sel!.n]; Object.assign(n, { octave: n.octave - 1, midi: n.midi - 12 }); })}>Octave down</button>
                <button className="btn" onClick={() => change((l) => { const e = l[sel!.e]; const n = e.notes[sel!.n]; e.notes.push({ ...spell(n.midi + 4, keyFifths) }); })}>Add to chord</button>
              </>}
              {!curNote && <button className="btn" onClick={() => change((l) => { l[sel!.e].notes = [{ ...spell(cur.staff === 1 ? 72 : 48, keyFifths) }]; })}>Make it a note</button>}
              {curNote && <button className="btn" onClick={() => change((l) => { const e = l[sel!.e]; if (e.notes.length > 1) e.notes.splice(sel!.n, 1); else e.notes = []; })}>{cur.notes.length > 1 ? 'Remove from chord' : 'Make it a rest'}</button>}
              <button className="btn" onClick={() => { change((l) => { l.splice(sel!.e, 1); }); setSel(null); }}>Delete</button>
            </div>
            <div className="seg">
              {LENGTHS.map(([v, n]) => <button key={v} className={Math.abs(cur.dur - v) < 1e-6 || Math.abs(cur.dur - v * 1.5) < 1e-6 ? 'on' : ''} onClick={() => change((l) => { const e = l[sel!.e]; const dotted = LENGTHS.some(([w]) => Math.abs(e.dur - w * 1.5) < 1e-6); e.dur = dotted ? v * 1.5 : v; })}>{n}</button>)}
              <button className={LENGTHS.some(([v]) => Math.abs(cur.dur - v * 1.5) < 1e-6) ? 'on' : ''} onClick={() => change((l) => { const e = l[sel!.e]; const base = LENGTHS.find(([v]) => Math.abs(e.dur - v * 1.5) < 1e-6); e.dur = base ? base[0] : e.dur * 1.5; })}>Dotted</button>
            </div>
          </div>
        )}
        <p className="small muted">Bar length: {+barFill(m).toFixed(2)} of {len} quarter notes.</p>
        <div className="row wrap end">
          <button className="btn" onClick={onPlay}><Icon name="play" size={14} /> Play bar</button>
          <button className="btn" onClick={onInsert}>Add empty bar after</button>
          <button className="btn" onClick={onDelete}>Delete bar</button>
          <button className="btn dark" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** The bar as printed: the line's picture cut between its two barlines. */
function BarPic({ src, from, to, width }: { src: string; from: number; to: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      const c = ref.current; if (!c) return;
      const k = im.naturalWidth / width, x0 = Math.max(0, (from - 14) * k), x1 = Math.min(im.naturalWidth, (to + 14) * k);
      c.width = Math.round(x1 - x0); c.height = im.naturalHeight;
      c.getContext('2d')!.drawImage(im, x0, 0, x1 - x0, im.naturalHeight, 0, 0, c.width, c.height);
    };
    im.src = src;
  }, [src, from, to, width]);
  return <div className="bar-pic"><canvas ref={ref} aria-label="This bar on the page" /></div>;
}

/** After an edit, line each hand's notes up one after another (chords and parallel voices keep their start). */
function retime(list: SEvent[]) {
  for (const staff of [1, 2]) for (const voice of [...new Set(list.filter((e) => e.staff === staff).map((e) => e.voice))]) {
    const v = list.filter((e) => e.staff === staff && e.voice === voice).sort((a, b) => a.t - b.t);
    let t = 0;
    for (const e of v) { e.t = t; t += e.grace ? 0 : e.dur; }
  }
}
