// Sign in / create an account as a full page (no card): the form on the left, what you get and the legal
// links on the right. Phones get one compact column that fits on one screen.
import { SignInForm } from './Account';
import { AuxaWord } from './Brand';
import { Icon } from './Icon';

type Mode = 'signin' | 'signup';
const PERKS = [
  ['path', 'Your lessons, songs and scores on every device'],
  ['award', 'Certificates with a verify link when you finish a level'],
  ['people', 'Classes with your teacher, and a profile card if you want one'],
] as const;

export function AuthPage({ start = 'signup', onGuest, onClose, title, sub }: { start?: Mode; onGuest?: () => void; onClose?: () => void; title?: string; sub?: string }) {
  return (
    <div className="ob authpage" role="dialog" aria-label={start === 'signin' ? 'Sign in' : 'Create your account'}>
      <header className="ap-top">
        <span className="lp-logo"><AuxaWord height={24} /></span>
        {onClose && <button className="ob-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>}
      </header>
      <div className="ap-cols">
        <main className="ap-main">
          <h1>{title ?? (start === 'signin' ? 'Welcome back' : 'Save your progress')}</h1>
          <p className="ap-sub">{sub ?? (start === 'signin' ? 'Sign in to pick up where you left off.' : 'A free account keeps your lessons, songs and scores on every device.')}</p>
          <div className="ap-form"><SignInForm key={start} start={start} /></div>
          {onGuest && <button className="ap-guest" onClick={onGuest}>Not now, try it first</button>}
          <p className="ap-legal-sm">By continuing you agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>.</p>
        </main>
        <aside className="ap-side">
          <b>With an Auxa account</b>
          <ul>{PERKS.map(([ic, t]) => <li key={t}><span><Icon name={ic} size={16} /></span>{t}</li>)}</ul>
          <p className="ap-note">Free forever for the basics. Pro and Plus unlock more, cancel any time.</p>
          <div className="ap-legal">
            <p>By continuing you agree to the Auxa Terms of Use and Privacy Policy. Your microphone is only used on your device to hear what you play.</p>
            <nav><a href="#/terms">Terms of Use</a><a href="#/privacy">Privacy Policy</a><a href="#/subscriptions">Subscriptions and refunds</a></nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
