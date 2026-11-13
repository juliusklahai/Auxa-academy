// A printable, shareable, verifiable certificate for finishing a level. Drawn as SVG; saved as PNG or PDF.
// Signed-in learners get a code from the database; the link and QR open the public verify page.
import { useEffect, useMemo, useState } from 'react';
import { LEVEL_NAMES } from '../curriculum/levels';
import { certificateSvg, certCitation, W, H } from '../progress/certSvg';
import { verifyUrl } from '../progress/certSeal';
import { nameShape } from '../progress/nameShape';
import { canIssue, issueCertificate, type IssuedCert } from '../account/certificates';
import { useAccount } from '../account/store';
import { levelVerification, type LevelCheck } from '../account/witness';
import { lessonById } from '../curriculum/lessons';
import { Icon } from './Icon';

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
const download = (b: Blob, file: string) => { const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = file; el.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
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
  const out: { id: string; title: string; left: number }[] = [];
  by.forEach((list, id) => {
    const core = list.filter((r) => !r.piece && r.passes < r.required).length;
    const pieces = list.filter((r) => r.piece);
    const left = core + (pieces.length && !pieces.some((r) => r.passes >= r.required) ? 1 : 0);
    if (left) out.push({ id, title: lessonById(id)?.title ?? id, left });
  });
  return out;
}

export function CertificateSheet({ level, date, onClose, fresh }: { level: number; date: string; onClose: () => void; fresh?: boolean }) {
  const a = useAccount();
  const [name, setName] = useState(() => { try { return localStorage.getItem('maestro.cert.name') ?? ''; } catch { return ''; } });
  const shown = (name || a.profile?.display_name || '').trim();
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
  const base = `Auxa-Level-${level}-certificate`;
  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); setNote(''); try { await f(); } catch (e) { if ((e as Error).name !== 'AbortError') setNote((e as Error).message); } finally { setBusy(''); } };
  const link = cert ? verifyUrl(cert.code) : '';
  const shareLink = () => run('link', async () => {
    const text = `I finished Level ${level} (${LEVEL_NAMES[level]}) on Auxa Academy. Check my certificate, and learn piano with a teacher that listens:`;
    if (navigator.share) { await navigator.share({ title: `Level ${level} certificate`, text, url: link }); return; }
    await navigator.clipboard.writeText(`${text} ${link}`);
    setNote('Link copied. Paste it anywhere to share.');
  });
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet cert-sheet" role="dialog" aria-label={`Level ${level} certificate`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">{fresh ? 'Well done!' : 'Certificate'}</small><b>{fresh ? `You finished Level ${level}` : `Level ${level}`}</b></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
        <div className="cert-view" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className={`cert-status ${cert ? 'ok' : state}`}>
          {cert ? <><Icon name="check" size={14} /><span>Verified by Auxa · <b>{cert.code}</b></span></>
            : state === 'issuing' ? <span>Sealing your certificate…</span>
            : state === 'error' ? <><span>{err}</span><button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button></>
            : state === 'verify' ? <div className="cert-verify"><span>{err}</span>{todoLessons(todo).length > 0 && <ul>{todoLessons(todo).map((x) => <li key={x.id}><b>{x.title}</b> <small>{x.left} to play</small></li>)}</ul>}<button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Check again</button></div>
            : <span>Sign in to get a verified certificate with its own code, QR and seal.</span>}
        </div>
        <label className="cert-name">Name on the certificate<input value={name} maxLength={40} placeholder={a.profile?.display_name || 'Your name'} onChange={(e) => { setName(e.target.value); try { localStorage.setItem('maestro.cert.name', e.target.value); } catch { /* private mode */ } }} /></label>
        <div className="cert-actions">
          <button className="btn lime" onClick={() => void shareLink()} disabled={!!busy || !cert}><Icon name="share" size={15} />{busy === 'link' ? 'Sharing…' : 'Share link'}</button>
          <button className="btn" onClick={() => void run('png', async () => download(await certToPng(svg, 2), `${base}.png`))} disabled={!!busy}><Icon name="download" size={15} />{busy === 'png' ? 'Saving…' : 'PNG'}</button>
          <button className="btn" onClick={() => void run('pdf', async () => download(await certToPdf(svg), `${base}.pdf`))} disabled={!!busy}><Icon name="download" size={15} />{busy === 'pdf' ? 'Saving…' : 'PDF'}</button>
        </div>
        {note && <p className="muted small">{note}</p>}
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
