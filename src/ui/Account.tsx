// Account UI: sign in, plan status, upgrade (Stripe subscriptions or Monime passes), and the admin page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ACCOUNTS_ENABLED, MONIME_ENABLED, PLANS, type PlanOption } from '../account/config';
import { TIER_NAME } from '../account/gate';
import { toggleTheme, useTheme } from './theme';
import {
  adminGrant, adminPayments, adminSearch, adminSetRole, authMessage, closeUpgrade, endRecovery, openBillingPortal, openUpgrade, refreshProfile,
  sendPasswordReset, signInWithEmail, signInWithGoogle, signInWithPassword, signOut, signUp, startCheckout, updatePassword, useAccount, useUpgrade, type Profile,
} from '../account/store';
import { Icon } from './Icon';

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

type AuthMode = 'signin' | 'signup' | 'forgot' | 'link';

/** Full sign-in: email + password, create account, forgotten password, Google, or a one-time email link. */
export function SignInForm({ compact, start = 'signin' }: { compact?: boolean; start?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(start);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const go = (m: AuthMode) => { setMode(m); setErr(''); setDone(''); };
  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setErr('');
    try { const msg = await f(); if (msg) setDone(msg); } catch (x) { setErr(authMessage(x)); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim();
    if (mode === 'signin') void run(() => signInWithPassword(em, pw));
    if (mode === 'signup') {
      if (pw.length < 8) { setErr('Please use at least 8 characters for your password.'); return; }
      void run(async () => (await signUp(em, pw, name.trim())) ? undefined : `Almost done: we sent a confirmation link to ${em}. Open it to activate your account.`);
    }
    if (mode === 'forgot') void run(async () => { await sendPasswordReset(em); return `If ${em} has an account, a link to set a new password is on its way.`; });
    if (mode === 'link') void run(async () => { await signInWithEmail(em); return `Check ${em} for your sign-in link.`; });
  };
  const title = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', link: 'Sign in with an email link' }[mode];
  if (done) return (
    <div className="auth done">
      <span className="auth-ok"><Icon name="check" size={18} /></span>
      <p>{done}</p>
      <button className="btn ghost sm" onClick={() => go('signin')}>Back to sign in</button>
    </div>
  );
  return (
    <form className="auth" onSubmit={submit}>
      {!compact && <b className="auth-title">{title}</b>}
      {(mode === 'signin' || mode === 'signup') && (
        <>
          <button type="button" className="btn auth-google" onClick={() => signInWithGoogle().catch((x) => setErr(authMessage(x)))}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 7.2-9.6 7.2-17z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </button>
          <div className="auth-or"><span>or with email</span></div>
        </>
      )}
      {mode === 'signup' && <label>Your name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Kamara" /></label>}
      <label>Email<input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      {(mode === 'signin' || mode === 'signup') && (
        <label>
          <span className="auth-pw-head">Password{mode === 'signin' && <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>}</span>
          <span className="auth-pw">
            <input type={show ? 'text' : 'password'} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : ''} />
            <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </span>
          {mode === 'signup' && pw && <span className={`auth-strength s${strength(pw)}`}><i /><i /><i /><em>{['Too short', 'Weak', 'Good', 'Strong'][strength(pw)]}</em></span>}
        </label>
      )}
      {err && <p className="err small">{err}</p>}
      <button className="btn dark auth-main" disabled={busy}>
        {busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', link: 'Email me a link' }[mode]}
      </button>
      <div className="auth-foot">
        {mode === 'signin' && <><span>New here? <button type="button" className="link" onClick={() => go('signup')}>Create an account</button></span><button type="button" className="link muted" onClick={() => go('link')}>Email me a sign-in link instead</button></>}
        {mode === 'signup' && <span>Already have an account? <button type="button" className="link" onClick={() => go('signin')}>Sign in</button></span>}
        {(mode === 'forgot' || mode === 'link') && <button type="button" className="link" onClick={() => go('signin')}>Back to sign in</button>}
      </div>
    </form>
  );
}
function strength(pw: string) {
  if (pw.length < 8) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter((r) => r.test(pw)).length;
  return pw.length >= 12 && kinds >= 3 ? 3 : kinds >= 2 ? 2 : 1;
}

const alertSaved = () => { const t = document.createElement('div'); t.className = 'toast-ok'; t.textContent = 'New password saved'; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };

/** After opening a password-reset email: choose a new password. */
export function ResetPasswordSheet() {
  const a = useAccount();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!a.recovery) return null;
  return (
    <div className="sheet-back">
      <form className="sheet auth" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) { setErr('Please use at least 8 characters.'); return; }
        setBusy(true); setErr('');
        try { await updatePassword(pw); setPw(''); alertSaved(); } catch (x) { setErr(authMessage(x)); } finally { setBusy(false); }
      }}>
        <b className="auth-title">Choose a new password</b>
        <small className="muted">You opened a password reset link. Pick a new password for your account.</small>
        <label>New password<input type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        {err && <p className="err small">{err}</p>}
        <button className="btn dark auth-main" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="link muted" onClick={endRecovery}>Not now</button>
      </form>
    </div>
  );
}

