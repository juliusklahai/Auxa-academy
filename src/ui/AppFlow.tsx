// The phone app's own start: no web home page. Onboarding (what Auxa does, what you want to learn),
// then sign up or sign in, then a plans page (as app stores expect), then straight into the lessons.
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { onBack } from '../native/bridge';
import { ACCOUNTS_ENABLED, MONIME_ENABLED, PLANS, type PlanOption } from '../account/config';
import { TIER_NAME } from '../account/gate';
import { closeUpgrade, refreshProfile, startCheckout, useAccount } from '../account/store';
import { PERKS, SignInForm } from './Account';
import { Icon } from './Icon';
import { setGuest } from './Landing';

const ONBOARDED = 'maestro.app.onboarded';
const PAYWALL_SEEN = 'maestro.app.paywallSeen';
const GOAL = 'maestro.app.goal';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const onboarded = () => get(ONBOARDED) === '1';
export const paywallSeen = () => get(PAYWALL_SEEN) === '1';
export const markPaywallSeen = () => put(PAYWALL_SEEN, '1');
export type Goal = 'piano' | 'voice' | 'both';
export const appGoal = (): Goal => (get(GOAL) as Goal) || 'piano';

const SLIDES = [
  { title: 'Learn piano and singing, one note at a time', body: 'Short lessons, real songs and a coach that explains every step out loud.', art: 'keys' },
  { title: 'Play, and Auxa listens', body: 'Through your microphone or a MIDI keyboard, every note is checked: right note, right time, right length.', art: 'check' },
  { title: 'Sing it, see it written', body: 'Sing a tune and watch it turn into a score. Add three more voices with one tap.', art: 'score' },
] as const;

const MELODY = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 7]; // white-key indexes: C D E F G F E D C E G C
const KEY_MIDI = [60, 62, 64, 65, 67, 69, 71, 72];

/** A little keyboard that plays itself; tap it to hear the tune. */
function ArtKeys() {
  const [down, setDown] = useState(-1);
  const [notes, setNotes] = useState<{ id: number; k: number }[]>([]);
  useEffect(() => {
    let n = 0, id = 0;
    const t = window.setInterval(() => {
      const k = MELODY[n++ % MELODY.length];
      setDown(k);
      const nid = ++id;
      setNotes((x) => [...x.slice(-6), { id: nid, k }]);
      window.setTimeout(() => setDown((d) => (d === k ? -1 : d)), 300);
    }, 430);
    return () => clearInterval(t);
  }, []);
  const hear = () => { audio.ensure(); audio.playNotes(MELODY.map((k, i) => ({ midi: KEY_MIDI[k], startMs: i * 260, durMs: 240 }))); };
  return (
    <button className="ob-art keys" aria-label="Hear the tune" onClick={hear}>
      <span className="ob-glass-tag">Tap to hear it</span>
      <div className="kb">
        {KEY_MIDI.map((_, i) => <span key={i} className={`wk ${down === i ? 'down' : ''}`} />)}
        {[0, 1, 3, 4, 5].map((i) => <span key={i} className="bk" style={{ left: `calc(${(i + 1) * 12.5}% - 4.5%)` }} />)}
        {notes.map((n) => <i key={n.id} className="fly" style={{ left: `calc(${n.k * 12.5 + 6.25}% - 9px)` }}>{n.id % 3 ? '♪' : '♫'}</i>)}
      </div>
    </button>
  );
}

/** Notes drop onto a line, each one gets checked, the score counts up. */
function ArtCheck() {
  const [score, setScore] = useState(0);
  useEffect(() => {
    let v = 0;
    const t = window.setInterval(() => { v = Math.min(98, v + 3); setScore(v); if (v >= 98) clearInterval(t); }, 45);
    return () => clearInterval(t);
  }, []);
  const rows = [['C', 'Right note', 'ok'], ['E', 'On time', 'ok'], ['G', 'A little late', 'late'], ['C', 'Held just right', 'ok']] as const;
  return (
    <div className="ob-art check" aria-hidden>
      <div className="flow">
        <span className="rail" />
        {rows.map(([n, t, st], i) => (
          <div key={i} className="row" style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
            <span className={`node ${st}`} style={{ animationDelay: `${0.25 + i * 0.45}s` }} />
            <span className="glass" style={{ animationDelay: `${0.4 + i * 0.45}s` }}><b>{n}</b>{t}<em className={st}>{st === 'ok' ? '✓' : '~'}</em></span>
          </div>
        ))}
      </div>
      <div className="score"><b>{score}</b><small>/100</small></div>
    </div>
  );
}

