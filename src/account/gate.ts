// What each plan unlocks. Pure functions, unit-tested.
//   Free: Levels 0-2, Beginner songs, Easy singing, mic + MIDI.
//   Pro:  Levels 3-6, the whole song library, Standard singing.
//   Plus: everything: Levels 7-9, Strict and Pro coach singing, your own MusicXML / choir scores.
import type { Lesson } from '../core/types';
import type { Song } from '../songs';

export type Tier = 'free' | 'pro' | 'plus';
export const TIER_NAME: Record<Tier, string> = { free: 'Free', pro: 'Pro', plus: 'Plus' };
const RANK: Record<Tier, number> = { free: 0, pro: 1, plus: 2 };
export const FREE_MAX_LEVEL = 2;
export const PRO_MAX_LEVEL = 6;
export type Feature = 'import';

export interface Entitlement { tier: Tier; pro: boolean; plus: boolean; admin: boolean; enabled: boolean }
export const LOCAL_ENTITLEMENT: Entitlement = { tier: 'plus', pro: true, plus: true, admin: false, enabled: false };

/** church musicians (Level 13) get the hymn path with Pro */
export const lessonTier = (l: Lesson): Tier => (l.track ?? 'piano') === 'voice' || l.level <= FREE_MAX_LEVEL ? 'free' : l.level <= PRO_MAX_LEVEL || l.level === 13 ? 'pro' : 'plus';
export const songTier = (s: Pick<Song, 'level'>): Tier => (s.level === 'Beginner' ? 'free' : 'pro');
export const voiceLevelTier = (id: string): Tier => (id === 'easy' ? 'free' : id === 'standard' ? 'pro' : 'plus');
export const featureTier = (_f: Feature): Tier => 'plus';

const has = (e: Entitlement, need: Tier) => !e.enabled || e.admin || RANK[e.tier] >= RANK[need];
export const allowLesson = (e: Entitlement, l: Lesson) => has(e, lessonTier(l));
export const allowSong = (e: Entitlement, s: Pick<Song, 'level'>) => has(e, songTier(s));
export const allowFeature = (e: Entitlement, f: Feature) => has(e, featureTier(f));
export const allowVoiceLevel = (e: Entitlement, id: string) => has(e, voiceLevelTier(id));

/** Paid time is stored as absolute dates from the server, so it also works offline. */
export function entitlementFrom(profile: { role?: string; pro_until?: string | null; plus_until?: string | null } | null, now = Date.now()): Entitlement {
  const admin = profile?.role === 'admin';
  const live = (d?: string | null) => !!d && new Date(d).getTime() > now;
  const plus = admin || live(profile?.plus_until);
  const pro = plus || live(profile?.pro_until);
  return { tier: plus ? 'plus' : pro ? 'pro' : 'free', pro, plus, admin, enabled: true };
}
