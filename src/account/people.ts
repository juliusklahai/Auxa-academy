// People: opt-in public cards. Each learner can publish a small card (name, photo, a line about them,
// where they are, when they joined, how far they have come, and one link to their practice videos).
// Nothing else from the account is shared.
import { useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED } from './config';
import { getAccount, supabase } from './store';
import { progress } from '../ui/settings';
import { LESSONS, PIANO_LESSONS, VOICE_LESSONS } from '../curriculum/lessons';

export const COVERS = ['forest', 'keys', 'dusk', 'stage', 'paper', 'night'] as const;
export type Cover = (typeof COVERS)[number];
export type Plays = 'piano' | 'voice' | 'arranging' | 'jazz' | 'ear';

export interface CardStats {
  level: number;          // the level they are working in now
  done: number;           // lessons mastered (all tracks)
  total: number;
  voice: number;          // voice lessons mastered
  streak: number;         // days in a row
  minutes: number;        // all practice, minutes
  days: number;           // days with practice
  last: string | null;    // last practice day, yyyy-mm-dd
  levels: [number, number, number][]; // [level, done, total] for the piano path
  certs?: number[];       // levels with a certificate
}
export interface PersonCard {
  id: string;
  display_name: string;
  headline: string | null;
  location: string | null;
  link_url: string | null;
  link_label: string | null;
  avatar_url: string | null;
  cover: Cover;
  plays: Plays[];
  visible: boolean;
  stats: Partial<CardStats>;
  joined_at: string | null;
  updated_at: string;
}

/** The summary that goes on the card, worked out from this device's progress. */
export function myStats(now = Date.now()): CardStats {
  const done = LESSONS.filter((l) => progress.lessonComplete(l));
  const levelsSeen = [...new Set(PIANO_LESSONS.map((l) => l.level))].sort((a, b) => a - b);
  const levels = levelsSeen.map((lv) => {
    const all = PIANO_LESSONS.filter((l) => l.level === lv);
    return [lv, all.filter((l) => progress.lessonComplete(l)).length, all.length] as [number, number, number];
  });
  const next = PIANO_LESSONS.find((l) => !progress.lessonComplete(l));
  const log = progress.data.practiceLog;
  const days = Object.keys(log).filter((k) => log[k] > 0).sort();
  return {
    level: next ? next.level : levelsSeen[levelsSeen.length - 1] ?? 0,
    done: done.length,
    total: LESSONS.length,
    voice: VOICE_LESSONS.filter((l) => progress.lessonComplete(l)).length,
    streak: progress.streak(now),
    minutes: Math.round(Object.values(log).reduce((a, b) => a + b, 0) / 60),
    days: days.length,
    last: days[days.length - 1] ?? null,
    levels,
    certs: Object.keys(progress.data.certs ?? {}).map(Number).sort((a, b) => a - b),
  };
}

export function cleanLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(u.replace(/^http:/i, 'https:'));
    if (!url.hostname.includes('.')) return null;
    return url.toString().slice(0, 300);
  } catch { return null; }
}
/** "youtube.com/@maya" style label for a link */
export const linkHost = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, ''); } catch { return u; } };

// ---------- reading ----------
let cache: PersonCard[] | null = null;
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());

export async function loadPeople(force = false): Promise<PersonCard[]> {
  if (cache && !force) return cache;
  if (!ACCOUNTS_ENABLED) { cache = SAMPLE; changed(); return cache; }
  const sb = await supabase();
  const { data, error } = await sb.from('public_profiles').select('*').order('updated_at', { ascending: false }).limit(200);
  if (error) throw error;
  cache = (data ?? []) as PersonCard[];
  changed();
  return cache;
}
export function usePeople() {
  const [, bump] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    subs.add(f);
    loadPeople().catch((e) => setErr(String(e?.message ?? e)));
    return () => { subs.delete(f); };
  }, []);
  return { people: cache, error: err, reload: () => loadPeople(true).catch((e) => setErr(String(e?.message ?? e))) };
}
export const myCard = () => { const id = getAccount().user?.id; return id ? cache?.find((p) => p.id === id) ?? null : null; };

// ---------- writing ----------
export type CardDraft = Pick<PersonCard, 'display_name' | 'headline' | 'location' | 'link_url' | 'link_label' | 'avatar_url' | 'cover' | 'plays' | 'visible'>;

