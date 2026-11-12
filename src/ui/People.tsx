// People: a calm wall of learner cards. Card layout follows the "cover fades into the card" profile
// design: cover art across the top, photo overlapping it, name, one line, meta row, three numbers with
// dividers, and one dark pill that opens the person's practice videos.
import { useMemo, useRef, useState } from 'react';
import { ACCOUNTS_ENABLED } from '../account/config';
import { openAccount, useAccount } from '../account/store';
import { cleanLink, COVERS, linkHost, myStats, removeCard, saveCard, savedIds, toggleSaved, uploadAvatar, usePeople,
  type CardDraft, type Cover, type PersonCard, type Plays } from '../account/people';
import { LEVEL_GROUP, LEVEL_NAMES } from '../curriculum/levels';
import { Icon } from './Icon';
import { PageHead } from './PageHead';

const PLAYS: { id: Plays; label: string; icon: string }[] = [
  { id: 'piano', label: 'Piano', icon: 'piano' }, { id: 'voice', label: 'Voice', icon: 'mic' },
  { id: 'jazz', label: 'Jazz', icon: 'chord' }, { id: 'ear', label: 'By ear', icon: 'ear' }, { id: 'arranging', label: 'Arranging', icon: 'doc' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const joined = (iso: string | null) => { if (!iso) return 'New here'; const d = new Date(iso); return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const hours = (m = 0) => (m < 60 ? `${m} min` : `${Math.round(m / 6) / 10} hrs`.replace('.0 ', ' '));
const lastSeen = (day?: string | null) => {
  if (!day) return 'Not practiced yet';
  const n = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(day)) / 86400000);
  return n <= 0 ? 'Practiced today' : n === 1 ? 'Practiced yesterday' : n < 30 ? `Practiced ${n} days ago` : 'Taking a break';
};
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/* ---------- cover art: soft illustrated scenes, drawn in SVG so they are crisp and tiny ---------- */
export function CoverArt({ kind }: { kind: Cover }) {
  const common = { viewBox: '0 0 600 300', preserveAspectRatio: 'xMidYMid slice', className: 'pc-art', 'aria-hidden': true } as const;
  if (kind === 'forest') return (
    <svg {...common}><defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9d6cc" /><stop offset="1" stopColor="#eef2ec" /></linearGradient></defs>
      <rect width="600" height="300" fill="url(#fsky)" />
      <path d="M0 170 L70 120 L120 150 L190 80 L250 140 L320 95 L390 150 L450 70 L520 130 L600 90 V300 H0Z" fill="#9fb5a2" opacity=".55" />
      <path d="M0 210 L60 160 L130 200 L200 130 L270 190 L340 140 L410 200 L480 120 L560 180 L600 150 V300 H0Z" fill="#5f8a63" opacity=".75" />
      <path d="M0 250 L90 190 L170 240 L260 170 L350 235 L430 175 L520 230 L600 190 V300 H0Z" fill="#2f5d35" />
      <ellipse cx="300" cy="150" rx="420" ry="40" fill="#fff" opacity=".35" />
    </svg>);
  if (kind === 'dusk') return (
    <svg {...common}><defs><linearGradient id="dsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4a37a" /><stop offset=".6" stopColor="#f6cfa8" /><stop offset="1" stopColor="#fbe9d6" /></linearGradient></defs>
      <rect width="600" height="300" fill="url(#dsky)" /><circle cx="420" cy="140" r="54" fill="#fff3df" opacity=".9" />
      <path d="M0 200 Q120 150 240 190 T480 170 T600 180 V300 H0Z" fill="#d9826a" opacity=".7" />
      <path d="M0 240 Q150 190 300 230 T600 215 V300 H0Z" fill="#a85a52" />
    </svg>);
  if (kind === 'stage') return (
    <svg {...common}><defs><radialGradient id="sl" cx=".5" cy="0" r=".9"><stop offset="0" stopColor="#ffe9a8" stopOpacity=".95" /><stop offset="1" stopColor="#ffe9a8" stopOpacity="0" /></radialGradient></defs>
      <rect width="600" height="300" fill="#2a1f3d" />
      <path d="M300 0 L120 300 H480Z" fill="url(#sl)" opacity=".7" /><path d="M90 0 L0 220 V0Z" fill="#ffd38a" opacity=".18" /><path d="M510 0 L600 220 V0Z" fill="#ffd38a" opacity=".18" />
      {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={20 + i * 27} cy={265 + (i % 3) * 8} r="16" fill="#140f20" />)}
    </svg>);
  if (kind === 'paper') return (
    <svg {...common}><rect width="600" height="300" fill="#efe8da" />
      {[0, 1, 2].map((s) => <g key={s} transform={`translate(0 ${50 + s * 70}) rotate(-4 300 0)`} stroke="#b9ab90" strokeWidth="1.4" opacity=".75">{[0, 1, 2, 3, 4].map((l) => <line key={l} x1="-20" x2="620" y1={l * 9} y2={l * 9} />)}</g>)}
      {[[90, 64], [150, 55], [210, 72], [300, 120], [360, 112], [430, 128], [500, 185], [560, 176]].map(([x, y], i) => <g key={i} fill="#6b5a3e"><ellipse cx={x} cy={y} rx="7" ry="5" transform={`rotate(-20 ${x} ${y})`} /><rect x={x + 5} y={y - 30} width="1.8" height="30" /></g>)}
    </svg>);
  if (kind === 'night') return (
    <svg {...common}><defs><linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f1a3a" /><stop offset="1" stopColor="#3b4f8a" /></linearGradient></defs>
      <rect width="600" height="300" fill="url(#nsky)" />
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 137) % 600} cy={(i * 59) % 170} r={i % 5 === 0 ? 1.8 : 1} fill="#fff" opacity={0.4 + (i % 4) * 0.15} />)}
      <circle cx="470" cy="70" r="26" fill="#f4f1de" /><circle cx="482" cy="62" r="24" fill="#16224a" />
      <path d="M0 230 L80 200 L150 225 L240 185 L330 220 L420 190 L520 225 L600 200 V300 H0Z" fill="#0b1229" />
    </svg>);
  // keys: a close, out-of-focus keyboard seen from above, lit from the top
  const W = 46;
  return (
    <svg {...common}><defs><linearGradient id="kbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6dccb" /><stop offset="1" stopColor="#eef0e6" /></linearGradient>
      <linearGradient id="klight" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".35" /></linearGradient>
      <filter id="kblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3.2" /></filter></defs>
      <rect width="600" height="300" fill="url(#kbg)" />
      <g filter="url(#kblur)" transform="translate(-14 96)">
        <rect x="0" y="-8" width="640" height="16" fill="#2a2b24" opacity=".55" />
        {Array.from({ length: 14 }, (_, i) => <rect key={i} x={i * W} y="6" width={W - 3} height="220" rx="4" fill="#fbfbf6" />)}
        {Array.from({ length: 14 }, (_, i) => ([0, 1, 3, 4, 5].includes(i % 7) ? <rect key={i} x={i * W + W * 0.66} y="6" width={W * 0.62} height="128" rx="3" fill="#1c1d18" /> : null))}
      </g>
      <rect width="600" height="300" fill="url(#klight)" />
    </svg>);
}

