// Classes: teachers make a class, share its code, assign lessons and follow each learner. Learners join with
// a code and see what their teacher assigned. Lives in the People tab.
import { useMemo, useState } from 'react';
import { ACCOUNTS_ENABLED } from '../account/config';
import { assign, assignments, createClass, deleteClass, joinClass, leaveClass, myClasses, removeStudent, roster, unassign, useAsync, type ClassRow } from '../account/classes';
import { openAccount, openUpgrade, useAccount } from '../account/store';
import { LEVEL_NAMES } from '../curriculum/levels';
import { LESSONS, lessonById } from '../curriculum/lessons';
import type { Lesson } from '../core/types';
import { Icon } from './Icon';
import { progress } from './settings';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string | null) => { if (!d) return ''; const x = new Date(`${d.slice(0, 10)}T12:00:00`); return `${MONTHS[x.getMonth()]} ${x.getDate()}`; };
const ago = (d: string | null) => { if (!d) return 'not yet'; const n = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d)) / 86400000); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

export function ClassesView({ openLesson }: { openLesson: (l: Lesson, ex?: number) => void }) {
  const a = useAccount();
  const mine = useAsync(() => myClasses(), [a.user?.id]);
  const [open, setOpen] = useState<ClassRow | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const canTeach = !ACCOUNTS_ENABLED || a.ent.plus || a.ent.admin || (a.profile as { role?: string } | null)?.role === 'teacher';

  if (ACCOUNTS_ENABLED && !a.user) return (
    <section className="card pp-empty"><Icon name="people" size={26} /><b>Sign in to join or teach a class</b><p className="muted">Teachers share a class code; learners join with it.</p><button className="btn lime" onClick={() => openAccount()}>Sign in</button></section>
  );
  if (open) return <ClassPage c={open} teacher={open.owner === a.user?.id || (!ACCOUNTS_ENABLED && open.id === 'c1')} openLesson={openLesson} onBack={() => { setOpen(null); mine.reload(); }} />;

  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); setMsg(''); try { await f(); } catch (e) { setMsg((e as Error).message); } setBusy(''); };
  const { teaching = [], joined = [] } = mine.value ?? {};
  return (
    <div className="classes">
      {mine.error && <p className="err">{mine.error}</p>}
      <section className="card cl-join">
        <div><b>Join a class</b><p className="muted">Type the 6-letter code from your teacher. They will see your name and lesson progress, never your email or plan.</p></div>
        <div className="cl-row">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="K7M2QX" aria-label="Class code" inputMode="text" autoCapitalize="characters" />
          <button className="btn lime" disabled={code.length !== 6 || !!busy} onClick={() => run('join', async () => { const c = await joinClass(code); setCode(''); setMsg(`You joined ${c.name}.`); mine.reload(); })}>{busy === 'join' ? 'Joining…' : 'Join'}</button>
        </div>
      </section>
      {msg && <p className="cl-msg">{msg}</p>}
      {joined.length > 0 && <h4 className="cl-h">Your classes</h4>}
      {joined.map((c) => <button key={c.id} className="cl-tile" onClick={() => setOpen(c)}><span className="game-ic"><Icon name="people" size={18} /></span><span className="game-t"><b>{c.name}</b><small>Open your assignments</small></span><Icon name="next" size={15} /></button>)}
      <h4 className="cl-h">Teaching</h4>
      {teaching.map((c) => <button key={c.id} className="cl-tile" onClick={() => setOpen(c)}><span className="game-ic"><Icon name="award" size={18} /></span><span className="game-t"><b>{c.name}</b><small>Code {c.code}</small></span><Icon name="next" size={15} /></button>)}
      {canTeach ? (
        <section className="card cl-join">
          <div><b>Start a class</b><p className="muted">For a school, a church music team or private students. Share the code, assign lessons, and see everyone's progress in one place.</p></div>
          <div className="cl-row">
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Saturday youth keyboard" aria-label="Class name" />
            <button className="btn" disabled={!name.trim() || !!busy} onClick={() => run('make', async () => { const c = await createClass(name); setName(''); mine.reload(); setOpen(c); })}>{busy === 'make' ? 'Making…' : 'Make class'}</button>
          </div>
        </section>
      ) : (
        <section className="card cl-join"><div><b>Teach with Maestro</b><p className="muted">Classes for teachers come with the Plus plan.</p></div><button className="btn lime" onClick={() => openUpgrade('Classes for teachers are part of Plus.')}>See Plus</button></section>
      )}
    </div>
  );
}

