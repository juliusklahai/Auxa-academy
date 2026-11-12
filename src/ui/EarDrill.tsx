// Ear-training drill screen: hear it, answer by tapping or playing, see why, next round.
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import type { AssessmentReport, Exercise } from '../core/types';
import { makeQuestion, optionLabel, type DrillQuestion, type Sound } from '../curriculum/drills';
import { onLearnerNote } from '../input/bus';
import { setExpected } from '../input/expect';
import { Icon } from './Icon';
import { Staff } from './Staff';
import { Piano, type KeyMark } from './Piano';
import { bumpProgress, progress, useSettings } from './settings';
import { say, stopSpeaking } from './voice';
import { DRILL_LINES } from '../curriculum/spoken';

type Mark = 'right' | 'wrong';

export function EarDrill({ exercise, onNext }: { exercise: Exercise; onNext?: () => void }) {
  const spec = exercise.drill!;
  const rounds = spec.rounds ?? 10;
  const settings = useSettings();
  const [round, setRound] = useState(0);
  const [q, setQ] = useState<DrillQuestion>(() => makeQuestion(spec));
  const [slot, setSlot] = useState(0);
  const [marks, setMarks] = useState<(Mark | null)[]>([]);
  const [tries, setTries] = useState<Record<string, Mark>>({});
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [glow, setGlow] = useState<number | null>(null);
  const points = useRef(0);
  const firstTry = useRef(true);
  const t0 = useRef(performance.now());
  const answered = slot >= q.answers.length;

  const play = (s: Sound[]) => { audio.stopAll(); audio.playNotes(s, 0.7); };
  useEffect(() => {
    setExpected(null);
    audio.onAppNote = (m, on) => setGlow(on ? m : null);
    return () => { audio.onAppNote = null; audio.stopAll(); };
  }, []);
  // every new round starts by playing the question
  useEffect(() => {
    let live = true;
    // the coach reads the task on the first round, then the sound plays
    (round === 0 ? say(DRILL_LINES[spec.kind]) : Promise.resolve()).then(() => { if (live) window.setTimeout(() => { if (live) play(q.sound); }, 300); });
    return () => { live = false; stopSpeaking(); };
  }, [q]); // eslint-disable-line

  const answer = (choice: string | null, ok: boolean) => {
    if (answered || done) return;
    const want = q.answers[slot];
    if (ok) {
      if (firstTry.current) points.current += 1 / q.answers.length;
      setMarks((m) => { const n = [...m]; n[slot] = firstTry.current ? 'right' : 'wrong'; return n; });
      setTries({});
      firstTry.current = true;
      const next = slot + 1;
      setSlot(next);
      if (next >= q.answers.length) window.setTimeout(() => play(q.reveal), 250);
    } else {
      firstTry.current = false;
      if (choice) setTries((t) => ({ ...t, [choice]: 'wrong' }));
      void want;
    }
  };

  // answers played on the keys (on screen, MIDI or microphone)
  const live = useRef({ q, slot, answered, done });
  live.current = { q, slot, answered, done };
  useEffect(() => onLearnerNote((n) => {
    const { q: cq, slot: s, answered: a, done: d } = live.current;
    if (!n.on || a || d || !cq.byKey) return;
    answer(null, cq.byKey(n.midi, s));
  }), []); // eslint-disable-line

  const next = () => {
    if (round + 1 >= rounds) {
      const sc = Math.round((points.current / rounds) * 100);
      setScore(sc); setDone(true);
      const r: AssessmentReport = {
        exerciseId: exercise.id, score: sc, grade: sc >= 90 ? 'A' : sc >= 80 ? 'B' : sc >= 65 ? 'C' : 'D', passed: sc >= exercise.passScore,
        components: [{ key: 'pitch', label: 'Ear', score: sc / 100, weight: 1, measured: true, effectiveWeight: 1 }],
        correct: Math.round(points.current), partial: 0, wrong: rounds - Math.round(points.current), missed: 0, extra: 0, uncertainIgnored: 0,
        problemEvents: [], advice: [], hadThreeConsecutive: false,
      };
      progress.record(r);
      progress.logPractice(Math.round((performance.now() - t0.current) / 1000));
      bumpProgress();
      return;
    }
    setRound(round + 1); setSlot(0); setMarks([]); setTries({}); firstTry.current = true;
    setQ(makeQuestion(spec));
  };
  const restart = () => { points.current = 0; setRound(0); setDone(false); setSlot(0); setMarks([]); setTries({}); firstTry.current = true; setQ(makeQuestion(spec)); };

  const keyMarks = useMemo(() => {
    const m = new Map<number, KeyMark>();
    if (glow !== null) m.set(glow, 'demo');
    return m;
  }, [glow]);
  const lo = Math.min(48, q.tonic - 12), hi = Math.max(84, q.tonic + 24);
  const multi = q.answers.length > 1;

  if (done) {
    return (
      <section className="card drill drill-done">
        <span className="drill-big">{score}<small>%</small></span>
        <b>{score >= exercise.passScore ? 'Passed. Your ear is getting sharper.' : 'Keep at it. Ears grow with short, daily sessions.'}</b>
        <p className="muted small">{Math.round(points.current * 10) / 10} of {rounds} right first time. Pass mark {exercise.passScore}%.</p>
        <div className="drill-actions">
          <button className="btn dark" onClick={restart}><Icon name="restart" size={15} />Go again</button>
          {onNext && <button className="btn lime" onClick={onNext}>Next<Icon name="next" size={15} /></button>}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card drill">
        <div className="drill-top">
          <span className="drill-round">Round {round + 1} of {rounds}</span>
          <div className="drill-dots">{Array.from({ length: rounds }, (_, i) => <i key={i} className={i < round ? 'past' : i === round ? 'now' : ''} />)}</div>
        </div>
        {q.staff && <div className="drill-staff"><Staff events={[{ beat: 0, beats: 4, pitches: q.staff.midi }]} clef={q.staff.clef} timeSig={[4, 4]} fifths={q.staff.fifths} showTime={false} measureWidth={150} /></div>}
        {q.map && <div className="road" aria-label={`Bars: ${q.map.join(' ')}`}>{q.map.map((tok, i) => /^\d$/.test(tok) ? <span key={i} className="road-bar">{tok}</span> : tok.startsWith('[') ? <span key={i} className="road-end">{tok.slice(1)}</span> : <span key={i} className={`road-sign ${/[|:]/.test(tok) ? 'rep' : ''}`}>{tok}</span>)}</div>}
        <p className="drill-prompt">{q.prompt}</p>
        <div className="drill-listen">
          {q.sound.length > 0 && <button className="btn lime" onClick={() => play(q.sound)}><Icon name="play" size={15} />Play again</button>}
          {q.context.length > 0 && <button className="btn" onClick={() => play(q.context)}><Icon name="ear" size={15} />Hear the key</button>}
          {answered && <button className="btn" onClick={() => play(q.reveal)}><Icon name="note" size={15} />Hear the answer</button>}
        </div>
        {multi && (
          <div className="drill-slots">
            {q.answers.map((a, i) => (
              <span key={i} className={`drill-slot ${i === slot ? 'now' : ''} ${marks[i] ?? ''}`}>{i < slot ? optionLabel(spec.kind, a) : i === slot ? '?' : '·'}</span>
            ))}
          </div>
        )}
        {spec.kind !== 'bass' && (
          <div className={`drill-opts ${q.options.length > 8 ? 'many' : ''}`}>
            {q.options.map((o) => {
              const isAns = answered && (multi ? false : q.answers[0] === o);
              return (
                <button key={o} className={`drill-opt ${tries[o] ?? ''} ${isAns ? (marks[0] === 'right' ? 'right' : 'shown') : ''}`} disabled={answered || tries[o] === 'wrong'}
                  onClick={() => answer(o, o === q.answers[slot])}>{optionLabel(spec.kind, o)}</button>
              );
            })}
          </div>
        )}
        {answered && (
          <div className={`drill-explain ${marks.every((m) => m === 'right') ? 'ok' : ''}`}>
            <b>{marks.every((m) => m === 'right') ? 'Right first time.' : 'Got there.'}</b> {q.explain}
            <button className="btn dark" onClick={next}>{round + 1 >= rounds ? 'See my score' : 'Next round'}<Icon name="next" size={15} /></button>
          </div>
        )}
        {!answered && q.byKey && <p className="muted small drill-hint">{spec.kind === 'bass' ? `Chord ${slot + 1}: play its lowest note on the keys.` : spec.kind === 'progression' ? 'You can also answer by playing each chord\'s bass note on the keys.' : 'You can also answer by playing the note on the keys.'}</p>}
      </section>
      {q.byKey && (
        <section className="card keys-card">
          <Piano lo={lo} hi={hi} marks={keyMarks} labels={settings.labels} scrollTo={q.tonic} />
        </section>
      )}
    </>
  );
}