/** Account card for the Setup page. */
export function AccountCard({ bare }: { bare?: boolean }) {
  const a = useAccount();
  if (!ACCOUNTS_ENABLED) return null;
  const p = a.profile;
  return (
    <div className={bare ? 'acct-card bare' : 'card acct-card'}>
      {!bare && <div className="card-head"><b>Account</b>{a.syncing && <span className="muted small">Syncing progress…</span>}</div>}
      {!a.ready ? <p className="muted small">Loading…</p> : !a.user ? <SignInForm compact={bare} /> : (
        <>
          <div className="acct-who">
            <span className="avatar">{(p?.email ?? '?')[0].toUpperCase()}</span>
            <div><b>{p?.email}</b><small className="muted">{a.ent.admin ? 'Admin: every course unlocked' : a.ent.pro ? `${TIER_NAME[a.ent.tier]} until ${fmtDate((a.ent.plus ? p?.plus_until : p?.pro_until) ?? null)}${p?.pro_source === 'stripe' ? ' (renews automatically)' : ''}` : 'Free plan'}</small></div>
          </div>
          <div className="acct-actions">
            {!a.ent.pro && <button className="btn lime" onClick={() => openUpgrade('Choose your plan')}>Upgrade</button>}
            {a.ent.pro && !a.ent.plus && !a.ent.admin && <button className="btn lime" onClick={() => openUpgrade('Go further with Plus')}>Upgrade to Plus</button>}
            {p?.pro_source === 'monime' && a.ent.pro && !a.ent.admin && <button className="btn ghost" onClick={() => openUpgrade('Add another month')}>Add a month</button>}
            {p?.stripe_status && <button className="btn ghost" onClick={() => openBillingPortal().catch((e) => alert(e.message))}>Manage card subscription</button>}
            <button className="btn ghost" onClick={() => void refreshProfile()}>Refresh</button>
            <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Account in its own sheet (from the account button): who you are, your plan, sign in or out. */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const a = useAccount();
  // signing in or out closes the sheet (signing out also returns to the home page)
  const was = useRef(a.user?.id ?? null);
  useEffect(() => { const now = a.user?.id ?? null; if (now !== was.current) onClose(); was.current = now; }, [a.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet acct-sheet" role="dialog" aria-label="Account" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">Maestro</small><b>{a.user ? 'Your account' : 'Sign in'}</b></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
        <AccountCard bare />
      </div>
    </div>
  );
}

const PERKS: Record<'pro' | 'plus', string[]> = {
  pro: ['Levels 3 to 6: hands together, rhythm, keys and scales, chords', 'The whole song library', 'Standard singing coach', 'Progress saved on all your devices'],
  plus: ['Everything in Pro', 'Levels 7 to 9: sight-reading, advanced technique, performance', 'Strict and Pro coach singing', 'Your own MusicXML and choir (SATB) scores'],
};

/** The paywall: Pro and Plus, each by card (Stripe, renews monthly) or mobile money (Monime, 1-month pass). */
export function UpgradeSheet() {
  const reason = useUpgrade();
  const a = useAccount();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!reason || !ACCOUNTS_ENABLED) return null;
  const buy = async (p: PlanOption) => {
    setBusy(p.id); setErr('');
    try { await startCheckout(p.id, p.provider); } catch (x) { setErr((x as Error).message); setBusy(''); }
  };
  const tiers = (['pro', 'plus'] as const).filter((t) => !(t === 'pro' && a.ent.pro && !a.ent.plus && a.profile?.pro_source === 'stripe'));
  return (
    <div className="sheet-back" onClick={closeUpgrade}>
      <div className="sheet" role="dialog" aria-label="Upgrade" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">Maestro Academy</small><b>{reason}</b></div><button className="icon-btn" onClick={closeUpgrade} aria-label="Close"><Icon name="close" size={16} /></button></div>
        {!a.user && <SignInForm compact />}
        <div className="tier-grid">
          {tiers.map((t) => {
            const opts = PLANS.filter((p) => p.tier === t && (p.provider === 'stripe' || MONIME_ENABLED));
            return (
              <div key={t} className={`tier ${t}`}>
                <div className="tier-head"><b>{TIER_NAME[t]}</b>{t === 'plus' && <span className="tag">Everything</span>}</div>
                <ul className="pro-list">{PERKS[t].map((x) => <li key={x}><Icon name="check" size={14} /> {x}</li>)}</ul>
                <div className="tier-buy">
                  {opts.map((p) => (
                    <button key={p.id} className={`btn ${p.provider === 'stripe' ? (t === 'plus' ? 'lime' : 'dark') : 'ghost'}`} disabled={!a.user || !!busy} onClick={() => void buy(p)}
                      title={p.note}>
                      {busy === p.id ? 'Opening…' : <>{p.provider === 'stripe' ? 'Card' : 'Mobile money'} · {p.price}</>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {err && <p className="err small">{err}</p>}
        <p className="muted small">{a.user ? 'Card plans renew monthly and can be cancelled any time. Mobile money passes last 1 month and never auto-renew.' : 'Sign in first, then pick a plan.'} Levels 0 to 2, beginner songs and Easy singing stay free.</p>
      </div>
    </div>
  );
}

/** Small round button in the top bar. */
export function AccountButton({ onOpen }: { onOpen: () => void }) {
  const a = useAccount();
  if (!ACCOUNTS_ENABLED) return null;
  const label = a.user ? (a.profile?.email ?? 'Account') : 'Sign in';
  return (
    <button className={`pill io acct-btn ${a.ent.pro ? 'pro' : ''}`} onClick={onOpen} aria-label={label} title={label}>
      {a.user ? <span className="avatar sm">{(a.profile?.email ?? '?')[0].toUpperCase()}</span> : <Icon name="lock" size={16} />}
    </button>
  );
}

/** The account menu in the top bar: you and your plan, Setup, Admin, light/dark, home page, sign in/out. */
export function UserMenu({ onAccount, onSetup, onAdmin, onHome, current }: { onAccount: () => void; onSetup: () => void; onAdmin: () => void; onHome: () => void; current: string }) {
  const a = useAccount();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (f: () => void) => () => { setOpen(false); f(); };
  const email = a.profile?.email ?? a.user?.email ?? '';
  const plan = a.ent.admin ? 'Admin' : a.ent.pro ? TIER_NAME[a.ent.tier] : 'Free';
  return (
    <div className="umenu" ref={box}>
      <button className={`umenu-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu">
        {a.user ? <span className="avatar sm">{(email || '?')[0].toUpperCase()}</span> : <Icon name="settings" size={17} />}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="umenu-pop" role="menu">
          {ACCOUNTS_ENABLED && (a.user ? (
            <button className="umenu-who" role="menuitem" onClick={pick(onAccount)}>
              <span className="avatar">{(email || '?')[0].toUpperCase()}</span>
              <span><b>{email}</b><small>{plan} plan · Account and billing</small></span>
            </button>
          ) : (
            <button className="umenu-who" role="menuitem" onClick={pick(onAccount)}>
              <span className="avatar"><Icon name="lock" size={16} /></span>
              <span><b>Sign in</b><small>Save progress on every device</small></span>
            </button>
          ))}
          {ACCOUNTS_ENABLED && a.user && !a.ent.plus && !a.ent.admin && (
            <button className="umenu-item upgrade" role="menuitem" onClick={pick(() => openUpgrade(a.ent.pro ? 'Go further with Plus' : 'Choose your plan'))}><Icon name="flame" size={16} />{a.ent.pro ? 'Upgrade to Plus' : 'Upgrade'}</button>
          )}
          <div className="umenu-sep" />
          <button className={`umenu-item ${current === 'settings' ? 'on' : ''}`} role="menuitem" onClick={pick(onSetup)}><Icon name="settings" size={16} />Setup<small>Input, sound, learning</small></button>
          {a.ent.admin && <button className={`umenu-item ${current === 'admin' ? 'on' : ''}`} role="menuitem" onClick={pick(onAdmin)}><Icon name="lock" size={16} />Admin<small>People and payments</small></button>}
          <button className="umenu-item" role="menuitem" onClick={() => toggleTheme()}>
            <Icon name={theme === 'dark' ? 'eye' : 'eye'} size={16} />{theme === 'dark' ? 'Light mode' : 'Dark mode'}
            <span className={`lp-toggle ${theme === 'dark' ? 'on' : ''}`}><i /></span>
          </button>
          {ACCOUNTS_ENABLED && <button className="umenu-item" role="menuitem" onClick={pick(onHome)}><Icon name="home" size={16} />Maestro home page</button>}
          {ACCOUNTS_ENABLED && a.user && (<><div className="umenu-sep" /><button className="umenu-item quiet" role="menuitem" onClick={pick(() => void signOut())}><Icon name="back" size={16} />Sign out</button></>)}
        </div>
      )}
    </div>
  );
}

/** Admin: find people, grant or remove Pro days, set roles, see recent payments. */
export function AdminView() {
  const a = useAccount();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<(Profile & { created_at: string })[]>([]);
  const [pays, setPays] = useState<Awaited<ReturnType<typeof adminPayments>>>([]);
  const [msg, setMsg] = useState('');
  const load = () => adminSearch(q).then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { if (a.ent.admin) { void load(); adminPayments().then(setPays).catch(() => undefined); } }, [a.ent.admin]); // eslint-disable-line
  if (!a.ent.admin) return <div className="card"><b>Admins only.</b></div>;
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } };
  return (
    <div className="admin">
      <div className="card">
        <div className="card-head"><b>People</b><span className="muted small">{rows.length} shown</span></div>
        <form className="acct-row" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <input placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn dark">Search</button>
        </form>
        {msg && <p className="small">{msg}</p>}
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Role</th><th>Pro until</th><th>Plus until</th><th>Source</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td><select value={r.role} onChange={(e) => act(() => adminSetRole(r.email, e.target.value), `Role updated for ${r.email}`)}><option>user</option><option>teacher</option><option>admin</option></select></td>
                <td>{fmtDate(r.pro_until) || '-'}</td>
                <td>{fmtDate(r.plus_until) || '-'}</td>
                <td>{r.pro_source ?? '-'}{r.stripe_status ? ` (${r.stripe_status})` : ''}</td>
                <td className="admin-acts">
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 31, 'pro'), `+1 month Pro for ${r.email}`)}>Pro +1 mo</button>
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 31, 'plus'), `+1 month Plus for ${r.email}`)}>Plus +1 mo</button>
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 366, 'plus'), `+1 year Plus for ${r.email}`)}>Plus +1 yr</button>
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 0), `Paid access removed for ${r.email}`)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-head"><b>Recent payments and grants</b></div>
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Provider</th><th>Plan</th><th>Amount</th><th>Days</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id}><td>{fmtDate(p.created_at)}</td><td>{p.provider}</td><td>{p.plan}</td><td>{p.amount_minor != null ? `${(p.amount_minor / 100).toFixed(2)} ${p.currency?.toUpperCase() ?? ''}` : '-'}</td><td>{p.days_added ?? '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