/** Rolling words, notes appearing on a staff, then three more voices. */
function ArtScore() {
  const words = ['Sing it', 'Hum it', 'Whistle it', 'Write it'];
  const [w, setW] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setW((x) => (x + 1) % words.length), 1300); return () => clearInterval(t); }, []); // eslint-disable-line
  return (
    <div className="ob-art score" aria-hidden>
      <div className="wheel">{words.map((x, i) => <span key={x} className={i === w ? 'on' : i === (w + words.length - 1) % words.length ? 'up' : i === (w + 1) % words.length ? 'down' : 'gone'}>{x}</span>)}</div>
      <div className="staffs">
        {['S', 'A', 'T', 'B'].map((v, r) => (
          <div key={v} className={`stf r${r}`} style={{ animationDelay: `${r ? 1.4 + r * 0.25 : 0}s` }}>
            <small>{v}</small>
            {[0, 1, 2, 3, 4].map((l) => <i key={l} className="ln" style={{ top: `${l * 5}px` }} />)}
            {[[0, 12], [1, 8], [2, 10], [3, 4], [4, 6], [5, 2]].map(([x, y]) => (
              <span key={x} className="nt" style={{ left: `${18 + x * 13}%`, top: `${y + r * 2 - 3}px`, animationDelay: `${(r ? 1.5 + r * 0.25 : 0.2) + x * 0.12}s` }} />
            ))}
          </div>
        ))}
        <span className="chip">+ 3 voices</span>
      </div>
    </div>
  );
}

function Art({ kind }: { kind: string }) {
  return kind === 'keys' ? <ArtKeys /> : kind === 'check' ? <ArtCheck /> : <ArtScore />;
}

/** Title that rises in word by word. */
const Words = ({ text }: { text: string }) => <>{text.split(' ').map((w, i) => <span key={i} className="w" style={{ animationDelay: `${0.12 + i * 0.05}s` }}>{w} </span>)}</>;

/** Three short animated screens and one question, then on to the account. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [goal, setGoal] = useState<Goal>('piano');
  const last = i === SLIDES.length;
  const go = (n: number) => { if (n < 0 || n > SLIDES.length) return; setDir(n > i ? 1 : -1); setI(n); };
  useEffect(() => onBack(() => { if (i > 0) { go(i - 1); return true; } return false; }, 30), [i]); // eslint-disable-line
  const finish = () => { put(GOAL, goal); put(ONBOARDED, '1'); onDone(); };
  // swipe between screens
  const touch = useRef<number | null>(null);
  return (
    <div className="ob onb" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }}>
      <div className="ob-bg" aria-hidden><i /><i /><i /></div>
      <div className="ob-top">
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>auxa</span>
        {!last && <button className="ob-skip" onClick={() => go(SLIDES.length)}>Skip</button>}
      </div>
      {!last ? (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key={i}>
          <Art kind={SLIDES[i].art} />
          <h1><Words text={SLIDES[i].title} /></h1>
          <p className="fade">{SLIDES[i].body}</p>
        </div>
      ) : (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="goal">
          <h1><Words text="What would you like to learn?" /></h1>
          <p className="fade">You can do both any time. This only decides where you start.</p>
          <div className="ob-choices">
            {([['piano', 'Piano', 'Read music and play with both hands', 'piano'], ['voice', 'Singing', 'Sing in tune, read and write melodies', 'mic'], ['both', 'Both', 'Piano lessons plus the voice studio', 'note']] as const).map(([id, t, d, ic], k) => (
              <button key={id} className={`ob-choice ${goal === id ? 'on' : ''}`} style={{ animationDelay: `${0.25 + k * 0.08}s` }} onClick={() => setGoal(id)}>
                <span className="ob-ic"><Icon name={ic} size={20} /></span>
                <span><b>{t}</b><small>{d}</small></span>
                <span className="ob-radio" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ob-foot">
        <div className="ob-dots">{[...SLIDES, null].map((_, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => go(k)} aria-label={`Screen ${k + 1}`} />)}</div>
        <button className="btn lime ob-next" onClick={() => (last ? finish() : go(i + 1))}>{last ? 'Continue' : 'Next'}<Icon name="next" size={16} /></button>
      </div>
    </div>
  );
}

/** Create an account or sign in (the app's second screen). */
export function AuthScreen({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="ob auth">
      <div className="ob-top"><span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>auxa</span></div>
      <div className="ob-slide">
        <h1>Save your progress</h1>
        <p>Make a free account so your lessons, songs and scores follow you to every device.</p>
        <div className="ob-form"><SignInForm start="signup" /></div>
        <button className="ob-guest" onClick={() => { setGuest(true); onGuest(); }}>Not now, try it first</button>
        <p className="ob-legal">By continuing you agree to the <a href="#/terms">Terms of Use</a> and <a href="#/privacy">Privacy Policy</a>.</p>
      </div>
    </div>
  );
}

