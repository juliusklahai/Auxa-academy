// Where you are in the app, kept for this browser tab so a refresh lands in the same place.
const KEY = 'auxa.route';
export interface Route { tab: string; lesson: string | null }
const TABS = ['home', 'learn', 'music', 'voice', 'studio', 'people', 'settings', 'admin'];
export function readRoute(): Route | null {
  try { const r = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return r && TABS.includes(r.tab) ? r : null; } catch { return null; }
}
export function writeRoute(r: Route) { try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private mode */ } }

/** a lesson's own place (hub, a teaching step, or an exercise) */
const LKEY = 'auxa.lessonPlace';
export interface LessonPlace { id: string; phase: 'hub' | 'teach' | 'practice'; ex: number; step: number }
export function readPlace(id: string): LessonPlace | null {
  try { const p = JSON.parse(sessionStorage.getItem(LKEY) ?? 'null'); return p && p.id === id ? p : null; } catch { return null; }
}
export function writePlace(p: LessonPlace) { try { sessionStorage.setItem(LKEY, JSON.stringify(p)); } catch { /* private mode */ } }
