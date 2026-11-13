// The Auxa logo, traced from the brand artwork into vector paths (source: 1254px artwork coordinates).
// Navy parts use currentColor so the mark reads on light and dark backgrounds; the swoosh keeps its gradient.
import { useId } from 'react';

import { AUXA_PATHS, MARK_BOX, WORD_BOX } from './brandPaths';
export { AUXA_PATHS, MARK_BOX, WORD_BOX };

function Grad({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}l`} x1="700" y1="520" x2="900" y2="760" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#034f63" /><stop offset=".45" stopColor="#0494c9" /><stop offset="1" stopColor="#00e5f5" /></linearGradient>
      <linearGradient id={`${id}s`} x1="330" y1="700" x2="860" y2="470" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#1fe6c8" /><stop offset=".6" stopColor="#16f3e2" /><stop offset="1" stopColor="#0ff4f7" /></linearGradient>
      <linearGradient id={`${id}w`} x1="255" y1="1020" x2="365" y2="955" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#22d9b8" /><stop offset="1" stopColor="#14f0e4" /></linearGradient>
    </defs>
  );
}

/** The A mark on its own. */
export function AuxaMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const b = MARK_BOX;
  return (
    <svg className={`auxa-mark ${className}`} width={size * (b.w / b.h)} height={size} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden>
      <Grad id={id} />
      <path fill="currentColor" fillRule="evenodd" d={AUXA_PATHS.dark_icon} />
      <path fill={`url(#${id}l)`} fillRule="evenodd" d={AUXA_PATHS.leg} />
      <path fill={`url(#${id}s)`} fillRule="evenodd" d={AUXA_PATHS.swoosh} />
    </svg>
  );
}

/** The "Auxa" wordmark on its own. */
export function AuxaWord({ height = 18, className = '' }: { height?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const b = WORD_BOX;
  return (
    <svg className={`auxa-word ${className}`} width={height * (b.w / b.h)} height={height} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} role="img" aria-label="Auxa">
      <Grad id={id} />
      <path fill="currentColor" fillRule="evenodd" d={AUXA_PATHS.dark_word} />
      <path fill={`url(#${id}w)`} fillRule="evenodd" d={AUXA_PATHS.word_cyan} />
    </svg>
  );
}

/** Mark and wordmark side by side (headers). */
export function AuxaLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return <span className={`auxa-logo ${className}`}><AuxaMark size={size} /><AuxaWord height={size * 0.62} /></span>;
}