/**
 * The plans page, full screen like a store app's: shown once after sign-up, and whenever something
 * needs a higher plan (reason). "Continue with Free" always leaves it.
 */
export function Paywall({ reason, onClose }: { reason?: string | null; onClose: () => void }) {
  const a = useAccount();
  useEffect(() => onBack(() => { onClose(); return true; }, 40), [onClose]);
  const [tier, setTier] = useState<'pro' | 'plus'>('plus');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const opts = PLANS.filter((p) => p.tier === tier && (p.provider === 'stripe' || MONIME_ENABLED));
  const buy = async (p: PlanOption) => {
    setBusy(p.id); setErr('');
    try { await startCheckout(p.id, p.provider); } catch (x) { setErr((x as Error).message); setBusy(''); }
  };
  const restore = async () => { setBusy('restore'); try { await refreshProfile(); } finally { setBusy(''); } };
  if (!ACCOUNTS_ENABLED) return null;
  return (
    <div className="ob paywall">
      <div className="ob-top">
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>auxa</span>
        <button className="ob-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="ob-slide pw">
        <small className="pw-kicker">{reason ?? 'Unlock everything'}</small>
        <h1>Learn faster with {TIER_NAME[tier]}</h1>
        <div className="pw-tiers" role="tablist">
          {(['pro', 'plus'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>
              {TIER_NAME[t]}{t === 'plus' && <span className="pw-best">Best</span>}
            </button>
          ))}
        </div>
        <ul className="pw-perks">{PERKS[tier].map((x) => <li key={x}><span><Icon name="check" size={14} /></span>{x}</li>)}</ul>
        {a.ent[tier] ? <p className="pw-have"><Icon name="check" size={16} /> You have {TIER_NAME[tier]}. Enjoy!</p> : (
          <div className="pw-buy">
            {opts.map((p) => (
              <button key={p.id} className={`pw-plan ${p.provider === 'stripe' ? 'main' : ''}`} disabled={!!busy || !a.user} onClick={() => void buy(p)}>
                <span><b>{p.provider === 'stripe' ? 'Monthly' : '1-month pass'}</b><small>{p.note}</small></span>
                <strong>{busy === p.id ? 'Opening…' : p.price}</strong>
              </button>
            ))}
            {!a.user && (showSignIn ? <div className="ob-form"><SignInForm compact start="signup" /></div> : <button className="btn dark pw-signin" onClick={() => setShowSignIn(true)}>Sign in or create an account to choose a plan</button>)}
          </div>
        )}
        {err && <p className="err small">{err}</p>}
      </div>
      <div className="ob-foot col">
        <button className="btn ghost ob-free" onClick={onClose}>Continue with Free</button>
        <p className="pw-fine">Free always includes Levels 0 to 2, beginner songs and Easy singing. Monthly plans renew until cancelled; passes never renew. <button onClick={() => void restore()} disabled={busy === 'restore'}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</button> · <a href="#/terms">Terms</a> · <a href="#/privacy">Privacy</a> · <a href="#/subscriptions">Subscriptions and refunds</a></p>
      </div>
    </div>
  );
}

/** In the app, "upgrade" opens the full plans page instead of the web sheet. */
export function AppUpgrade({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <div className="pw-layer"><Paywall reason={reason} onClose={closeUpgrade} /></div>;
}
