// Public certificate check (#/verify/CODE): asks the Auxa database about a code and redraws the
// certificate from what the database holds, security marks included, so anyone can compare.
import { useEffect, useMemo, useState } from 'react';
import { verifyCertificate, type CertRecord } from '../account/certificates';
import { LEVEL_NAMES } from '../curriculum/levels';
import { certificateSvg } from '../progress/certSvg';
import { sealTune, SITE } from '../progress/certSeal';
import { nameShape } from '../progress/nameShape';
import { audio } from '../audio/engine';
import { AuxaWord } from './Brand';
import { Icon } from './Icon';

export function useVerifyRoute(): string | null {
  const read = () => { const m = /^#\/verify\/([A-Za-z0-9-]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]).toUpperCase() : null; };
  const [code, setCode] = useState(read);
  useEffect(() => { const f = () => setCode(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return code;
}

const longDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function VerifyPage({ code }: { code: string }) {
  const [rec, setRec] = useState<CertRecord | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [shape, setShape] = useState<{ d: string; w: number } | null>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); setRec(undefined); verifyCertificate(code).then(setRec).catch((e: Error) => { setErr(e.message); setRec(null); }); }, [code]);
  useEffect(() => { if (rec) void nameShape(rec.name).then(setShape); }, [rec]);
  const svg = useMemo(() => (rec ? certificateSvg(rec.name, rec.level, rec.earned_on, undefined, { nameShape: shape ?? undefined, code: rec.code, seal: rec.seal }) : ''), [rec, shape]);
  const status = rec === undefined ? 'checking' : !rec ? 'missing' : rec.revoked ? 'revoked' : rec.replaced_by ? 'replaced' : 'valid';
  const play = () => { if (!rec) return; audio.stopAll(); audio.playNotes(sealTune(rec.seal).map((m, i) => ({ midi: m, startMs: i * 380, durMs: i === 7 ? 900 : 340 }))); };
  const home = () => { location.href = SITE; };
  return (
    <div className="legal verify">
      <header className="legal-top">
        <button className="ob-close" onClick={home} aria-label="Auxa home"><Icon name="back" size={18} /></button>
        <span className="lp-logo"><AuxaWord height={24} /></span>
      </header>
      <article className="legal-body">
        <div className={`vf-badge ${status}`}>
          <span className="vf-ic"><Icon name={status === 'valid' ? 'check' : status === 'checking' ? 'clock' : 'close'} size={22} /></span>
          <div>
            <b>{status === 'checking' ? 'Checking…' : status === 'valid' ? 'Authentic Auxa certificate' : status === 'replaced' ? 'Replaced by a newer certificate' : status === 'revoked' ? 'This certificate was withdrawn' : 'No certificate with this code'}</b>
            <small>{code}</small>
          </div>
        </div>
        {rec && (
          <>
            <dl className="vf-facts">
              <div><dt>Name</dt><dd>{rec.name}</dd></div>
              <div><dt>Achievement</dt><dd>Level {rec.level} · {LEVEL_NAMES[rec.level] ?? rec.level_name}</dd></div>
              <div><dt>Completed</dt><dd>{longDate(rec.earned_on)}</dd></div>
              <div><dt>Issued</dt><dd>{longDate(rec.issued_at)}</dd></div>
            </dl>
            {rec.replaced_by && <p>The learner issued a newer copy (usually to fix the name): <a href={`#/verify/${rec.replaced_by}`}>{rec.replaced_by}</a>.</p>}
            <div className="cert-view vf-cert" dangerouslySetInnerHTML={{ __html: svg }} />
            <button className="btn lime" onClick={play}><Icon name="play" size={14} />Play this certificate's melody</button>
            <h3>How to check a copy you were given</h3>
            <ul>
              <li>The name, level and date must match this page exactly.</li>
              <li>The pattern around the level badge, the tiny text in its ring and the lit keys at the bottom are made from a secret seal only Auxa's database holds. They must look the same as above. Any edit or forgery shows a different pattern and melody.</li>
              <li>The QR code on a genuine certificate always opens this page on {new URL(SITE).host}.</li>
            </ul>
          </>
        )}
        {rec === null && <p>{err || 'Check the code for typos. Genuine codes look like AUX-XXXXX-XXXXX and open from the QR code on the certificate.'}</p>}
        <div className="vf-cta">
          <b>Learn piano and singing with a teacher that listens.</b>
          <p>Auxa hears every note you play and shows you what to fix. Start free.</p>
          <button className="btn lime" onClick={home}>Start learning on Auxa</button>
        </div>
      </article>
    </div>
  );
}
