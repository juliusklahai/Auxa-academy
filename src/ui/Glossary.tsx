// The glossary: every music word in plain language. Tap one to hear it, or jump to the lesson that teaches it.
import { useMemo, useState } from 'react';
import { audio } from '../audio/engine';
import { GLOSSARY, GLOSSARY_GROUPS, type Term } from '../curriculum/glossary';
import { lessonById } from '../curriculum/lessons';
import type { Lesson } from '../core/types';
import { Icon } from './Icon';

export function Glossary({ openLesson }: { openLesson: (l: Lesson) => void }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GLOSSARY.filter((t) => (group === 'All' || t.group === group) && (!s || `${t.term} ${t.sign ?? ''} ${t.means}`.toLowerCase().includes(s)));
  }, [q, group]);
  const hear = (t: Term) => { if (t.hear) audio.playNotes(t.hear.map((n) => ({ midi: n.midi, startMs: n.at * 1000, durMs: n.dur * 1000 }))); };
  return (
    <section className="level gloss">
      <div className="level-head"><b>Glossary</b><span className="muted">{GLOSSARY.length} music words, in plain language</span></div>
      <div className="gloss-tools">
        <label className="pp-search"><Icon name="eye" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a word or sign" aria-label="Search the glossary" /></label>
        <div className="chip-row">{['All', ...GLOSSARY_GROUPS].map((g) => <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
      </div>
      {list.length === 0 && <p className="muted">No word matches that.</p>}
      <div className="gloss-grid">
        {list.map((t) => {
          const l = t.lesson ? lessonById(t.lesson) : undefined;
          return (
            <article key={t.term} className="gloss-item">
              <div className="gloss-top">
                {t.sign && <span className="gloss-sign">{t.sign}</span>}
                <b>{t.term}</b>
                {t.hear && <button className="icon-btn sm" onClick={() => hear(t)} aria-label={`Hear ${t.term}`}><Icon name="speaker" size={15} /></button>}
              </div>
              <p>{t.means}</p>
              {l && <button className="link gloss-link" onClick={() => openLesson(l)}>Lesson: {l.title}<Icon name="next" size={13} /></button>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
