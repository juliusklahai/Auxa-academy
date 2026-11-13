// A printable, shareable certificate for finishing a level. Drawn as SVG, saved as a PNG.
import { useMemo, useState } from 'react';
import { LEVEL_NAMES } from '../curriculum/levels';
import { certificateSvg } from '../progress/certSvg';
import scriptFont from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2?inline';
import { useAccount } from '../account/store';
import { Icon } from './Icon';

const W = 1600, H = 1130;
async function toPng(svg: string): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not draw the certificate.')); img.src = url; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the image.'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function CertificateSheet({ level, date, onClose, fresh }: { level: number; date: string; onClose: () => void; fresh?: boolean }) {
  const a = useAccount();
  const [name, setName] = useState(() => { try { return localStorage.getItem('maestro.cert.name') ?? ''; } catch { return ''; } });
  const shown = name || a.profile?.display_name || '';
  const svg = useMemo(() => certificateSvg(shown, level, date, scriptFont), [shown, level, date]);
  const [busy, setBusy] = useState('');
  const file = `Auxa-Level-${level}-certificate.png`;
  const save = async () => {
    setBusy('save');
    try { const b = await toPng(svg); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = file; el.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); } finally { setBusy(''); }
  };
  const share = async () => {
    setBusy('share');
    try {
      const b = await toPng(svg); const f = new File([b], file, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: `Level ${level} certificate`, text: `I finished Level ${level} on Auxa Academy!` });
      else await save();
    } catch { /* closed the share sheet */ } finally { setBusy(''); }
  };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet cert-sheet" role="dialog" aria-label={`Level ${level} certificate`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">{fresh ? 'Well done!' : 'Certificate'}</small><b>{fresh ? `You finished Level ${level}` : `Level ${level}`}</b></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
        <div className="cert-view" dangerouslySetInnerHTML={{ __html: svg }} />
        <label className="cert-name">Name on the certificate<input value={name} maxLength={40} placeholder={a.profile?.display_name || 'Your name'} onChange={(e) => { setName(e.target.value); try { localStorage.setItem('maestro.cert.name', e.target.value); } catch { /* private mode */ } }} /></label>
        <div className="cert-actions">
          <button className="btn lime" onClick={() => void share()} disabled={!!busy}><Icon name="share" size={15} />{busy === 'share' ? 'Preparing…' : 'Share'}</button>
          <button className="btn" onClick={() => void save()} disabled={!!busy}><Icon name="download" size={15} />{busy === 'save' ? 'Saving…' : 'Save image'}</button>
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
