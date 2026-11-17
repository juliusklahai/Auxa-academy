// Saving files and sharing links, everywhere the app runs:
//   Android app : native save (Pictures/Auxa or Downloads/Auxa) and the phone's share sheet
//   browser     : a normal download and the Web Share sheet when there is one
// The Android WebView has neither <a download> nor navigator.share, so without the bridge both did nothing.
import { native, isNativeApp } from './bridge';
import { SITE } from '../progress/certSeal';

export interface Saved {
  /** where the file went, in words ("Pictures › Auxa") */
  where: string;
  /** open it in the phone's viewer (Android app only) */
  open?: () => void;
}

/** The app was installed before saving was added: it needs an update. */
export class NeedsUpdate extends Error {
  constructor() { super('Saving files needs the latest Auxa app. Update it, then try again.'); this.name = 'NeedsUpdate'; }
}
export const APP_UPDATE_URL = `${SITE}Auxa.apk`;

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(new Error('Could not read the file.'));
  r.readAsDataURL(b);
});

/** Android 8–9 ask where to save; the answer comes back on window.__maestroNative.onSaved. */
function pickerResult(): Promise<string> {
  return new Promise((res) => {
    const h = (window.__maestroNative ??= {});
    h.onSaved = (uri: string) => { h.onSaved = undefined; res(uri); };
  });
}

export async function saveBlob(blob: Blob, name: string): Promise<Saved> {
  const type = blob.type || 'application/octet-stream';
  if (native?.saveFile) {
    let uri = native.saveFile(await toBase64(blob), name, type);
    if (uri === 'picker') {
      uri = await pickerResult();
      if (!uri) throw Object.assign(new Error('Not saved.'), { name: 'AbortError' });
      return { where: 'the folder you chose', open: native.openFile ? () => native!.openFile!(uri, type) : undefined };
    }
    if (!uri) throw new Error('Could not save the file. Check there is space on the phone and try again.');
    return { where: type.startsWith('image/') ? 'Pictures › Auxa' : 'Downloads › Auxa', open: native.openFile ? () => native!.openFile!(uri, type) : undefined };
  }
  if (isNativeApp) throw new NeedsUpdate();
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  return { where: 'your downloads' };
}

/**
 * Open the share sheet. Returns false when there is none (old app, desktop browsers): show your own
 * share options then (see shareTargets).
 */
export async function shareLink(title: string, text: string, url: string): Promise<boolean> {
  if (native?.shareText) { native.shareText(title, `${text} ${url}`); return true; }
  if (!isNativeApp && typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({ title, text, url });
    return true;
  }
  return false;
}

/** Plain links to share on popular apps (work in the app and in browsers). */
export function shareTargets(text: string, url: string) {
  const t = encodeURIComponent(text), u = encodeURIComponent(url), both = encodeURIComponent(`${text} ${url}`);
  return [
    { name: 'WhatsApp', href: `https://wa.me/?text=${both}` },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'X', href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { name: 'Email', href: `mailto:?subject=${encodeURIComponent('My Auxa certificate')}&body=${both}` },
  ];
}

export async function copyText(s: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* WebView without clipboard access */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  } catch { return false; }
}