export async function saveCard(d: CardDraft) {
  const id = getAccount().user?.id;
  if (!id) throw new Error('Please sign in first.');
  const sb = await supabase();
  const row = { id, ...d, display_name: d.display_name.trim().slice(0, 40), headline: d.headline?.trim().slice(0, 80) || null, location: d.location?.trim().slice(0, 40) || null, link_label: d.link_label?.trim().slice(0, 24) || null, stats: myStats() };
  const { error } = await sb.from('public_profiles').upsert(row);
  if (error) throw error;
  await loadPeople(true);
}
export async function removeCard() {
  const id = getAccount().user?.id;
  if (!id) return;
  const sb = await supabase();
  const { error } = await sb.from('public_profiles').delete().eq('id', id);
  if (error) throw error;
  await loadPeople(true);
}

/** Square-crops and shrinks a photo to 400px webp/jpeg before upload, so cards load fast. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height), out = 400;
  const c = document.createElement('canvas'); c.width = out; c.height = out;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo.'))), 'image/jpeg', 0.86));
}
export async function uploadAvatar(file: File): Promise<string> {
  const id = getAccount().user?.id;
  if (!id) throw new Error('Please sign in first.');
  if (!/^image\//.test(file.type)) throw new Error('Pick a photo (JPG, PNG or WebP).');
  const blob = await shrink(file);
  const sb = await supabase();
  const path = `${id}/avatar-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  // keep only the newest photo
  const { data: old } = await sb.storage.from('avatars').list(id, { limit: 50 });
  const stale = (old ?? []).map((o) => `${id}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await sb.storage.from('avatars').remove(stale);
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Keep the numbers on my card current: called after progress syncs (at most every few minutes). */
let lastStats = 0;
export async function refreshMyStats() {
  if (!ACCOUNTS_ENABLED) return;
  const id = getAccount().user?.id;
  if (!id || Date.now() - lastStats < 180000) return;
  lastStats = Date.now();
  const sb = await supabase();
  await sb.from('public_profiles').update({ stats: myStats() }).eq('id', id);
}

// ---------- saved people (this device) ----------
const SAVED = 'maestro.people.saved';
export const savedIds = (): string[] => { try { return JSON.parse(localStorage.getItem(SAVED) ?? '[]'); } catch { return []; } };
export function toggleSaved(id: string) {
  const s = new Set(savedIds());
  if (s.has(id)) s.delete(id); else s.add(id);
  try { localStorage.setItem(SAVED, JSON.stringify([...s])); } catch { /* private mode */ }
  changed();
}

// Shown only in builds without accounts (local preview), so the page can be designed and tested.
const lv = (done: number[]): [number, number, number][] => done.map((d, i) => [i, d, [4, 8, 8, 9, 6][i] ?? 6]);
const SAMPLE: PersonCard[] = [
  { id: 's1', display_name: 'Aminata Kamara', headline: 'Learning gospel chords for Sunday choir', location: 'Freetown', link_url: 'https://youtube.com/@aminataplays', link_label: 'YouTube', avatar_url: null, cover: 'forest', plays: ['piano', 'voice'], visible: true,
    stats: { level: 3, done: 26, total: 120, voice: 4, streak: 12, minutes: 840, days: 41, last: '2026-11-11', levels: lv([4, 8, 8, 2]), certs: [0, 1, 2] }, joined_at: '2026-06-02T10:00:00Z', updated_at: '2026-11-11T10:00:00Z' },
  { id: 's2', display_name: 'Daniel Osei', headline: 'Jazz voicings, one standard a week', location: 'Accra', link_url: 'https://instagram.com/dan.keys', link_label: 'Instagram', avatar_url: null, cover: 'night', plays: ['piano', 'jazz'], visible: true,
    stats: { level: 5, done: 38, total: 120, voice: 0, streak: 5, minutes: 1920, days: 77, last: '2026-11-10', levels: lv([4, 8, 8, 9, 6, 3]) }, joined_at: '2026-03-15T10:00:00Z', updated_at: '2026-11-10T10:00:00Z' },
  { id: 's3', display_name: 'Grace Bangura', headline: 'Singing alto, arranging for my church choir', location: 'Bo', link_url: null, link_label: null, avatar_url: null, cover: 'keys', plays: ['voice', 'arranging'], visible: true,
    stats: { level: 1, done: 9, total: 120, voice: 7, streak: 2, minutes: 210, days: 14, last: '2026-11-09', levels: lv([4, 3]) }, joined_at: '2026-09-20T10:00:00Z', updated_at: '2026-11-09T10:00:00Z' },
];
