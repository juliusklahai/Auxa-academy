// Public landing page + sign-in. Shown only when accounts are on and nobody is signed in
// (people can still "Start free" as a guest: the free levels work without an account).
// Look: charcoal / paper, floating glass nav, Geist headlines with one serif italic word,
// stacked step cards with phone screens, FAQ card, closing call to action, dotted wordmark.
import { useEffect, useRef, useState } from 'react';
import { DashField } from './DashField';
import { PLANS } from '../account/config';
import { SignInForm } from './Account';
import { Icon } from './Icon';
import { native } from '../native/bridge';

const GUEST = 'maestro.guest.v1';
export const isGuest = () => { try { return localStorage.getItem(GUEST) === '1'; } catch { return false; } };
export const setGuest = (on: boolean) => { try { if (on) localStorage.setItem(GUEST, '1'); else localStorage.removeItem(GUEST); } catch { /* private mode */ } };

const THEME = 'maestro.landing.theme';
type Theme = 'dark' | 'light';
const initialTheme = (): Theme => {
  try { const t = localStorage.getItem(THEME); if (t === 'dark' || t === 'light') return t; } catch { /* fine */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};
const ANDROID_APK = 'https://github.com/juliusklahai/maestro-academy/releases/download/android-test/Maestro.apk';
const price = (id: string) => PLANS.find((p) => p.id === id)?.price ?? '';

const FAQ: [string, string][] = [
  ['Do I need a real piano?', 'No. Play on any piano or keyboard near your phone, plug in a MIDI keyboard, or tap the keys on screen.'],
  ['How does it hear me?', 'Your phone’s microphone. Maestro picks out the notes you play, even softly, and tells you right away which were right.'],
  ['I have never played before. Is that fine?', 'Yes. Level 0 starts with finding middle C. Every new key comes with short songs where the band plays and you add just that key.'],
  ['Can I learn to sing too?', 'Yes. The singing coach starts gentle and encouraging, and gets strict about pitch only when you ask it to.'],
  ['What is free?', `Levels 0 to 2, the beginner songs and the Easy singing coach. Pro is ${price('pro') || 'monthly'}, or ${price('pass_pro') || 'a monthly pass'} by mobile money.`],
  ['Can I pay with Orange Money or Afrimoney?', 'Yes. Mobile money buys a one-month pass that never renews by itself. Cards renew monthly and you can cancel any time.'],
  ['Does it work offline?', 'Once opened, lessons keep working without data. Your progress syncs when you are back online.'],
];

export function Landing({ onStart, returning = false }: { onStart: () => void; returning?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [auth, setAuth] = useState<false | 'signin' | 'signup'>(false);
  const [open, setOpen] = useState(0);
  useEffect(() => { try { localStorage.setItem(THEME, theme); } catch { /* fine */ } native?.setBars?.(theme === 'light'); return () => native?.setBars?.(false); }, [theme]);
  useEffect(() => {
    const id = 'landing-fonts';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Inter:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap';
    document.head.appendChild(l);
  }, []);
  const start = () => { if (!returning) setGuest(true); onStart(); };
  const steps = useRef<HTMLDivElement>(null);
  useStackedCards(steps, theme);
  const startLabel = returning ? 'Open app' : 'Start free';
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={`lp ${theme}`}>
      <div className="lp-glow a" aria-hidden /><div className="lp-glow b" aria-hidden />

      <header className="lp-nav">
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span>
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
        <p>Play on any piano. Maestro hears every note and shows you what to fix.</p>
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
          <Step n="01" kicker="Step 1 · Start free" title="Pick where you start." text="From your very first note to sight-reading. No card needed." screen={<ScreenLevels />} />
          <Step n="02" kicker="Step 2 · Play" title="Play. It listens." text="Any piano near your phone, or a MIDI keyboard. Every note checked as you play." screen={<ScreenListen />} />
          <Step n="03" kicker="Step 3 · Play along" title="The band plays, you join in." text="Short songs for every new key, until it feels easy." screen={<ScreenPlayAlong />} />
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
          <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span>
          <nav>
            <button onClick={() => go('plans')}>Plans</button>
            <button onClick={() => go('faq')}>FAQ</button>
            {returning ? <button onClick={start}>Open app</button> : <button onClick={() => setAuth('signin')}>Sign in</button>}
          </nav>
        </div>
        <div className="lp-field"><DashField text="maestro" dark={theme === 'dark'} /></div>
        <small className="lp-copy">© {new Date().getFullYear()} Maestro Academy</small>
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
      <div className="lp-step-shot"><Phone>{screen}</Phone></div>
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

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-phone">
      <div className="lp-phone-bar"><span>9:41</span><i className="lp-island" /><span className="lp-dots"><i /><i /><i /></span></div>
      <div className="lp-phone-screen">{children}</div>
    </div>
  );
}

function ScreenLevels() {
  const rows: [string, string, boolean][] = [['Level 0', 'Meet the keyboard', true], ['Level 1', 'Five-finger tunes', true], ['Level 2', 'Both hands', false], ['Level 3', 'Rhythm & rests', false]];
  return (
    <>
      <b className="ps-title">Where do you start?</b>
      <small className="ps-sub">Pick a level. You can change it later.</small>
      <div className="ps-list">
        {rows.map(([l, t, done], i) => (
          <div key={l} className={`ps-row ${i === 1 ? 'on' : ''}`}>
            <span className="ps-badge">{l.split(' ')[1]}</span>
            <span className="ps-row-text"><b>{t}</b><small>{l}</small></span>
            <span className={`ps-check ${done ? 'done' : ''}`}>{done ? '✓' : ''}</span>
          </div>
        ))}
      </div>
      <span className="ps-button">Start Level 1</span>
    </>
  );
}

function ScreenListen() {
  return (
    <>
      <div className="ps-top"><span className="ps-chip">Listening</span><span className="ps-mic"><i /><i /><i /><i /><i /></span></div>
      <div className="ps-staff">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className="line" style={{ top: 18 + i * 10 }} />)}
        <span className="ps-note ok" style={{ left: '18%', top: 54 }} />
        <span className="ps-note ok" style={{ left: '38%', top: 49 }} />
        <span className="ps-note now" style={{ left: '58%', top: 44 }} />
        <span className="ps-note" style={{ left: '78%', top: 39 }} />
      </div>
      <div className="ps-heard"><b>E4</b><span>Heard. Nice and even.</span></div>
      <div className="ps-keys">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i === 2 ? 'on' : ''} />)}{[0, 1, 3, 4, 5, 7, 8].map((k) => <b key={k} style={{ left: `${(k + 1) * 10 - 3}%` }} />)}</div>
    </>
  );
}

function ScreenPlayAlong() {
  return (
    <>
      <b className="ps-title">Copper Market Lullaby</b>
      <small className="ps-sub">Band plays · you play middle C</small>
      <div className="ps-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" className="bg" /><circle cx="50" cy="50" r="42" className="fg" strokeDasharray="243 264" /></svg><span><b>92%</b><small>on the beat</small></span></div>
      <div className="ps-week">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className={i < 5 ? 'on' : ''}>{d}</span>)}</div>
      <span className="ps-button">Next song</span>
    </>
  );
}

/** Shown for a moment while we check whether someone is signed in. */
export function Splash() {
  return <div className="landing splash"><span className="circle brand" aria-hidden><i /><i /><i /></span></div>;
}
