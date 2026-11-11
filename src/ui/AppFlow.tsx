// The phone app's own start: no web home page. Onboarding (what Maestro does, what you want to learn),
// then sign up or sign in, then a plans page (as app stores expect), then straight into the lessons.
import { useEffect, useState } from 'react';
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
  { title: 'Learn piano and singing,\none note at a time', body: 'Short lessons, real songs and a coach that explains every step out loud.', art: 'keys' },
  { title: 'Play, and Maestro listens', body: 'Through your microphone or a MIDI keyboard, every note is checked: right note, right time, right length.', art: 'check' },
  { title: 'Sing it, see it written', body: 'Sing a tune and watch it turn into a score. Add three more voices with one tap.', art: 'score' },
] as const;

function Art({ kind }: { kind: string }) {
  if (kind === 'keys') return (
    <div className="ob-art keys" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => <span key={i} className={`wk ${i === 2 ? 'lit' : ''}`} />)}
      {[0, 1, 3, 4, 5].map((i) => <span key={i} className="bk" style={{ left: `${(i + 1) * 12.5 - 3.5}%` }} />)}
    </div>
  );
  if (kind === 'check') return (
    <div className="ob-art check" aria-hidden>
      {['ok', 'ok', 'late', 'ok', 'now'].map((s, i) => <span key={i} className={`dot ${s}`} />)}
      <b>98</b><small>/100</small>
    </div>
  );
  return (
    <div className="ob-art score" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className="line" style={{ top: `${28 + i * 11}%` }} />)}
      {[38, 50, 44, 61, 55, 67].map((y, i) => <span key={i} className="note" style={{ left: `${14 + i * 13}%`, top: `${y}%` }} />)}
      <span className="mic"><Icon name="mic" size={20} /></span>
    </div>
  );
}

/** Three short screens and one question, then on to the account. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [goal, setGoal] = useState<Goal>('piano');
  const last = i === SLIDES.length;
  useEffect(() => onBack(() => { if (i > 0) { setI(i - 1); return true; } return false; }, 30), [i]);
  const finish = () => { put(GOAL, goal); put(ONBOARDED, '1'); onDone(); };
  return (
    <div className="ob">
      <div className="ob-top">
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span>
        {!last && <button className="ob-skip" onClick={() => setI(SLIDES.length)}>Skip</button>}
      </div>
      {!last ? (
        <div className="ob-slide" key={i}>
          <Art kind={SLIDES[i].art} />
          <h1>{SLIDES[i].title}</h1>
          <p>{SLIDES[i].body}</p>
        </div>
      ) : (
        <div className="ob-slide" key="goal">
          <h1>What would you like to learn?</h1>
          <p>You can do both any time. This only decides where you start.</p>
          <div className="ob-choices">
            {([['piano', 'Piano', 'Read music and play with both hands', 'piano'], ['voice', 'Singing', 'Sing in tune, read and write melodies', 'mic'], ['both', 'Both', 'Piano lessons plus the voice studio', 'note']] as const).map(([id, t, d, ic]) => (
              <button key={id} className={`ob-choice ${goal === id ? 'on' : ''}`} onClick={() => setGoal(id)}>
                <span className="ob-ic"><Icon name={ic} size={20} /></span>
                <span><b>{t}</b><small>{d}</small></span>
                <span className="ob-radio" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ob-foot">
        <div className="ob-dots">{[...SLIDES, null].map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <button className="btn lime ob-next" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Continue' : 'Next'}<Icon name="next" size={16} /></button>
      </div>
    </div>
  );
}

/** Create an account or sign in (the app's second screen). */
export function AuthScreen({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="ob auth">
      <div className="ob-top"><span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span></div>
      <div className="ob-slide">
        <h1>Save your progress</h1>
        <p>Make a free account so your lessons, songs and scores follow you to every device.</p>
        <div className="ob-form"><SignInForm start="signup" /></div>
        <button className="ob-guest" onClick={() => { setGuest(true); onGuest(); }}>Not now, try it first</button>
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
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span>
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
        <p className="pw-fine">Free always includes Levels 0 to 2, beginner songs and Easy singing. Monthly plans renew until cancelled; passes never renew. <button onClick={() => void restore()} disabled={busy === 'restore'}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</button></p>
      </div>
    </div>
  );
}

/** In the app, "upgrade" opens the full plans page instead of the web sheet. */
export function AppUpgrade({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <div className="pw-layer"><Paywall reason={reason} onClose={closeUpgrade} /></div>;
}
