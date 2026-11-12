// Public landing page + sign-in. Shown only when accounts are on and nobody is signed in
// (people can still "Start free" as a guest: the free levels work without an account).
// Look: charcoal / paper, floating glass nav, Geist headlines with one serif italic word,
// stacked step cards with phone screens, FAQ card, closing call to action, dotted wordmark.
import { useEffect, useRef, useState } from 'react';
import { DashField } from './DashField';
import { PLANS } from '../account/config';
import { SignInForm } from './Account';
import { Icon } from './Icon';
import { useTheme, setTheme, type Theme } from './theme';

const GUEST = 'maestro.guest.v1';
export const isGuest = () => { try { return localStorage.getItem(GUEST) === '1'; } catch { return false; } };
export const setGuest = (on: boolean) => { try { if (on) localStorage.setItem(GUEST, '1'); else localStorage.removeItem(GUEST); } catch { /* private mode */ } };

const ANDROID_APK = 'https://github.com/juliusklahai/maestro-academy/releases/download/android-test/Maestro.apk';
const price = (id: string) => PLANS.find((p) => p.id === id)?.price ?? '';

const FAQ: [string, string][] = [
  ['Do I need a real piano?', 'No. Play on any piano or keyboard near your phone, plug in a MIDI keyboard, or tap the keys on screen.'],
  ['How does it hear me?', 'Your phone’s microphone. Auxa picks out the notes you play, even softly, and tells you right away which were right.'],
  ['I have never played before. Is that fine?', 'Yes. Level 0 starts with finding middle C. Every new key comes with short songs where the band plays and you add just that key.'],
  ['Can I learn to sing too?', 'Yes. The singing coach starts gentle and encouraging, and gets strict about pitch only when you ask it to.'],
  ['What is free?', `Levels 0 to 2, the beginner songs and the Easy singing coach. Pro is ${price('pro') || 'monthly'}, or ${price('pass_pro') || 'a monthly pass'} by mobile money.`],
  ['Can I pay with Orange Money or Afrimoney?', 'Yes. Mobile money buys a one-month pass that never renews by itself. Cards renew monthly and you can cancel any time.'],
  ['Does it work offline?', 'Once opened, lessons keep working without data. Your progress syncs when you are back online.'],
];

