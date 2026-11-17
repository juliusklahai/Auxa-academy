// A printable, shareable, verifiable certificate for finishing a level. Drawn as SVG; saved as PNG or PDF.
// Signed-in learners get a code from the database; the link and QR open the public verify page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LEVEL_NAMES } from '../curriculum/levels';
import { certificateSvg, certCitation, W, H } from '../progress/certSvg';
import { shareUrl } from '../progress/certSeal';
import { saveBlob, shareLink as openShare, shareTargets, copyText, NeedsUpdate, APP_UPDATE_URL, type Saved } from '../native/files';
import { nameShape } from '../progress/nameShape';
import { canIssue, issueCertificate, type IssuedCert } from '../account/certificates';
import { useAccount } from '../account/store';
import { levelVerification, type LevelCheck } from '../account/witness';
import { lessonById } from '../curriculum/lessons';
import { Icon } from './Icon';
import { getProfile } from './learnerProfile';

export async function certToPng(svg: string, scale = 1): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not draw the certificate.')); img.src = url; });
    const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
    c.getContext('2d')!.drawImage(img, 0, 0, W * scale, H * scale);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the image.'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
export async function certToPdf(svg: string): Promise<Blob> {
  const png = await certToPng(svg, 2);
  const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(png); });
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = 297, ph = 210, iw = pw, ih = (H / W) * pw;
  doc.addImage(dataUrl, 'PNG', 0, (ph - ih) / 2, iw, ih);
  return doc.output('blob');
}

/** Lessons that still need a witnessed pass, with how many exercises are left in each. */
function todoLessons(rows: LevelCheck[]) {
  const by = new Map<string, LevelCheck[]>();
  rows.forEach((r) => by.set(r.lesson_id, [...(by.get(r.lesson_id) ?? []), r]));
  const out: { id: string; title: string; left: number; ex?: number; confirm?: boolean }[] = [];
  by.forEach((list, id) => {
    const witnessed = list.some((r) => r.passes > 0);
    // offline passes count once the lesson has one online pass
    const have = (r: LevelCheck) => r.passes + (witnessed ? r.offline ?? 0 : 0);
    const core = list.filter((r) => !r.piece && have(r) < r.required).length;
    const pieces = list.filter((r) => r.piece);
    let left = core + (pieces.length && !pieces.some((r) => have(r) >= r.required) ? 1 : 0);
    // done offline but not yet confirmed: one online pass of any exercise in the lesson is enough
    const offlineDone = !witnessed && list.some((r) => (r.offline ?? 0) > 0)
      && list.filter((r) => !r.piece).every((r) => (r.offline ?? 0) >= r.required)
      && (!pieces.length || pieces.some((r) => (r.offline ?? 0) >= r.required));
    if (offlineDone) left = 1;
    // the first exercise still to play, so a tap opens the lesson right there
    const want = offlineDone ? list.find((r) => !r.piece) ?? list[0] : list.find((r) => !r.piece && have(r) < r.required) ?? (left ? pieces[0] : undefined);
    const ix = want ? lessonById(id)?.exercises.findIndex((e) => e.id === want.exercise_id) : undefined;
    if (left) out.push({ id, title: lessonById(id)?.title ?? id, left, ex: ix !== undefined && ix >= 0 ? ix : undefined, confirm: offlineDone });
  });
  return out;
}

