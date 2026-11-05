// Account UI: sign in, plan status, upgrade (Stripe subscriptions or Monime passes), and the admin page.
import { useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED, MONIME_ENABLED, PLANS } from '../account/config';
import {
  adminGrant, adminPayments, adminSearch, adminSetRole, closeUpgrade, openBillingPortal, openUpgrade, refreshProfile, signInWithEmail,
  signInWithGoogle, signOut, startCheckout, useAccount, useUpgrade, type Profile,
} from '../account/store';
import { Icon } from './Icon';

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function SignInForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (sent) return <p className="small">Check <b>{email}</b> for a sign-in link. You can close this tab after you click it.</p>;
  return (
    <form className="acct-signin" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try { await signInWithEmail(email.trim()); setSent(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      {!compact && <p className="muted small">Sign in to save your progress on every device and to unlock Pro.</p>}
      <div className="acct-row">
        <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <button className="btn dark" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
      </div>
      <button type="button" className="btn ghost" onClick={() => signInWithGoogle().catch((x) => setErr((x as Error).message))}>Continue with Google</button>
      {err && <p className="err small">{err}</p>}
    </form>
  );
}

/** Account card for the Setup page. */
export function AccountCard() {
  const a = useAccount();
  if (!ACCOUNTS_ENABLED) return null;
  const p = a.profile;
  return (
    <div className="card acct-card">
      <div className="card-head"><b>Account</b>{a.syncing && <span className="muted small">Syncing progress…</span>}</div>
      {!a.ready ? <p className="muted small">Loading…</p> : !a.user ? <SignInForm /> : (
        <>
          <div className="acct-who">
            <span className="avatar">{(p?.email ?? '?')[0].toUpperCase()}</span>
            <div><b>{p?.email}</b><small className="muted">{a.ent.admin ? 'Admin: every course unlocked' : a.ent.pro ? `Pro until ${fmtDate(p?.pro_until ?? null)}${p?.pro_source === 'stripe' ? ' (renews automatically)' : ''}` : 'Free plan'}</small></div>
          </div>
          <div className="acct-actions">
            {!a.ent.pro && <button className="btn lime" onClick={() => openUpgrade('Unlock every level and song')}>Upgrade to Pro</button>}
            {p?.pro_source === 'monime' && a.ent.pro && !a.ent.admin && <button className="btn ghost" onClick={() => openUpgrade('Add more time to your pass')}>Add time</button>}
            {p?.stripe_status && <button className="btn ghost" onClick={() => openBillingPortal().catch((e) => alert(e.message))}>Manage card subscription</button>}
            <button className="btn ghost" onClick={() => void refreshProfile()}>Refresh</button>
            <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

/** The paywall: plans from Stripe (cards, auto-renew) and Monime (mobile money passes). */
export function UpgradeSheet() {
  const reason = useUpgrade();
  const a = useAccount();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!reason || !ACCOUNTS_ENABLED) return null;
  const plans = PLANS.filter((p) => p.provider === 'stripe' || MONIME_ENABLED);
  return (
    <div className="sheet-back" onClick={closeUpgrade}>
      <div className="sheet" role="dialog" aria-label="Upgrade to Pro" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">Maestro Pro</small><b>{reason}</b></div><button className="icon-btn" onClick={closeUpgrade} aria-label="Close"><Icon name="close" size={16} /></button></div>
        <ul className="pro-list">
          <li><Icon name="check" size={14} /> All 10 levels: hands together, scales, chords, sight-reading, advanced technique</li>
          <li><Icon name="check" size={14} /> The full song library, and your own MusicXML scores</li>
          <li><Icon name="check" size={14} /> Every singing level up to Pro coach</li>
          <li><Icon name="check" size={14} /> Progress saved on all your devices</li>
        </ul>
        {!a.user ? <SignInForm compact /> : (
          <div className="plan-grid">
            {plans.map((p) => (
              <button key={p.id} className={`plan ${p.best ? 'best' : ''}`} disabled={!!busy} onClick={async () => {
                setBusy(p.id); setErr('');
                try { await startCheckout(p.id, p.provider); } catch (x) { setErr((x as Error).message); setBusy(''); }
              }}>
                {p.best && <span className="tag">Best value</span>}
                <b>{p.title}</b><span className="price">{p.price}</span><small>{p.note}</small>
                {busy === p.id && <small>Opening checkout…</small>}
              </button>
            ))}
          </div>
        )}
        {err && <p className="err small">{err}</p>}
        <p className="muted small">Levels 0 to 2, the beginner songs and Easy singing stay free.</p>
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
          <thead><tr><th>Email</th><th>Role</th><th>Pro until</th><th>Source</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td><select value={r.role} onChange={(e) => act(() => adminSetRole(r.email, e.target.value), `Role updated for ${r.email}`)}><option>user</option><option>teacher</option><option>admin</option></select></td>
                <td>{fmtDate(r.pro_until) || '-'}</td>
                <td>{r.pro_source ?? '-'}{r.stripe_status ? ` (${r.stripe_status})` : ''}</td>
                <td className="admin-acts">
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 31), `+1 month for ${r.email}`)}>+1 month</button>
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 366), `+1 year for ${r.email}`)}>+1 year</button>
                  <button className="btn ghost sm" onClick={() => act(() => adminGrant(r.email, 0), `Pro removed for ${r.email}`)}>Remove</button>
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
