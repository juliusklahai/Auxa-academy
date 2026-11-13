// The phone app's own start: no web home page. Onboarding (what Auxa does, what you want to learn),
// then sign up or sign in, then a plans page (as app stores expect), then straight into the lessons.
import { AuxaWord } from './Brand';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { onBack } from '../native/bridge';
import { ACCOUNTS_ENABLED, MONIME_ENABLED, PLANS, type PlanOption } from '../account/config';
import { TIER_NAME } from '../account/gate';
import { closeUpgrade, refreshProfile, startCheckout, useAccount } from '../account/store';
import { PERKS, SignInForm } from './Account';
import { FREE_LINE } from '../account/planCopy';
import { Icon } from './Icon';
import { setGuest } from './Landing';
import { INTEREST_LABEL, INTEREST_TRACK, saveProfile, type Experience, type Interest } from './learnerProfile';

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
const QUESTIONS = ['goal', 'experience', 'interests', 'minutes', 'name'] as const;
type Q = (typeof QUESTIONS)[number];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [goal, setGoal] = useState<Goal>('piano');
  const [experience, setExperience] = useState<Experience>('new');
  const [interests, setInterests] = useState<Interest[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [name, setName] = useState('');
  const total = SLIDES.length + QUESTIONS.length; // then the plan is built
  const q: Q | null = i >= SLIDES.length && i < total ? QUESTIONS[i - SLIDES.length] : null;
  const building = i >= total;
  const go = (n: number) => { if (n < 0 || n > total) return; setDir(n > i ? 1 : -1); setI(n); };
  useEffect(() => onBack(() => { if (i > 0) { go(i - 1); return true; } return false; }, 30), [i]); // eslint-disable-line
  const finish = () => { put(GOAL, goal); put(ONBOARDED, '1'); saveProfile({ experience, interests, minutes, name: name.trim() }); onDone(); };
  // swipe between the intro screens (not while answering)
  const touch = useRef<number | null>(null);
  const choice = (on: boolean, k: number, onClick: () => void, icon: string, title: string, sub?: string, multi = false) => (
    <button key={title} className={`ob-choice ${on ? 'on' : ''}`} style={{ animationDelay: `${0.2 + k * 0.06}s` }} onClick={onClick} aria-pressed={on}>
      <span className="ob-ic"><Icon name={icon} size={20} /></span>
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <span className={multi ? 'ob-check' : 'ob-radio'}>{multi && on && <Icon name="check" size={13} />}</span>
    </button>
  );
  return (
    <div className="ob onb" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; if (x0 === null || i >= SLIDES.length) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }}>
      <div className="ob-bg" aria-hidden><i /><i /><i /></div>
      <div className="ob-top">
        <span className="lp-logo"><AuxaWord height={24} /></span>
        {i < SLIDES.length && <button className="ob-skip" onClick={() => go(SLIDES.length)}>Skip</button>}
        {q && <span className="ob-step">{i - SLIDES.length + 1} of {QUESTIONS.length}</span>}
      </div>
      {i < SLIDES.length && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key={i}>
          <Art kind={SLIDES[i].art} />
          <h1><Words text={SLIDES[i].title} /></h1>
          <p className="fade">{SLIDES[i].body}</p>
        </div>
      )}
      {q === 'goal' && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="goal">
          <h1><Words text="What would you like to learn?" /></h1>
          <p className="fade">You can do both any time. This decides where you start.</p>
          <div className="ob-choices">
            {([['piano', 'Piano', 'Read music and play with both hands', 'piano'], ['voice', 'Singing', 'Sing in tune, read and write melodies', 'mic'], ['both', 'Both', 'Piano lessons plus the voice studio', 'note']] as const).map(([id, t, d, ic], k) => choice(goal === id, k, () => setGoal(id), ic, t, d))}
          </div>
        </div>
      )}
      {q === 'experience' && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="exp">
          <h1><Words text="How much do you play already?" /></h1>
          <p className="fade">Be honest: it only sets your starting point.</p>
          <div className="ob-choices">
            {([['new', 'Brand new', 'I have never really played', 'star'], ['little', 'A little', 'I know some notes or a few songs', 'note'], ['comfortable', 'Comfortable', 'I read music and use both hands', 'piano'], ['advanced', 'Advanced', 'Scales, chords and pieces are easy', 'award']] as const).map(([id, t, d, ic], k) => choice(experience === id, k, () => setExperience(id), ic, t, d))}
          </div>
        </div>
      )}
      {q === 'interests' && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="int">
          <h1><Words text="What music do you want to play?" /></h1>
          <p className="fade">Pick as many as you like.</p>
          <div className="ob-choices grid2">
            {(Object.keys(INTEREST_LABEL) as Interest[]).map((id, k) => choice(interests.includes(id), k, () => setInterests((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id])), ({ church: 'people', pop: 'chord', classical: 'doc', jazz: 'wave', gospel: 'mic', afro: 'clap', choir: 'people', ear: 'ear' } as Record<Interest, string>)[id], INTEREST_LABEL[id], undefined, true))}
          </div>
        </div>
      )}
      {q === 'minutes' && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="min">
          <h1><Words text="How long can you practise a day?" /></h1>
          <p className="fade">A little every day beats a lot once a week.</p>
          <div className="ob-choices grid2">
            {([[5, 'Casual'], [10, 'Regular'], [20, 'Serious'], [30, 'Intense']] as const).map(([m, t], k) => choice(minutes === m, k, () => setMinutes(m), 'clock', `${m} minutes`, t))}
          </div>
        </div>
      )}
      {q === 'name' && (
        <div className={`ob-slide ${dir > 0 ? 'in-r' : 'in-l'}`} key="name">
          <h1><Words text="What should we call you?" /></h1>
          <p className="fade">For your welcome and your certificates. You can skip this.</p>
          <input className="ob-name" value={name} maxLength={40} autoFocus placeholder="Your first name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(total); }} />
        </div>
      )}
      {building && <BuildPlan key="build" goal={goal} experience={experience} interests={interests} minutes={minutes} name={name.trim()} onDone={finish} />}
      {!building && (
        <div className="ob-foot">
          <div className="ob-dots">{Array.from({ length: total }, (_, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => k <= i && go(k)} aria-label={`Screen ${k + 1}`} />)}</div>
          <button className="btn lime ob-next" onClick={() => go(i + 1)}>{q === 'name' ? (name.trim() ? 'Build my plan' : 'Skip and build my plan') : 'Next'}<Icon name="next" size={16} /></button>
        </div>
      )}
    </div>
  );
}