export function Landing({ onStart, returning = false }: { onStart: () => void; returning?: boolean }) {
  const theme = useTheme();
  const [auth, setAuth] = useState<false | 'signin' | 'signup'>(false);
  const [open, setOpen] = useState(0);

  // Start free / Open app: on into onboarding and sign-up (the app decides what is still needed)
  const start = () => onStart();
  const steps = useRef<HTMLDivElement>(null);
  useStackedCards(steps, theme);
  const startLabel = returning ? 'Open app' : 'Start free';
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={`lp ${theme}`}>
      <div className="lp-glow a" aria-hidden /><div className="lp-glow b" aria-hidden />

      <header className="lp-nav">
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>auxa</span>
        <nav className="lp-links">
          <button onClick={() => go('steps')}>How it works</button>
          <button onClick={() => go('plans')}>Plans</button>
          <button onClick={() => go('faq')}>FAQ</button>
        </nav>
        <div className="lp-nav-end">
          <button className="lp-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
          </button>
          {!returning && <button className="lp-signin" onClick={() => setAuth('signin')}>Sign in</button>}
          <button className="lp-btn light" onClick={start}>{startLabel}</button>
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-pill"><i />Piano · Singing · Theory</span>
        <h1>Learn piano with a teacher <em>that listens.</em></h1>
        <p>Play on any piano. Auxa hears every note and shows you what to fix.</p>
        <div className="lp-cta">
          <button className="lp-btn light big" onClick={start}>{returning ? 'Continue learning' : 'Start free'}</button>
          {!returning && <button className="lp-btn ghost big" onClick={() => setAuth('signup')}>Create account</button>}
        </div>
      </section>

      <section className="lp-section" id="steps">
        <div className="lp-head">
          <span className="lp-pill"><i />Get started</span>
          <h2>Three steps to <br />your <em>first</em> song.</h2>
        </div>
        <div className="lp-steps" ref={steps}>
          <Step n="01" kicker="Step 1 · Start free" title="Pick where you start." text="From your very first note to sight-reading. No card needed." screen={<Device3D src="landing/screen-home.jpg" alt="Auxa overview with your lessons" chips={CHIPS_START} />} />
          <Step n="02" kicker="Step 2 · Play" title="Play. It listens." text="Any piano near your phone, or a MIDI keyboard. Every note checked as you play." screen={<Device3D src="landing/screen-play.jpg" alt="A lesson: notes turn green as you play them" chips={CHIPS_PLAY} />} />
          <Step n="03" kicker="Step 3 · Play along" title="The band plays, you join in." text="Short songs for every new key, until it feels easy." screen={<Device3D src="landing/screen-along.jpg" alt="A play-along song with guide hands" chips={CHIPS_ALONG} />} />
        </div>
      </section>

      <section className="lp-section" id="plans">
        <div className="lp-head">
          <span className="lp-pill"><i />Plans</span>
          <h2>Start free. <em>Grow</em> when ready.</h2>
        </div>
        <div className="lp-plans">
          <Plan name="Free" price="SLE 0" note="For good" items={['Levels 0 to 2', 'Beginner songs', 'Easy singing coach']} onPick={start} cta="Start free" />
          <Plan name="Pro" price={price('pro')} note={`or ${price('pass_pro')} a month by mobile money`} items={['Levels 3 to 6', 'Every song', 'Standard singing coach', 'Progress on all devices']} onPick={() => setAuth('signup')} cta="Get Pro" />
          <Plan name="Plus" price={price('plus')} note={`or ${price('pass_plus')} a month by mobile money`} items={['Everything in Pro', 'Levels 7 to 9', 'Pro singing coach', 'Your own scores and choir parts']} onPick={() => setAuth('signup')} cta="Get Plus" best />
        </div>
      </section>

      <section className="lp-section lp-faq" id="faq">
        <div className="lp-faq-head">
          <span className="lp-pill"><i />FAQ</span>
          <h2>The questions <br />we <em>always</em> get.</h2>
        </div>
        <div className="lp-faq-card">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`lp-q ${open === i ? 'open' : ''}`}>
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{q}</span><span className="lp-plus" aria-hidden>{open === i ? '×' : '+'}</span>
              </button>
              <div className="lp-a"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <span className="lp-app-icon" aria-hidden><span className="lp-mark big"><i /><i /><i /></span></span>
        <span className="lp-pill"><i />Get the app</span>
        <h2>Play a note. <em>Hear</em> it right.</h2>
        <p>Phone, tablet or computer. Your progress follows you.</p>
        <div className="lp-cta">
          <button className="lp-btn light big" onClick={start}>Open in your browser</button>
          <a className="lp-store" href={ANDROID_APK}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.15c-1.79 0-3.47.39-4.92 1L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" /></svg>
            <span><small>Test version for</small><b>Android</b></span>
          </a>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-row">
          <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>auxa</span>
          <nav>
            <button onClick={() => go('plans')}>Plans</button>
            <button onClick={() => go('faq')}>FAQ</button>
            {returning ? <button onClick={start}>Open app</button> : <button onClick={() => setAuth('signin')}>Sign in</button>}
          </nav>
        </div>
        <div className="lp-field"><DashField text="auxa" dark={theme === 'dark'} /></div>
        <nav className="lp-legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/subscriptions">Subscriptions and refunds</a><a href="#/licenses">Credits</a></nav>
        <small className="lp-copy">© {new Date().getFullYear()} Auxa Academy</small>
      </footer>

      {auth && (
        <div className="lp-modal" onClick={() => setAuth(false)}>
          <div className="lp-modal-card" role="dialog" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
            <button className="lp-plus close" onClick={() => setAuth(false)} aria-label="Close">×</button>
            <span className="lp-pill"><i />Welcome</span>
            <SignInForm key={auth} start={auth} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Step cards stack as you scroll: each card sticks a little lower than the one before, and as the next
 * card slides over it, the card underneath shrinks back and dims, following the scroll exactly.
 */
function useStackedCards(box: React.RefObject<HTMLDivElement | null>, theme: Theme) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('.lp-step')];
    const cards = items.map((a) => a.querySelector<HTMLElement>('.lp-step-card')!);
    const dim = theme === 'dark' ? 0.5 : 0.12;
    let raf = 0;
    const update = () => {
      raf = 0;
      for (let i = 0; i < items.length; i++) {
        const next = items[i + 1];
        let p = 0;
        if (next) {
          const cur = items[i].getBoundingClientRect(), nx = next.getBoundingClientRect();
          // 0 when the next card starts to cover this one, 1 once it has fully slid over it
          p = Math.max(0, Math.min(1, (cur.bottom - nx.top) / cur.height));
        }
        const c = cards[i];
        c.style.transform = p ? `translateY(${(-p * 14).toFixed(1)}px) scale(${(1 - p * 0.1).toFixed(4)})` : '';
        c.style.filter = p ? `brightness(${(1 - p * dim).toFixed(3)})` : '';
      }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [box, theme]);
}

function Step({ n, kicker, title, text, screen }: { n: string; kicker: string; title: string; text: string; screen: React.ReactNode }) {
  return (
    <article className="lp-step">
      <div className="lp-step-card">
      <div className="lp-step-copy">
        <span className="lp-num" aria-hidden>{n}</span>
        <div>
          <span className="lp-kicker">{kicker}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>
      <div className="lp-step-shot">{screen}</div>
      </div>
    </article>
  );
}