export function Avatar({ p, size = 62 }: { p: Pick<PersonCard, 'display_name' | 'avatar_url'>; size?: number }) {
  return (
    <span className="pc-avatar" style={{ width: size, height: size, ['--h' as string]: hue(p.display_name) }}>
      {p.avatar_url ? <img src={p.avatar_url} alt="" loading="lazy" /> : <b style={{ fontSize: size * 0.36 }}>{initials(p.display_name)}</b>}
    </span>
  );
}

/* ---------- the card ---------- */
export function PersonCardView({ p, mine, saved, onOpen, onSave }: { p: PersonCard; mine?: boolean; saved?: boolean; onOpen: () => void; onSave?: () => void }) {
  const s = p.stats ?? {};
  const level = s.level ?? 0;
  return (
    <article className="pcard" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} aria-label={`${p.display_name}, open card`}>
      <div className="pc-cover"><CoverArt kind={p.cover} /></div>
      {mine
        ? <button className="pc-mark" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="Edit your card"><Icon name="edit" size={15} /></button>
        : onSave && <button className={`pc-mark ${saved ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onSave(); }} aria-label={saved ? 'Remove from saved' : 'Save'} aria-pressed={saved}><Icon name="bookmark" size={15} /></button>}
      <div className="pc-body">
        <Avatar p={p} />
        <div className="pc-id">
          <h3>{p.display_name}{mine && <span className="pc-you">You</span>}</h3>
          <p className="pc-line">{p.headline || `Learning ${p.plays.includes('voice') && !p.plays.includes('piano') ? 'to sing' : 'piano'} with Maestro`}</p>
          <div className="pc-meta-row">
            <div className="pc-meta">
              <span><Icon name="calendar" size={12} />{joined(p.joined_at)}</span>
              <span><Icon name="pin" size={12} />{p.location || lastSeen(s.last)}</span>
            </div>
            <div className="pc-plays" title={p.plays.map((x) => PLAYS.find((y) => y.id === x)?.label).join(', ')}>
              <span className="pc-play-ics">{p.plays.slice(0, 4).map((x) => <i key={x}><Icon name={PLAYS.find((y) => y.id === x)?.icon ?? 'note'} size={11} /></i>)}</span>
              <span>Plays</span>
            </div>
          </div>
        </div>
        <div className="pc-foot">
          <div className="pc-stats">
            <span><b><Icon name="star" size={13} />{s.done ?? 0}</b><i>lessons</i></span>
            <span><b>Level {level}</b><i>{LEVEL_GROUP[level]?.toLowerCase() ?? 'path'}</i></span>
            <span><b>{hours(s.minutes)}</b><i>practice</i></span>
          </div>
          {p.link_url
            ? <a className="pc-cta" href={p.link_url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>{p.link_label || 'Watch me play'}</a>
            : <button className="pc-cta" onClick={(e) => { e.stopPropagation(); onOpen(); }}>{mine ? 'Edit card' : 'See journey'}</button>}
        </div>
      </div>
    </article>
  );
}

/* ---------- full card: the journey ---------- */
function Journey({ p, mine, onEdit, onClose }: { p: PersonCard; mine: boolean; onEdit: () => void; onClose: () => void }) {
  const s = p.stats ?? {};
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet pj-sheet" role="dialog" aria-label={p.display_name} onClick={(e) => e.stopPropagation()}>
        <div className="pj-cover"><CoverArt kind={p.cover} /><button className="pc-mark" onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button></div>
        <div className="pj-body">
          <Avatar p={p} size={76} />
          <h3>{p.display_name}</h3>
          <p className="pc-line">{p.headline || 'Learning with Maestro'}</p>
          <div className="pc-meta"><span><Icon name="calendar" size={12} />{joined(p.joined_at)}</span>{p.location && <span><Icon name="pin" size={12} />{p.location}</span>}<span><Icon name="clock" size={12} />{lastSeen(s.last)}</span></div>
          <div className="pj-nums">
            <span><b>{s.done ?? 0}</b><i>lessons mastered</i></span>
            <span><b>{s.streak ?? 0}</b><i>day streak</i></span>
            <span><b>{s.days ?? 0}</b><i>days practiced</i></span>
            <span><b>{hours(s.minutes)}</b><i>at the keys</i></span>
          </div>
          <h4>The journey so far</h4>
          <ol className="pj-path">
            {(s.levels ?? []).filter(([lv, d], i, a) => d > 0 || lv <= (s.level ?? 0) || i === 0 || (a[i - 1]?.[1] ?? 0) > 0).map(([lv, d, t]) => (
              <li key={lv} className={d >= t ? 'done' : d > 0 ? 'on' : ''}>
                <span className="pj-dot">{d >= t ? <Icon name="check" size={12} /> : lv}</span>
                <div><b>{LEVEL_NAMES[lv] ?? `Level ${lv}`}</b><small>{d} of {t} lessons</small><span className="pj-bar"><i style={{ width: `${(100 * d) / Math.max(1, t)}%` }} /></span></div>
              </li>
            ))}
            {(s.voice ?? 0) > 0 && <li className="on"><span className="pj-dot"><Icon name="mic" size={12} /></span><div><b>Voice</b><small>{s.voice} singing lessons mastered</small></div></li>}
          </ol>
          <div className="pj-actions">
            {p.link_url && <a className="pc-cta big" href={p.link_url} target="_blank" rel="noopener noreferrer nofollow ugc"><Icon name="link" size={15} />{p.link_label || 'Watch me play'} <small>{linkHost(p.link_url)}</small></a>}
            {mine && <button className="btn" onClick={onEdit}><Icon name="edit" size={15} />Edit my card</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- edit my card ---------- */
function EditCard({ start, onClose }: { start: CardDraft; onClose: () => void }) {
  const [d, setD] = useState<CardDraft>(start);
  const [link, setLink] = useState(start.link_url ?? '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const put = (p: Partial<CardDraft>) => setD((x) => ({ ...x, ...p }));
  const linkOk = !link.trim() || !!cleanLink(link);
  const preview: PersonCard = { id: 'me', ...d, link_url: cleanLink(link), stats: myStats(), joined_at: new Date().toISOString(), updated_at: '' };
  const save = async () => {
    if (!d.display_name.trim()) { setErr('Add your name.'); return; }
    if (!linkOk) { setErr('That link does not look right. Paste the full address, like youtube.com/@you.'); return; }
    setBusy('save'); setErr('');
    try { await saveCard({ ...d, link_url: cleanLink(link) }); onClose(); } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  const photo = async (f?: File) => {
    if (!f) return;
    setBusy('photo'); setErr('');
    try { put({ avatar_url: await uploadAvatar(f) }); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet pe-sheet" role="dialog" aria-label="Your card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><div><small className="muted">People</small><b>Your card</b></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
        <div className="pe-preview"><PersonCardView p={preview} mine onOpen={() => undefined} /></div>
        <div className="pe-form">
          <div className="pe-photo">
            <Avatar p={d} size={56} />
            <button className="btn" onClick={() => file.current?.click()} disabled={!!busy}>{busy === 'photo' ? 'Uploading…' : d.avatar_url ? 'Change photo' : 'Add a photo'}</button>
            {d.avatar_url && <button className="link" onClick={() => put({ avatar_url: null })}>Remove</button>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void photo(e.target.files?.[0])} />
          </div>
          <label>Name<input value={d.display_name} maxLength={40} onChange={(e) => put({ display_name: e.target.value })} placeholder="How people see you" /></label>
          <label>A line about you<input value={d.headline ?? ''} maxLength={80} onChange={(e) => put({ headline: e.target.value })} placeholder="Learning gospel chords for Sunday choir" /></label>
          <label>Where you are <span className="muted">(optional, a city is plenty)</span><input value={d.location ?? ''} maxLength={40} onChange={(e) => put({ location: e.target.value })} placeholder="Freetown" /></label>
          <div className="pe-group"><span>What you play</span>
            <div className="chip-row">{PLAYS.map((x) => <button key={x.id} className={`chip ${d.plays.includes(x.id) ? 'on' : ''}`} onClick={() => put({ plays: d.plays.includes(x.id) ? d.plays.filter((y) => y !== x.id) : [...d.plays, x.id] })}><Icon name={x.icon} size={14} />{x.label}</button>)}</div>
          </div>
          <div className="pe-group"><span>Cover</span>
            <div className="pe-covers">{COVERS.map((c) => <button key={c} className={d.cover === c ? 'on' : ''} onClick={() => put({ cover: c })} aria-label={`Cover ${c}`}><CoverArt kind={c} /></button>)}</div>
          </div>
          <label>Link to your playing <span className="muted">(YouTube, Instagram, TikTok, Drive…)</span>
            <input value={link} inputMode="url" autoCapitalize="off" autoCorrect="off" onChange={(e) => setLink(e.target.value)} placeholder="youtube.com/@you" className={linkOk ? '' : 'bad'} /></label>
          {link.trim() && <label>Button text<input value={d.link_label ?? ''} maxLength={24} onChange={(e) => put({ link_label: e.target.value })} placeholder="Watch me play" /></label>}
          <label className="pe-toggle"><input type="checkbox" checked={d.visible} onChange={(e) => put({ visible: e.target.checked })} /><span><b>Show my card on People</b><small>Only what is on the card is shared. Your email and plan stay private.</small></span></label>
          {err && <p className="err">{err}</p>}
          <div className="pe-actions">
            <button className="btn lime" onClick={() => void save()} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save card'}</button>
            {start.display_name && <button className="link danger" onClick={async () => { if (confirm('Remove your card from People?')) { await removeCard().catch(() => undefined); onClose(); } }}>Remove my card</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- the page ---------- */
type Filter = 'all' | 'saved' | Plays;
export function PeopleView() {
  const a = useAccount();
  const { people, error, reload } = usePeople();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<PersonCard | null>(null);
  const [editing, setEditing] = useState(false);
  const saved = savedIds();
  const me = a.user?.id ?? (ACCOUNTS_ENABLED ? null : 's1');
  const mine = people?.find((p) => p.id === me) ?? null;
  const list = useMemo(() => (people ?? []).filter((p) => p.id !== me && p.visible)
    .filter((p) => filter === 'all' || (filter === 'saved' ? saved.includes(p.id) : p.plays.includes(filter)))
    .filter((p) => !q.trim() || `${p.display_name} ${p.headline ?? ''} ${p.location ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [people, me, filter, q, saved.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft: CardDraft = mine ?? { display_name: (a.profile?.display_name ?? '').trim(), headline: '', location: '', link_url: null, link_label: '', avatar_url: null, cover: 'forest', plays: ['piano'], visible: true };

  if (ACCOUNTS_ENABLED && !a.user) return (
    <div className="page people">
      <PageHead title="People" sub="See how other learners are getting on, and share your own playing." />
      <section className="card pp-empty"><Icon name="people" size={28} /><b>Sign in to meet other learners</b><p className="muted">People is for members, so cards are only seen by others who are learning too.</p><button className="btn lime" onClick={() => openAccount()}>Sign in</button></section>
    </div>
  );
  return (
    <div className="page people">
      <PageHead title="People" sub="Learners on Maestro: where they are, how far they have come, and where to watch them play." />
      {mine
        ? <section className="pp-mine"><small>Your card</small><PersonCardView p={mine} mine onOpen={() => setOpen(mine)} /></section>
        : <section className="card pp-invite"><div><b>Make your card</b><p className="muted">Add a photo, a line about you and a link to your practice videos. Your progress fills in by itself.</p></div><button className="btn lime" onClick={() => setEditing(true)}><Icon name="plus" size={15} />Make my card</button></section>}
      <div className="pp-tools">
        <label className="pp-search"><Icon name="eye" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, places" aria-label="Search people" /></label>
        <div className="chip-row">
          {([['all', 'Everyone'], ['saved', 'Saved'], ['piano', 'Piano'], ['voice', 'Voice'], ['jazz', 'Jazz']] as [Filter, string][]).map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      {error && <p className="err">Could not load people. <button className="link" onClick={() => void reload()}>Try again</button></p>}
      {!people && !error && <p className="muted">Loading…</p>}
      {people && list.length === 0 && <section className="card pp-empty"><Icon name="people" size={26} /><b>{filter === 'saved' ? 'Nobody saved yet' : q ? 'No one matches that' : 'You are one of the first'}</b><p className="muted">{filter === 'saved' ? 'Tap the bookmark on a card to keep it here.' : 'Cards appear here as other learners make theirs.'}</p></section>}
      <div className="pp-grid">
        {list.map((p) => <PersonCardView key={p.id} p={p} saved={saved.includes(p.id)} onSave={() => toggleSaved(p.id)} onOpen={() => setOpen(p)} />)}
      </div>
      {!ACCOUNTS_ENABLED && <p className="muted small">These are sample cards for this preview build.</p>}
      {open && <Journey p={open} mine={open.id === me} onClose={() => setOpen(null)} onEdit={() => { setOpen(null); setEditing(true); }} />}
      {editing && <EditCard start={draft} onClose={() => setEditing(false)} />}
    </div>
  );
}
