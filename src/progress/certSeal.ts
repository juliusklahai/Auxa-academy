// The certificate's security marks, all derived from its seal (an HMAC only the Auxa database can make):
// a guilloche rosette (fine interlaced curves, as on banknotes), a microtext ring, a wavy security
// border, and a short melody lit on the keyboard strip. The verify page redraws them from the seal it
// gets from the database: a forged or edited certificate shows a different pattern and melody.

export function sealBytes(seal: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < seal.length; i += 2) out.push(parseInt(seal.slice(i, i + 2), 16) || 0);
  while (out.length < 32) out.push((out.length * 73 + 41) % 256);
  // fold every byte into every other, so changing any character of the seal changes every mark
  let acc = 0x9e;
  const mix = out.map((x, i) => { acc = (acc * 31 + x + i * 17) & 255; return acc; });
  let back = 0x3c;
  for (let i = mix.length - 1; i >= 0; i--) { back = (back * 29 + mix[i]) & 255; mix[i] ^= back; }
  return mix;
}

/** 8 white keys (0..21 on a strip starting at C3), moving by small steps like a tune. */
export function sealMelody(seal: string): number[] {
  const b = sealBytes(seal);
  let k = 7 + (b[0] % 7);
  const m = [k];
  for (let i = 1; i < 8; i++) {
    let step = (b[i] % 5) - 2;
    if (step === 0) step = b[i + 8] % 2 ? 1 : -1;
    k = Math.max(2, Math.min(19, k + step));
    m.push(k);
  }
  return m;
}
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const whiteToMidi = (i: number, base = 48) => base + Math.floor(i / 7) * 12 + WHITE_STEPS[i % 7];
export const sealTune = (seal: string) => sealMelody(seal).map((i) => whiteToMidi(i));

/** Guilloche rosette paths around (cx, cy). */
export function guilloche(seal: string, cx: number, cy: number, r0: number, r1: number): string[] {
  const b = sealBytes(seal);
  const paths: string[] = [];
  const layers = 5;
  for (let L = 0; L < layers; L++) {
    const n = 7 + (b[10 + L] % 11);           // petals
    const m = 2 + (b[16 + L] % 5);            // slow wobble
    const ph = (b[22 + L] / 255) * Math.PI * 2;
    const A = (r1 - r0) * (0.32 + (b[4 + L] % 40) / 200);
    const B = (r1 - r0) * 0.12;
    const mid = (r0 + r1) / 2;
    const rot = (L / layers) * (Math.PI * 2 / n);
    const N = 900;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      const r = mid + A * Math.cos(n * t + rot * n) + B * Math.sin(m * t + ph);
      const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(d + 'Z');
  }
  return paths;
}

/** A thin wavy security line from x0 to x1 around y. */
export function sealWave(seal: string, x0: number, x1: number, y: number, k: number): string {
  const b = sealBytes(seal);
  const f1 = 0.018 + (b[(k * 3) % 32] % 20) / 1000, f2 = 0.05 + (b[(k * 5 + 1) % 32] % 30) / 1000;
  const ph = (b[(k * 7 + 2) % 32] / 255) * Math.PI * 2;
  let d = '';
  for (let x = x0, i = 0; x <= x1; x += 4, i++) {
    const yy = y + 3.2 * Math.sin(x * f1 + ph) + 1.6 * Math.sin(x * f2 - ph * 0.5);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`;
  }
  return d;
}

/** Verify address for a code. */
export const SITE = 'https://juliusklahai.github.io/maestro-academy/';
export const verifyUrl = (code: string) => `${SITE}#/verify/${encodeURIComponent(code)}`;
