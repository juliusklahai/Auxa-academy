// Placement test for people who can already play: short sections that rise in level (reading, rhythm, keys,
// ear). The highest run of passed sections decides where your path opens. Nothing is marked as mastered.
import { useMemo, useState } from 'react';
import { audio } from '../audio/engine';
import { makeQuestion, optionLabel, type DrillQuestion } from '../curriculum/drills';
import { LEVEL_NAMES } from '../curriculum/levels';
import { PER, placementLevel, SECTIONS } from '../curriculum/placement';
import { Icon } from './Icon';
import { bumpProgress, progress } from './settings';
import { Staff } from './Staff';

export function PlacementTest({ onDone }: { onDone: () => void }) {
  const rnd = useMemo(() => { let s = Date.now() % 2147483647; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }, []);
  const [step, setStep] = useState(-1); // -1 intro, then question index, then result
  const [right, setRight] = useState<boolean[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const total = SECTIONS.length * PER;
  const sec = step >= 0 && step < total ? SECTIONS[Math.floor(step / PER)] : null;
  const q: DrillQuestion | null = useMemo(() => (sec ? makeQuestion(sec.spec, rnd) : null), [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = (s = q?.sound) => { if (s?.length) { audio.stopAll(); audio.playNotes(s, 0.7); } };
  const passed = SECTIONS.map((_, i) => right[i * PER] === true && right[i * PER + 1] === true);
  // stop early once two sections in a row are missed: no need to keep going
  const failedRun = (() => { let n = 0; for (let i = 0; i < SECTIONS.length; i++) { if (right[i * PER] === undefined || right[i * PER + 1] === undefined) break; n = passed[i] ? 0 : n + 1; if (n >= 2) return true; } return false; })();
  const finished = step >= total || failedRun;
  const level = placementLevel(passed);
  const opens = Math.min(9, level + 1);

  const answer = (o: string) => {
    if (!q || pick) return;
    setPick(o);
    setRight((r) => { const x = [...r]; x[step] = o === q.answers[0]; return x; });
    play(q.reveal);
  };
  const next = () => { setPick(null); setStep((s) => s + 1); window.setTimeout(() => play(), 350); };
  const apply = () => { progress.data.placedLevel = opens; progress.save(); bumpProgress(); onDone(); };

  return (
    <div className="page place">
      <div className="place-card card">
        <div className="place-head">
          <div><small className="muted">Placement test</small><b>{finished ? 'Your starting point' : step < 0 ? 'Already play? Skip ahead.' : sec!.label}</b></div>
          <button className="icon-btn" onClick={onDone} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        {step < 0 && (
          <>
            <p>About five minutes of quick questions: reading notes, rhythm, key signatures and listening. They get harder as you go, and the test stops when it finds your level.</p>
            <p className="muted">Your path opens from there. Nothing is marked as mastered, so you can still go back to any earlier lesson, and certificates are earned by finishing the lessons.</p>
            <div className="place-actions"><button className="btn lime" onClick={() => { setStep(0); window.setTimeout(() => play(), 350); }}><Icon name="play" size={15} />Start</button><button className="btn" onClick={onDone}>Not now</button></div>
          </>
        )}
        {!finished && q && sec && (
          <>
            <div className="place-bar"><i style={{ width: `${(100 * step) / total}%` }} /></div>
            {q.staff && <div className="drill-staff"><Staff events={[{ beat: 0, beats: 4, pitches: q.staff.midi }]} clef={q.staff.clef} timeSig={[4, 4]} fifths={q.staff.fifths} showTime={false} measureWidth={150} hideRests /></div>}
            <p className="drill-prompt">{q.prompt}</p>
            {q.sound.length > 0 && <button className="btn" onClick={() => play()}><Icon name="play" size={15} />Play again</button>}
            <div className={`drill-opts ${q.options.length > 8 ? 'many' : ''}`}>
              {q.options.map((o) => (
                <button key={o} className={`drill-opt ${pick ? (o === q.answers[0] ? 'right' : o === pick ? 'wrong' : '') : ''}`} disabled={!!pick} onClick={() => answer(o)}>{optionLabel(sec.spec.kind, o)}</button>
              ))}
            </div>
            {pick && <div className="place-actions"><button className="btn lime" onClick={next}>Next<Icon name="next" size={14} /></button></div>}
          </>
        )}
        {finished && (
          <>
            <div className="place-result">
              <span className="cert-seal big">{opens}</span>
              <div><b>Start at Level {opens}: {LEVEL_NAMES[opens]}</b><p className="muted">{level > 0 ? `You answered everything up to Level ${level} correctly.` : 'Start from the beginning: the first lessons go quickly if you already know them.'}</p></div>
            </div>
            <ul className="place-list">
              {SECTIONS.map((s, i) => right[i * PER] !== undefined && <li key={i} className={passed[i] ? 'ok' : 'no'}><Icon name={passed[i] ? 'check' : 'close'} size={13} />Level {s.level} · {s.label}</li>)}
            </ul>
            <div className="place-actions">
              {opens > 1 ? <button className="btn lime" onClick={apply}>Open my path from Level {opens}</button> : <button className="btn lime" onClick={onDone}>Start at the beginning</button>}
              <button className="btn" onClick={() => { setRight([]); setPick(null); setStep(-1); }}>Take it again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
