// What a learner told us at the start: used to pick the starting point, suggest tracks and set a daily goal.
export type Experience = 'new' | 'little' | 'comfortable' | 'advanced';
export type Interest = 'church' | 'pop' | 'classical' | 'jazz' | 'gospel' | 'afro' | 'choir' | 'ear';
export interface LearnerProfile { experience: Experience; interests: Interest[]; minutes: number; name: string }

const KEY = 'maestro.app.profile';
export function getProfile(): LearnerProfile | null {
  try { const p = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return p && p.experience ? p : null; } catch { return null; }
}
export function saveProfile(p: LearnerProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); if (p.name) localStorage.setItem('maestro.cert.name', p.name); } catch { /* private mode */ }
}

/** Which specialty track each interest points to (Lessons tab names). */
export const INTEREST_TRACK: Record<Interest, string> = {
  church: 'Church', pop: 'Styles', classical: 'Advanced', jazz: 'Jazz', gospel: 'Styles', afro: 'Styles', choir: 'Arranging', ear: 'Play by ear',
};
export const INTEREST_LABEL: Record<Interest, string> = {
  church: 'Church and hymns', pop: 'Pop and worship', classical: 'Classical pieces', jazz: 'Jazz and blues',
  gospel: 'Gospel', afro: 'Afrobeat and highlife', choir: 'Choir and arranging', ear: 'Playing by ear',
};
