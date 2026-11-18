// Personal score library in IndexedDB (works offline, survives restarts, handles large files).
export interface LibItem { id: string; title: string; composer: string; xml: string; addedAt: number }

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('maestro', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('scores', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const q = fn(d.transaction('scores', mode).objectStore('scores')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const saveScore = (it: LibItem) => tx('readwrite', (s) => s.put(it)).catch(() => undefined);
export const listScores = () => tx<LibItem[]>('readonly', (s) => s.getAll() as IDBRequest<LibItem[]>).then((l) => l.sort((a, b) => b.addedAt - a.addedAt)).catch(() => [] as LibItem[]);
export const deleteScore = (id: string) => tx('readwrite', (s) => s.delete(id)).catch(() => undefined);
export function scoreId(title: string, xml: string) {
  let h = 0;
  for (let i = 0; i < xml.length; i += 7) h = (h * 31 + xml.charCodeAt(i)) | 0;
  return `${title}-${xml.length}-${(h >>> 0).toString(36)}`;
}

/** Give a score a new title inside its MusicXML (work title and movement title). */
export function retitleXml(xml: string, title: string): string {
  const e = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let x = xml;
  if (/<work-title>[\s\S]*?<\/work-title>/.test(x)) x = x.replace(/<work-title>[\s\S]*?<\/work-title>/, `<work-title>${e}</work-title>`);
  else if (/<work>/.test(x)) x = x.replace('<work>', `<work><work-title>${e}</work-title>`);
  else x = x.replace(/(<score-partwise[^>]*>)/, `$1<work><work-title>${e}</work-title></work>`);
  return x.replace(/<movement-title>[\s\S]*?<\/movement-title>/, `<movement-title>${e}</movement-title>`);
}