/** "Building your plan": a few seconds of visible work, then a summary of what we set up. */
function BuildPlan({ goal, experience, interests, minutes, name, onDone }: { goal: Goal; experience: Experience; interests: Interest[]; minutes: number; name: string; onDone: () => void }) {
  const tracks = [...new Set(interests.map((x) => INTEREST_TRACK[x]))];
  const steps = [
    'Reading your answers',
    experience === 'new' ? 'Starting you from the very first key' : experience === 'little' ? 'Setting your starting level' : 'Preparing a placement test to skip ahead',
    tracks.length ? `Adding ${tracks.slice(0, 2).join(' and ')} lessons to your path` : 'Laying out your lesson path',
    goal === 'voice' ? 'Warming up the voice studio' : 'Choosing songs for your first week',
    'Tuning your coach\'s voice',
    `Setting a daily goal of ${minutes} minutes`,
  ];
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= steps.length) return;
    const t = window.setTimeout(() => { setN((x) => x + 1); try { audio.click(false, true, 0); } catch { /* audio not started */ } }, n === 0 ? 700 : 850 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = n >= steps.length;
  const pct = Math.round((Math.min(n, steps.length) / steps.length) * 100);
  const start = experience === 'new' || experience === 'little' ? 'Level 0 · Foundations' : 'Your level, after a 5-minute test';
  return (
    <div className="ob-slide ob-build" key="b">
      {!done ? (
        <>
          <div className="ob-ring" style={{ ['--p' as string]: `${pct}%` }}><span>{pct}%</span></div>
          <h1 className="ob-build-title">{name ? `Building your plan, ${name}` : 'Building your plan'}</h1>
          <ul className="ob-steps">
            {steps.map((s, k) => <li key={s} className={k < n ? 'done' : k === n ? 'now' : ''}><span className="ob-tick">{k < n ? <Icon name="check" size={12} /> : <i />}</span>{s}</li>)}
          </ul>
        </>
      ) : (
        <>
          <span className="ob-ready"><Icon name="check" size={26} /></span>
          <h1><Words text={name ? `You're all set, ${name}!` : "You're all set!"} /></h1>
          <div className="ob-plan fade">
            <div><small>Start</small><b>{start}</b></div>
            <div><small>Daily goal</small><b>{minutes} minutes</b></div>
            <div><small>Learning</small><b>{goal === 'both' ? 'Piano and singing' : goal === 'voice' ? 'Singing' : 'Piano'}</b></div>
            {tracks.length > 0 && <div><small>Your tracks</small><b>{tracks.join(', ')}</b></div>}
          </div>
          <button className="btn lime ob-go" onClick={onDone}>Let's go<Icon name="next" size={16} /></button>
        </>
      )}
    </div>
  );
}

/** Create an account or sign in (the app's second screen). */
export function AuthScreen({ onGuest }: { onGuest: () => void }) {
  return (
    <div className="ob auth">
      <div className="ob-top"><span className="lp-logo"><AuxaWord height={24} /></span></div>
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
        <span className="lp-logo"><AuxaWord height={24} /></span>
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
        <p className="pw-fine">{FREE_LINE} Monthly plans renew until cancelled; passes never renew. <button onClick={() => void restore()} disabled={busy === 'restore'}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</button> · <a href="#/terms">Terms</a> · <a href="#/privacy">Privacy</a> · <a href="#/subscriptions">Subscriptions and refunds</a></p>
      </div>
    </div>
  );
}

/** In the app, "upgrade" opens the full plans page instead of the web sheet. */
export function AppUpgrade({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <div className="pw-layer"><Paywall reason={reason} onClose={closeUpgrade} /></div>;
}