function ClassPage({ c, teacher, openLesson, onBack }: { c: ClassRow; teacher: boolean; openLesson: (l: Lesson, ex?: number) => void; onBack: () => void }) {
  const as = useAsync(() => assignments(c.id), [c.id]);
  const list = as.value ?? [];
  const rs = useAsync(() => (teacher ? roster(c.id, list) : Promise.resolve([])), [c.id, teacher, list.length]);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const levels = useMemo(() => [...new Set(LESSONS.map((l) => l.level))].sort((x, y) => x - y), []);
  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message); } setBusy(''); };
  const share = async () => {
    const text = `Join my Maestro class "${c.name}" with the code ${c.code}.`;
    try { if (navigator.share) await navigator.share({ title: c.name, text }); else { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch { /* closed */ }
  };
  return (
    <div className="classes">
      <button className="btn ghost cl-back" onClick={onBack}><Icon name="back" size={15} />Classes</button>
      <section className="card cl-head">
        <div><small className="muted">{teacher ? 'You teach' : 'Your class'}</small><h2>{c.name}</h2></div>
        {teacher && <div className="cl-code"><span>Class code</span><b>{c.code}</b><button className="btn" onClick={() => void share()}><Icon name="share" size={14} />{copied ? 'Copied' : 'Share'}</button></div>}
      </section>
      {err && <p className="err">{err}</p>}

      <h4 className="cl-h">Assignments</h4>
      {as.value && list.length === 0 && <p className="muted">{teacher ? 'Nothing assigned yet. Pick a lesson below.' : 'Nothing assigned yet.'}</p>}
      <div className="cl-assign">
        {list.map((x) => {
          const l = lessonById(x.lesson_id);
          if (!l) return null;
          const done = progress.lessonComplete(l);
          const nDone = (rs.value ?? []).filter((s) => s.finished[x.id]).length;
          return (
            <article key={x.id} className="cl-a">
              <div className="cl-a-main">
                <small className="muted">Level {l.level} · {LEVEL_NAMES[l.level]}{x.due ? ` · due ${short(x.due)}` : ''}</small>
                <b>{l.title}</b>
                {x.note && <p>{x.note}</p>}
                {teacher && rs.value && <small className="muted">{nDone} of {rs.value.length} finished</small>}
              </div>
              <div className="cl-a-act">
                {!teacher && done && <span className="cl-done"><Icon name="check" size={13} />Done</span>}
                <button className="btn" onClick={() => openLesson(l)}><Icon name={teacher ? 'expand' : 'play'} size={14} />{teacher ? 'Present' : 'Open'}</button>
                {teacher && <button className="icon-btn" aria-label="Remove assignment" onClick={() => run('rm' + x.id, async () => { await unassign(x.id); as.reload(); })}><Icon name="close" size={14} /></button>}
              </div>
            </article>
          );
        })}
      </div>
      {teacher && (
        <section className="card cl-new">
          <b>Assign a lesson</b>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Lesson">
            <option value="">Choose a lesson…</option>
            {levels.map((lv) => <optgroup key={lv} label={`Level ${lv} · ${LEVEL_NAMES[lv] ?? 'Singing'}`}>{LESSONS.filter((l) => l.level === lv).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>)}
          </select>
          <div className="cl-row">
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="A note for the class (optional)" aria-label="Note" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          </div>
          <button className="btn lime" disabled={!pick || !!busy} onClick={() => run('add', async () => { await assign(c.id, pick, note, due || null); setPick(''); setNote(''); setDue(''); as.reload(); })}>{busy === 'add' ? 'Assigning…' : 'Assign'}</button>
          <p className="muted small">Present opens the lesson so you can teach it on a projector or TV; press full screen for the biggest view.</p>
        </section>
      )}

      {teacher && (
        <>
          <h4 className="cl-h">Learners {rs.value ? `(${rs.value.length})` : ''}</h4>
          {rs.error && <p className="err">{rs.error}</p>}
          {rs.value && rs.value.length === 0 && <p className="muted">No one yet. Share the code {c.code}.</p>}
          {rs.value && rs.value.length > 0 && (
            <div className="cl-table" role="table" aria-label="Learners">
              <div className="cl-tr head" role="row"><span>Name</span><span>Level</span><span>Lessons</span><span>This week</span><span>Last practice</span>{list.length > 0 && <span>Assigned</span>}<span /></div>
              {rs.value.map((s) => (
                <div key={s.user_id} className="cl-tr" role="row">
                  <span className="cl-name"><b>{s.name}</b>{s.streak > 1 && <small>{s.streak}-day streak</small>}</span>
                  <span>{s.level}</span><span>{s.done}</span><span>{s.weekMinutes} min</span><span>{ago(s.last)}</span>
                  {list.length > 0 && <span>{list.filter((x) => s.finished[x.id]).length}/{list.length}</span>}
                  <span><button className="icon-btn sm" aria-label={`Remove ${s.name}`} onClick={() => { if (confirm(`Remove ${s.name} from the class?`)) void run('rmu', async () => { await removeStudent(c.id, s.user_id); rs.reload(); }); }}><Icon name="close" size={13} /></button></span>
                </div>
              ))}
            </div>
          )}
          <button className="link danger cl-del" onClick={() => { if (confirm(`Delete "${c.name}"? Learners are removed and assignments deleted.`)) void run('del', async () => { await deleteClass(c.id); onBack(); }); }}>Delete this class</button>
        </>
      )}
      {!teacher && <button className="link danger cl-del" onClick={() => { if (confirm(`Leave "${c.name}"?`)) void run('leave', async () => { await leaveClass(c.id); onBack(); }); }}>Leave this class</button>}
    </div>
  );
}