function Plan({ name, price: p, note, items, onPick, cta, best }: { name: string; price: string; note: string; items: string[]; onPick: () => void; cta: string; best?: boolean }) {
  return (
    <div className={`lp-plan ${best ? 'best' : ''}`}>
      <div className="lp-plan-top"><b>{name}</b>{best && <span className="lp-tag">Everything</span>}</div>
      <div className="lp-price">{p}</div>
      <small>{note}</small>
      <ul>{items.map((x) => <li key={x}><Icon name="check" size={14} />{x}</li>)}</ul>
      <button className={`lp-btn ${best ? 'light' : 'ghost'}`} onClick={onPick}>{cta}</button>
    </div>
  );
}

/* ---------- realistic phone: titanium frame with depth, real app screen, glass cards floating in front ---------- */

interface Chip { x: number; y: number; z: number; r?: number; w?: number; node: React.ReactNode }

function Device3D({ src, alt, chips }: { src: string; alt: string; chips: Chip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // tilt toward the pointer (eased by CSS); back to rest when it leaves
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(-16 + px * 14).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(6 - py * 10).toFixed(2)}deg`);
  };
  const leave = () => { ref.current?.style.removeProperty('--ry'); ref.current?.style.removeProperty('--rx'); };
  return (
    <div className="lp-scene" ref={ref} onPointerMove={move} onPointerLeave={leave}>
      <div className="lp-dev">
        {[6, 5, 4, 3, 2, 1].map((k) => <i key={k} className="lp-dev-edge" style={{ transform: `translateZ(${-k * 2.2}px)` }} />)}
        <div className="lp-dev-body">
          <i className="lp-dev-key k1" /><i className="lp-dev-key k2" /><i className="lp-dev-key k3" /><i className="lp-dev-key k4" />
          <div className="lp-dev-screen">
            <img src={src} alt={alt} loading="lazy" draggable={false} />
            <i className="lp-dev-island" />
            <i className="lp-dev-glare" />
          </div>
        </div>
        {chips.map((c, i) => (
          <div key={i} className="lp-glass" style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.w ? `${c.w}px` : undefined, transform: `translateZ(${c.z}px) rotateZ(${c.r ?? 0}deg)`, animationDelay: `${i * -1.7}s` }}>{c.node}</div>
        ))}
      </div>
      <i className="lp-dev-shadow" />
    </div>
  );
}

const MicIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const Toggle = ({ on }: { on?: boolean }) => <span className={`lp-toggle ${on ? 'on' : ''}`}><i /></span>;

const CHIPS_START: Chip[] = [
  { x: -34, y: 22, z: 90, r: -4, w: 236, node: (
    <div className="lg-alert">
      <span className="lg-ic"><MicIcon /></span>
      <b>“Auxa” would like to use the microphone</b>
      <small>So it can hear you play and sing.</small>
      <div className="lg-alert-btns"><span>Don’t allow</span><span className="ok">Allow</span></div>
    </div>) },
  { x: 62, y: 62, z: 120, r: 3, w: 190, node: (
    <div className="lg-row"><span className="lg-badge">0</span><span><b>Foundations</b><small>Level 0 · free</small></span><span className="lg-tick">✓</span></div>) },
];
const CHIPS_PLAY: Chip[] = [
  { x: 64, y: 16, z: 110, r: 4, w: 168, node: (
    <div className="lg-row"><span className="lg-tick big">✓</span><span><b>C4 · Correct</b><small>right on time</small></span></div>) },
  { x: -30, y: 58, z: 80, r: -3, w: 178, node: (
    <div className="lg-listen"><span className="lg-ic"><MicIcon /></span><span className="lg-wave">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />)}</span><small>Listening</small></div>) },
];
const CHIPS_ALONG: Chip[] = [
  { x: 60, y: 14, z: 100, r: 3, w: 196, node: (
    <div className="lg-toggles">
      <div><span>Band</span><Toggle on /></div>
      <div><span>Metronome</span><Toggle /></div>
      <div><span>Guide hands</span><Toggle on /></div>
    </div>) },
  { x: -28, y: 60, z: 120, r: -4, w: 150, node: (
    <div className="lg-score"><b>92%</b><small>on the beat</small><span className="lg-days">{['M', 'T', 'W', 'T', 'F'].map((d, i) => <i key={i}>{d}</i>)}</span></div>) },
];

/** Shown for a moment while we check whether someone is signed in. */
export function Splash() {
  return <div className="landing splash"><span className="circle brand" aria-hidden><i /><i /><i /></span></div>;
}
