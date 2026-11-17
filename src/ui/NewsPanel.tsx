// News from Auxa (a bell in the top bar) and the notification settings.
import { useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED } from '../account/config';
import { askPermission, canRemind, fetchNews, lastSeen, markSeen, permission, type News } from '../notify';
import { native } from '../native/bridge';
import { setSettings, useSettings } from './settings';
import { Icon } from './Icon';

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function NewsBell() {
  const [items, setItems] = useState<News[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(lastSeen);
  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return;
    const load = () => fetchNews().then(setItems).catch(() => undefined);
    void load();
    const t = window.setInterval(load, 30 * 60 * 1000);
    window.addEventListener('online', load);
    return () => { clearInterval(t); window.removeEventListener('online', load); };
  }, []);
  if (!ACCOUNTS_ENABLED) return null;
  const unread = items.filter((n) => n.id > seen).length;
  const show = () => { setOpen((o) => !o); if (items[0]) { markSeen(items[0].id); window.setTimeout(() => setSeen(lastSeen()), 1500); } };
  return (
    <div className="news-wrap">
      <button className="nav-io news-bell" onClick={show} aria-label={unread ? `News: ${unread} new` : 'News'} title="News from Auxa">
        <Icon name="bell" size={17} />{unread > 0 && <span className="news-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <div className="news-back" onClick={() => setOpen(false)} />}
      {open && (
        <div className="news-pop" role="dialog" aria-label="News from Auxa">
          <div className="news-head"><b>News from Auxa</b><button className="news-close" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={14} /></button></div>
          {items.length === 0 ? <p className="muted small">No news yet.</p> : (
            <ul>{items.map((n) => <li key={n.id} className={n.id > seen ? 'new' : ''}><small className="muted">{fmt(n.created_at)}</small><b>{n.title}</b>{n.body && <p>{n.body}</p>}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

export function NotifySettings() {
  const st = useSettings();
  const [perm, setPerm] = useState(permission);
  const ensure = async () => { if (permission() !== 'granted') { const ok = await askPermission(); setPerm(ok ? 'granted' : 'ask'); return ok; } return true; };
  return (
    <div className="field notify-settings">Notifications
      {canRemind() ? (
        <>
          <label className="check"><input type="checkbox" checked={!!st.remindOn} onChange={async (e) => { const on = e.target.checked; if (on && !(await ensure())) return; setSettings({ remindOn: on }); }} /> Daily practice reminder (skipped on days you already practised)</label>
          {st.remindOn && <label className="row" style={{ gap: 8, alignItems: 'center' }}>At <input type="time" value={st.remindTime || '18:00'} onChange={(e) => setSettings({ remindTime: e.target.value })} /></label>}
        </>
      ) : <small className="muted">The daily practice reminder is part of the Android app.</small>}
      <label className="check"><input type="checkbox" checked={st.newsOn !== false} onChange={async (e) => { const on = e.target.checked; if (on) await ensure(); setSettings({ newsOn: on }); }} /> News from Auxa (new lessons and features)</label>
      {perm !== 'granted' && perm !== 'none' && (st.remindOn || st.newsOn !== false) && <button className="btn small" onClick={() => void ensure()}><Icon name="bell" size={14} />Allow notifications</button>}
      {native?.notifyTest && perm === 'granted' && <button className="link-btn small" onClick={() => native!.notifyTest!('Auxa', 'Notifications are working.')}>Send a test notification</button>}
    </div>
  );
}
