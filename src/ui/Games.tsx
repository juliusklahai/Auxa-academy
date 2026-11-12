// Games: quick drills from across the course, any time. Each opens the drill inside its lesson.
import { LESSONS } from '../curriculum/lessons';
import type { Lesson } from '../core/types';
import { Icon } from './Icon';

const GAMES: { id: string; title: string; about: string; icon: string; group: string }[] = [
  { group: 'Reading', id: 'L1-7-a', title: 'Treble notes', about: 'Name notes around treble G.', icon: 'note' },
  { group: 'Reading', id: 'L1-7-b', title: 'Bass notes', about: 'Name notes around bass F.', icon: 'note' },
  { group: 'Reading', id: 'L1-7-e', title: 'Whole staff and ledger lines', about: 'Any note, both clefs.', icon: 'note' },
  { group: 'Reading', id: 'L5-6-a', title: 'Key signatures', about: 'See the sharps or flats, name the key.', icon: 'doc' },
  { group: 'Reading', id: 'L4-9-b', title: 'Road map', about: 'Repeats, endings, D.C. and D.S.', icon: 'next' },
  { group: 'Rhythm', id: 'L1-6-a', title: 'Rhythm words', about: 'Ta, ta-a and rests.', icon: 'clap' },
  { group: 'Rhythm', id: 'L4-7-a', title: 'Twos and threes', about: 'Eighths or triplets?', icon: 'clap' },
  { group: 'Rhythm', id: 'L1-6-c', title: 'Tempo words', about: 'Adagio, Andante, Allegro, Presto.', icon: 'clock' },
  { group: 'Rhythm', id: 'L4-8-a', title: 'Time signatures', about: '2/4, 3/4, 4/4 or 6/8?', icon: 'clock' },
  { group: 'Ear', id: 'E10-1-a', title: 'Find home', about: 'Hear a phrase, play the home note.', icon: 'ear' },
  { group: 'Ear', id: 'E10-4-a', title: 'Intervals', about: 'How far apart are the two notes?', icon: 'ear' },
  { group: 'Ear', id: 'E10-2-b', title: 'Major or minor', about: 'Bright or dark chords.', icon: 'ear' },
  { group: 'Ear', id: 'E10-5-a', title: 'Bass lines', about: 'Play the lowest note of each chord.', icon: 'ear' },
];

export function Games({ openLesson }: { openLesson: (l: Lesson, ex?: number) => void }) {
  const find = (id: string) => { for (const l of LESSONS) { const i = l.exercises.findIndex((e) => e.id === id); if (i >= 0) return { l, i }; } return null; };
  const groups = [...new Set(GAMES.map((g) => g.group))];
  return (
    <section className="level games">
      <div className="level-head"><b>Games</b><span className="muted">Two minutes a day keeps reading and ears sharp</span></div>
      {groups.map((gr) => (
        <div key={gr} className="games-group">
          <h4>{gr}</h4>
          <div className="games-grid">
            {GAMES.filter((g) => g.group === gr).map((g) => {
              const hit = find(g.id);
              if (!hit) return null;
              return (
                <button key={g.id} className="game-card" onClick={() => openLesson(hit.l, hit.i)}>
                  <span className="game-ic"><Icon name={g.icon} size={18} /></span>
                  <span className="game-t"><b>{g.title}</b><small>{g.about}</small></span>
                  <Icon name="play" size={15} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