export function CertificateSheet({ level, date, onClose, fresh }: { level: number; date: string; onClose: () => void; fresh?: boolean }) {
  const a = useAccount();
  // the name always comes from the learner's profile (account name, or the name given at onboarding)
  const meta = (a.user as { user_metadata?: { full_name?: string; name?: string; display_name?: string } } | null)?.user_metadata;
  // signed in: only the account name (the database seals that one, and it can be changed just once)
  const shown = (a.profile ? (a.profile.display_name ?? '') : (meta?.display_name || meta?.full_name || meta?.name || getProfile()?.name || '')).replace(/\s+/g, ' ').trim();
  const [shape, setShape] = useState<{ d: string; w: number } | null>(null);
  useEffect(() => { let live = true; void nameShape(shown).then((x) => { if (live) setShape(x); }); return () => { live = false; }; }, [shown]);
  // verified copy from the database, re-issued (after a pause) when the name changes
  const [cert, setCert] = useState<IssuedCert | null>(null);
  const [todo, setTodo] = useState<LevelCheck[]>([]);
  const [state, setState] = useState<'idle' | 'issuing' | 'error' | 'offline' | 'verify'>(canIssue() ? 'issuing' : 'offline');
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canIssue() || !shown) { setState(canIssue() ? 'idle' : 'offline'); return; }
    setState('issuing'); setCert(null);
    const t = setTimeout(() => {
      issueCertificate(level, shown, LEVEL_NAMES[level] ?? '', certCitation(level))
        .then((c) => { setCert(c); setState('idle'); })
        .catch((e: Error) => {
          const m = /^VERIFY:(\d+)\s*(.*)$/s.exec(e.message);
          if (m) { setErr(m[2]); setState('verify'); void levelVerification(level).then(setTodo); }
          else { setErr(e.message); setState('error'); }
        });
    }, 700);
    return () => clearTimeout(t);
  }, [shown, level, a.user?.id, attempt]);
  const svg = useMemo(() => certificateSvg(shown, level, cert?.earned_on ?? date, undefined, { nameShape: shape ?? undefined, code: cert?.code, seal: cert?.seal }), [shown, level, date, shape, cert]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [update, setUpdate] = useState(false);
  const [panel, setPanel] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const base = `Auxa-Level-${level}-certificate`;
  const reset = () => { setNote(''); setSaved(null); setUpdate(false); };
  const run = async (k: string, f: () => Promise<void>) => {
    setBusy(k); reset();
    try { await f(); }
    catch (e) {
      if (e instanceof NeedsUpdate) setUpdate(true);
      if ((e as Error).name !== 'AbortError') setNote((e as Error).message);
    } finally { setBusy(''); }
  };
  // keep the result in view: the sheet can be taller than the phone screen
  useEffect(() => { if (note || saved || panel) feedback.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [note, saved, panel]);
  const link = cert ? shareUrl(cert.code) : '';
  const shareText = `I finished Level ${level} (${LEVEL_NAMES[level]}) on Auxa Academy. Check my certificate, and learn piano with a teacher that listens:`;
  const shareLink = () => run('link', async () => {
    setPanel(false);
    if (!(await openShare(`Level ${level} certificate`, shareText, link))) setPanel(true);
  });
  const copyLink = async () => { reset(); setNote((await copyText(`${shareText} ${link}`)) ? 'Link copied. Paste it anywhere to share.' : link); };
  const save = (k: 'png' | 'pdf') => run(k, async () => {
    const blob = k === 'png' ? await certToPng(svg, 2) : await certToPdf(svg);
    setSaved(await saveBlob(blob, `${base}.${k}`));
  });
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet cert-sheet" role="dialog" aria-label={`Level ${level} certificate`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">{fresh ? 'Well done!' : 'Certificate'}</small><b>{cert ? (fresh ? `You finished Level ${level}` : `Level ${level}`) : `Level ${level}: not sealed yet`}</b></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
        {/* the certificate itself (name, signature, seal) appears only once it is sealed and verified */}
        {cert ? <div className="cert-view" dangerouslySetInnerHTML={{ __html: svg }} />
          : <div className="cert-pending"><span className="cert-seal"><i>{level}</i></span><div><b>Level {level} · {LEVEL_NAMES[level]}</b><small className="muted">{state === 'issuing' ? 'Checking your verified passes…' : 'Your certificate appears here once Auxa has verified every exercise of this level and sealed it.'}</small></div></div>}
        <div className={`cert-status ${cert ? 'ok' : state}`}>
          {cert ? <><Icon name="check" size={14} /><span>Verified by Auxa</span></>
            : state === 'issuing' ? <span>Sealing your certificate…</span>
            : state === 'error' ? <><span>{err}</span><button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button></>
            : state === 'verify' ? <div className="cert-verify"><span>{err}</span>{todoLessons(todo).length > 0 && <><p className="muted small">Passes played online count straight away. Practice done offline is sent when you are back online, and counts once you pass one exercise of that lesson online. Tap a lesson to go straight to what is left.</p><ul>{todoLessons(todo).map((x) => <li key={x.id}><button className="cert-todo" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('maestro:open-lesson', { detail: { id: x.id, ex: x.ex } })); }}><b>{x.title}</b> <small>{x.confirm ? 'done offline: play one exercise to confirm' : `${x.left} to play`}</small><Icon name="next" size={13} /></button></li>)}</ul></>}<button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Check again</button></div>
            : <span>Sign in to get a verified certificate with its own code, QR and seal.</span>}
        </div>
        <p className="cert-from muted small">{shown ? <>Name from your profile. To change it, edit your name in <button className="link-btn" onClick={() => { onClose(); window.dispatchEvent(new Event('maestro:account')); }}>your account</button>.</> : <>Add your name in <button className="link-btn" onClick={() => { onClose(); window.dispatchEvent(new Event('maestro:account')); }}>your account</button> to put it on your certificate.</>}</p>
        {cert && <div className="cert-actions">
          <button className="btn lime" onClick={() => void shareLink()} disabled={!!busy || !cert}><Icon name="share" size={15} />{busy === 'link' ? 'Sharing…' : 'Share link'}</button>
          <button className="btn" onClick={() => void save('png')} disabled={!!busy}><Icon name="download" size={15} />{busy === 'png' ? 'Saving…' : 'PNG'}</button>
          <button className="btn" onClick={() => void save('pdf')} disabled={!!busy}><Icon name="download" size={15} />{busy === 'pdf' ? 'Saving…' : 'PDF'}</button>
        </div>}
        <div ref={feedback}>
          {cert && panel && <div className="cert-share" role="group" aria-label="Share your certificate">
            <small className="muted">Share your certificate on</small>
            <div className="cert-share-row">
              {shareTargets(shareText, link).map((t) => <a key={t.name} className="btn" href={t.href} target="_blank" rel="noopener noreferrer">{t.name}</a>)}
              <button className="btn" onClick={() => void copyLink()}>Copy link</button>
            </div>
          </div>}
          {saved && <div className="cert-note ok"><Icon name="check" size={14} /><span>Saved to {saved.where}.</span>{saved.open && <button className="link-btn" onClick={saved.open}>Open</button>}</div>}
          {note && <div className={`cert-note${update ? '' : ' plain'}`}><span>{note}</span>{update && <a className="link-btn" href={APP_UPDATE_URL} target="_blank" rel="noopener noreferrer">Get the update</a>}</div>}
        </div>
      </div>
    </div>
  );
}

