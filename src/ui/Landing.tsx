// Public landing + sign-in page. Shown only when accounts are on and nobody is signed in
// (people can still "Start free" as a guest: the free levels work without an account).
import { useState } from 'react';
import { PLANS } from '../account/config';
import { LESSONS } from '../curriculum/lessons';
import { SONGS } from '../songs';
import { SignInForm } from './Account';
import { Icon } from './Icon';

const GUEST = 'maestro.guest.v1';
export const isGuest = () => { try { return localStorage.getItem(GUEST) === '1'; } catch { return false; } };
export const setGuest = (on: boolean) => { try { if (on) localStorage.setItem(GUEST, '1'); else localStorage.removeItem(GUEST); } catch { /* private mode */ } };

const FEATURES: { icon: 'mic' | 'hand' | 'wave' | 'note' | 'midi' | 'chord'; title: string; body: string }[] = [
  { icon: 'mic', title: 'It listens to you', body: 'Play on any piano near your phone, or plug in a MIDI keyboard. Every note is checked as you play.' },
  { icon: 'hand', title: 'See the hands', body: '3D hands show which finger goes where, on a keyboard sized like yours: 25 keys up to 88.' },
  { icon: 'wave', title: 'A gentle singing coach', body: 'Start with an encouraging ear, then move up to strict pitch coaching when you are ready.' },
  { icon: 'chord', title: 'Play along, not alone', body: 'After each new key, short songs play everything else while you play only what you just learned.' },
  { icon: 'note', title: 'Your own scores', body: 'Open MusicXML from MuseScore or Sibelius, including choir scores with every SATB part.' },
  { icon: 'midi', title: 'Works offline', body: 'Once loaded it keeps working with no data. Your progress syncs when you are back online.' },
];

const price = (id: string) => PLANS.find((p) => p.id === id)?.price ?? '';

export function Landing({ onStart }: { onStart: () => void }) {
  const [signIn, setSignIn] = useState(false);
  const pianoLessons = LESSONS.filter((l) => (l.track ?? 'piano') === 'piano').length;
  const start = () => { setGuest(true); onStart(); };
  const showSignIn = () => { setSignIn(true); setTimeout(() => document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); };

  return (
    <div className="landing">
      <nav className="land-nav">
        <span className="land-brand"><span className="circle brand" aria-hidden><i /><i /><i /></span> Maestro Academy</span>
        <button className="btn ghost sm" onClick={showSignIn}>Sign in</button>
      </nav>

      <section className="land-hero">
        <div className="land-copy">
          <span className="land-kicker">Piano · Singing · Music theory</span>
          <h1>Learn piano and singing with a teacher that listens.</h1>
          <p>Short lessons from your very first note to sight-reading and choir parts. Maestro hears what you play and sing, and tells you exactly what to fix.</p>
          <div className="land-cta">
            <button className="btn lime big" onClick={start}>Start free</button>
            <button className="btn dark big" onClick={showSignIn}>Sign in</button>
          </div>
          <small className="muted">No card needed. Levels 0 to 2 are free for good.</small>
        </div>
        <div className="land-visual" aria-hidden>
          <div className="land-keys">
            {Array.from({ length: 14 }, (_, i) => <i key={i} className={i === 7 ? 'on' : i === 9 || i === 11 ? 'on2' : ''} />)}
            {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((w) => <b key={w} style={{ left: `calc(${(w + 1) * (100 / 14)}% - 3.2%)` }} />)}
          </div>
          <div className="land-stats">
            <div><b>{pianoLessons}</b><span>piano lessons</span></div>
            <div><b>{SONGS.length}</b><span>songs to play</span></div>
            <div><b>10</b><span>levels</span></div>
          </div>
        </div>
      </section>

      <section className="land-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="land-feature">
            <span className="land-ic"><Icon name={f.icon} size={18} /></span>
            <b>{f.title}</b>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="land-plans">
        <h2>Simple plans</h2>
        <div className="land-plan-grid">
          <div className="land-plan">
            <b>Free</b><div className="land-price">SLE 0</div>
            <ul className="pro-list"><li><Icon name="check" size={14} /> Levels 0 to 2</li><li><Icon name="check" size={14} /> Beginner songs</li><li><Icon name="check" size={14} /> Easy singing coach</li><li><Icon name="check" size={14} /> Microphone and MIDI</li></ul>
          </div>
          <div className="land-plan">
            <b>Pro</b><div className="land-price">{price('pro')}<small>or {price('pass_pro')} a month by mobile money</small></div>
            <ul className="pro-list"><li><Icon name="check" size={14} /> Levels 3 to 6</li><li><Icon name="check" size={14} /> The whole song library</li><li><Icon name="check" size={14} /> Standard singing coach</li><li><Icon name="check" size={14} /> Progress on every device</li></ul>
          </div>
          <div className="land-plan plus">
            <b>Plus <span className="tag">Everything</span></b><div className="land-price">{price('plus')}<small>or {price('pass_plus')} a month by mobile money</small></div>
            <ul className="pro-list"><li><Icon name="check" size={14} /> Everything in Pro</li><li><Icon name="check" size={14} /> Levels 7 to 9</li><li><Icon name="check" size={14} /> Strict and Pro coach singing</li><li><Icon name="check" size={14} /> Your own MusicXML and choir scores</li></ul>
          </div>
        </div>
        <small className="muted">Pay by card (renews monthly, cancel any time) or with Orange Money and Afrimoney (no auto-renewal).</small>
      </section>

      <section className="land-signin" id="signin">
        <h2>{signIn ? 'Sign in or create your account' : 'Ready when you are'}</h2>
        {signIn ? <SignInForm /> : (
          <div className="land-cta center">
            <button className="btn lime big" onClick={start}>Start free</button>
            <button className="btn dark big" onClick={showSignIn}>Sign in</button>
          </div>
        )}
        <small className="muted">One link to your email, no password to remember.</small>
      </section>

      <footer className="land-foot">© {new Date().getFullYear()} Maestro Academy</footer>
    </div>
  );
}

/** Shown for a moment while we check whether someone is signed in. */
export function Splash() {
  return <div className="landing splash"><span className="circle brand" aria-hidden><i /><i /><i /></span></div>;
}
