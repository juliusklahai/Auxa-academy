// What is free and what needs Pro. Pure functions, unit-tested.
import type { Lesson } from '../core/types';
import type { Song } from '../songs';

export const FREE_MAX_LEVEL = 2;
export type Feature = 'import' | 'voiceLevels' | 'allSongs' | 'allLevels';

export interface Entitlement { pro: boolean; admin: boolean; enabled: boolean }
export const LOCAL_ENTITLEMENT: Entitlement = { pro: true, admin: false, enabled: false };

/** Levels 0-2 and the voice lessons are free; Levels 3-9 need Pro. */
export const lessonIsFree = (l: Lesson) => (l.track ?? 'piano') === 'voice' || l.level <= FREE_MAX_LEVEL;
/** Beginner songs are free. */
export const songIsFree = (s: Pick<Song, 'level'>) => s.level === 'Beginner';
/** The Easy singing level is free; Standard, Strict and Pro coach need Pro. */
export const voiceLevelIsFree = (id: string) => id === 'easy';

export const allowLesson = (e: Entitlement, l: Lesson) => !e.enabled || e.pro || e.admin || lessonIsFree(l);
export const allowSong = (e: Entitlement, s: Pick<Song, 'level'>) => !e.enabled || e.pro || e.admin || songIsFree(s);
export const allowFeature = (e: Entitlement, f: Feature) => !e.enabled || e.pro || e.admin || (f !== 'import' && f !== 'voiceLevels' && f !== 'allSongs' && f !== 'allLevels');
export const allowVoiceLevel = (e: Entitlement, id: string) => !e.enabled || e.pro || e.admin || voiceLevelIsFree(id);

/** Pro is active while paid-until is in the future (absolute date from the server, so it also works offline). */
export function entitlementFrom(profile: { role?: string; pro_until?: string | null } | null, now = Date.now()): Entitlement {
  const admin = profile?.role === 'admin';
  const pro = admin || (!!profile?.pro_until && new Date(profile.pro_until).getTime() > now);
  return { pro, admin, enabled: true };
}
