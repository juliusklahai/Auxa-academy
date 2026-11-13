// What each plan gives, in plain words: what you will be able to play, not level numbers.
export const PLAN_WHO = {
  free: 'Start from zero and play your first songs.',
  pro: 'For playing real music with both hands, in church or anywhere.',
  plus: 'For musicians who want to play anything they hear.',
} as const;

export const PLAN_ITEMS = {
  free: [
    'Find your way around the keys and read your first notes',
    'Play simple melodies with each hand',
    'Beginner songs with a coach that listens',
    'Sing in tune with the Easy singing coach',
  ],
  pro: [
    'Play with both hands: melody on top, chords underneath',
    'Rhythm, keys, scales and the chords behind the songs you know',
    'Accompany hymns and congregational singing',
    'The full song library, with play-along backing',
    'A sharper singing coach, and progress saved on every device',
  ],
  plus: [
    'Everything in Pro',
    'Play songs by ear, without sheet music, in any key',
    'Jazz, blues, gospel, Latin, highlife and Afrobeat styles',
    'Expressive touch, pedaling and advanced technique',
    'Sight-read and arrange for choir: soprano, alto, tenor, bass',
    'The strictest singing coach, your own scores, and classes for teachers',
  ],
} as const;

export const FREE_LINE = 'Learning the basics, beginner songs and the Easy singing coach stay free.';
