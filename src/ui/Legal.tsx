// Privacy policy, terms of use, subscriptions and refunds, and open-source credits.
// Linkable pages (#/privacy, #/terms, #/subscriptions, #/licenses) that work without signing in, so the
// app stores and the sign-up screen can point to them.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

const env = import.meta.env as Record<string, string | undefined>;
/** Who runs Maestro and how to reach them. Set these in .env before publishing. */
export const LEGAL = {
  name: env.VITE_LEGAL_NAME || 'Maestro Academy',
  email: env.VITE_LEGAL_EMAIL || '',
  country: env.VITE_LEGAL_COUNTRY || '',
  updated: '12 November 2026',
};
const contact = LEGAL.email ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> : <span>the contact email on our app store page</span>;

export type LegalId = 'privacy' | 'terms' | 'subscriptions' | 'licenses';
const PAGES: { id: LegalId; title: string }[] = [
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'terms', title: 'Terms of Use' },
  { id: 'subscriptions', title: 'Subscriptions and refunds' },
  { id: 'licenses', title: 'Credits and licenses' },
];

/** Which legal page the address points to, if any. */
export function useLegalRoute(): LegalId | null {
  const read = () => { const m = /^#\/(privacy|terms|subscriptions|licenses)\b/.exec(location.hash); return (m?.[1] as LegalId) ?? null; };
  const [id, setId] = useState(read);
  useEffect(() => { const f = () => setId(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return id;
}
export const closeLegal = () => { if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back(); else { history.replaceState(null, '', location.pathname + location.search); window.dispatchEvent(new HashChangeEvent('hashchange')); } };

function Privacy() {
  return (
    <>
      <p>This policy explains what {LEGAL.name} ("Maestro", "we") collects when you use the Maestro website and apps, why, and the choices you have. We keep it short because we collect very little.</p>
      <h3>What we collect</h3>
      <ul>
        <li><b>Your account:</b> your email address, the name you give, and how you signed in (email or Google). If you never create an account, nothing about you is stored on our servers.</li>
        <li><b>Your progress:</b> lesson scores, practice time, settings and your song library, so they follow you to other devices.</li>
        <li><b>Your plan:</b> which plan you have and until when, and payment references (for example a Stripe customer number or a mobile money payment id). We never see or store card numbers or mobile money PINs; Stripe and Monime handle them.</li>
      </ul>
      <h3>Your microphone and recordings</h3>
      <p>Maestro listens through your microphone to check the notes you play or sing. This happens on your device. Audio is not uploaded, stored on our servers or shared. Recordings you make in Sing to score stay on your device unless you download or share them yourself. MIDI keyboard input is also handled only on your device.</p>
      <h3>How we use it</h3>
      <ul>
        <li>To run your account, save your progress and give you the plan you paid for.</li>
        <li>To send emails you need: confirming your address, signing in, resetting your password. We do not send marketing emails without asking.</li>
        <li>We do not sell your data, show ads or use advertising trackers.</li>
      </ul>
      <h3>Who helps us</h3>
      <ul>
        <li><b>Supabase</b> stores accounts and progress.</li>
        <li><b>Stripe</b> processes card payments; <b>Monime</b> processes mobile money payments.</li>
        <li><b>Google</b>, only if you choose "Continue with Google".</li>
        <li><b>GitHub Pages</b> serves the website.</li>
      </ul>
      <p>Each handles data under its own privacy policy and only as needed to provide its service.</p>
      <h3>Storage on your device</h3>
      <p>Maestro saves settings, progress and your session in your browser or app storage so it works offline and keeps you signed in. These are not used for tracking. Clearing site data or uninstalling the app removes them.</p>
      <h3>Children</h3>
      <p>Maestro is made for learners of all ages. Children under 13 (or the age required where you live) should use Maestro with a parent or guardian, who should create and manage the account. We do not knowingly collect more than the account details above from children. If you believe a child has given us personal data without consent, contact us and we will delete it.</p>
      <h3>Keeping and deleting your data</h3>
      <p>We keep your account until you delete it. You can delete your account at any time in the app under <b>Account → Delete my account</b>; this removes your sign-in, profile and saved progress straight away. Payment records may be kept as required for tax and accounting, without being linked to your account.</p>
      <h3>Your rights</h3>
      <p>You can ask to see, correct, export or delete your data, and to object to how it is used. Write to {contact}. You may also complain to your local data protection authority.</p>
      <h3>Security</h3>
      <p>Data is sent over encrypted connections and access to it is restricted. No system is perfectly secure, so please use a strong, unique password.</p>
      <h3>Changes</h3>
      <p>If this policy changes in an important way we will tell you in the app before it applies.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>These terms are an agreement between you and {LEGAL.name}{LEGAL.country ? `, ${LEGAL.country}` : ''}, for using the Maestro website and apps. By creating an account or using Maestro you agree to them. If you are under 18, a parent or guardian must agree for you.</p>
      <h3>Using Maestro</h3>
      <ul>
        <li>We give you a personal, non-transferable right to use Maestro for learning and enjoying music.</li>
        <li>Keep your sign-in details private. You are responsible for what happens in your account.</li>
        <li>Do not misuse Maestro: no attempts to break, copy or resell it, get around plan limits, or harm other people or our systems.</li>
      </ul>
      <h3>Your content</h3>
      <p>Scores you open, tunes you sing and arrangements you make belong to you (or to whoever owns their copyright). Only open or share music you have the right to use. Maestro processes your content only to provide the app to you.</p>
      <h3>Lessons and songs</h3>
      <p>Maestro's lessons, exercises, original songs, voice coach scripts, design and software belong to us or our licensors. Classical and traditional pieces in the library are in the public domain; our arrangements of them are ours.</p>
      <h3>Plans and payments</h3>
      <p>Some lessons and features need a paid plan. Prices, renewal and refunds are explained in <a href="#/subscriptions">Subscriptions and refunds</a>, which is part of these terms.</p>
      <h3>Availability</h3>
      <p>We work to keep Maestro running and improving, and may change or remove features. Note detection depends on your device, microphone and surroundings, so scores are a guide, not an exam result.</p>
      <h3>Disclaimer and liability</h3>
      <p>Maestro is provided "as is". To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the 12 months before the claim. Nothing here limits rights you have under consumer law that cannot be excluded.</p>
      <h3>Ending</h3>
      <p>You can stop using Maestro and delete your account at any time. We may suspend accounts that seriously break these terms, after warning you where possible.</p>
      <h3>Changes and law</h3>
      <p>We may update these terms; if a change matters we will tell you in the app first. {LEGAL.country ? `These terms are governed by the laws of ${LEGAL.country}.` : ''} Questions: {contact}.</p>
    </>
  );
}

function Subscriptions() {
  return (
    <>
      <h3>Plans</h3>
      <ul>
        <li><b>Free:</b> Levels 0 to 2, beginner songs and Easy singing, always free.</li>
        <li><b>Pro</b> and <b>Plus:</b> more levels, the full song library and stricter singing coaches. What each includes is shown on the plans page before you pay.</li>
      </ul>
      <h3>Card plans (monthly)</h3>
      <ul>
        <li>Charged when you subscribe and then every month on the same date until you cancel. The price is shown before you pay.</li>
        <li>Cancel any time in <b>Account → Manage card subscription</b>. You keep your plan until the end of the month you paid for; there is no charge after that.</li>
        <li>If a payment fails, your plan pauses until it is fixed.</li>
      </ul>
      <h3>Mobile money passes (one month)</h3>
      <ul>
        <li>Paid once with Orange Money, Afrimoney, bank or card through Monime. A pass lasts one month and never renews by itself.</li>
        <li>Buying another pass adds a month.</li>
      </ul>
      <h3>Refunds</h3>
      <ul>
        <li>If you were charged by mistake, charged twice, or Maestro did not work for you and we could not fix it, write to {contact} within 14 days of the payment and we will refund it.</li>
        <li>Where the law gives you a right to cancel and get your money back (for example a 14-day cooling-off period), that right applies.</li>
        <li>Partly used months are otherwise not refunded, but cancelling always stops future payments.</li>
      </ul>
      <h3>Purchases through app stores</h3>
      <p>If you subscribe through Google Play or the Apple App Store, that store charges you, and cancelling and refunds follow its rules: manage the subscription in your store account settings.</p>
      <h3>Price changes</h3>
      <p>If a price goes up we will tell you before your next payment, and you can cancel before it applies.</p>
    </>
  );
}

function Licenses() {
  return (
    <>
      <p>Maestro is built with the help of open-source software and public-domain music. Thank you to everyone behind them.</p>
      <ul>
        <li><b>React</b> (MIT): interface.</li>
        <li><b>OpenSheetMusicDisplay</b> (BSD-3-Clause) and <b>VexFlow</b> (MIT): drawing scores.</li>
        <li><b>three.js</b> (MIT): the 3D hands.</li>
        <li><b>Supabase JS</b> (MIT): accounts.</li>
        <li><b>fflate</b> (MIT): opening compressed MusicXML.</li>
        <li><b>Manrope</b> font (SIL Open Font License).</li>
      </ul>
      <p>Classical and traditional pieces (for example Ode to Joy, Amazing Grace, When the Saints) are in the public domain. Maestro's arrangements, lessons and original songs are © {LEGAL.name}.</p>
    </>
  );
}

/** A full page for one legal document, with tabs to the others. */
export function LegalPage({ id }: { id: LegalId }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);
  const page = PAGES.find((p) => p.id === id)!;
  return (
    <div className="legal">
      <header className="legal-top">
        <button className="ob-close" onClick={closeLegal} aria-label="Back"><Icon name="back" size={18} /></button>
        <span className="lp-logo"><span className="lp-mark" aria-hidden><i /><i /><i /></span>maestro</span>
      </header>
      <nav className="legal-tabs">{PAGES.map((p) => <a key={p.id} href={`#/${p.id}`} className={p.id === id ? 'on' : ''}>{p.title}</a>)}</nav>
      <article className="legal-body">
        <h1>{page.title}</h1>
        <small className="muted">Last updated {LEGAL.updated}</small>
        {id === 'privacy' ? <Privacy /> : id === 'terms' ? <Terms /> : id === 'subscriptions' ? <Subscriptions /> : <Licenses />}
        <p className="legal-contact">Questions? Contact {contact}.</p>
      </article>
    </div>
  );
}