/** Home: earned certificates, and the next one to work toward. */
export function CertShelf({ earnedList, nextLevel, nextFrac, onOpen }: { earnedList: { level: number; date: string }[]; nextLevel: number | null; nextFrac: number; onOpen: (level: number, date: string) => void }) {
  if (!earnedList.length && nextLevel === null) return null;
  return (
    <section className="card certs">
      <div className="card-head"><b>Certificates</b><span className="muted">{earnedList.length ? `${earnedList.length} earned` : 'Finish a level to earn one'}</span></div>
      <div className="cert-row">
        {earnedList.map((c) => (
          <button key={c.level} className="cert-chip" onClick={() => onOpen(c.level, c.date)} aria-label={`Open Level ${c.level} certificate`}>
            <span className="cert-seal">{c.level}</span><span><b>Level {c.level}</b><small>{LEVEL_NAMES[c.level]}</small></span>
          </button>
        ))}
        {nextLevel !== null && (
          <div className="cert-chip upcoming" aria-label={`Next: Level ${nextLevel}`}>
            <span className="cert-seal" style={{ ['--p' as string]: `${Math.round(nextFrac * 100)}%` }}><i>{nextLevel}</i></span><span><b>Next: Level {nextLevel}</b><small>{Math.round(nextFrac * 100)}% of lessons mastered</small></span>
          </div>
        )}
      </div>
    </section>
  );
}
