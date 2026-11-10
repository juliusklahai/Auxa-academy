// A dropdown that matches the app (replaces the browser's own <select> list).
// Written like a native select: <Select value onChange={(e) => e.target.value}> with <option>/<optgroup>
// children, so existing code switches over by changing the tag name.
import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Opt { value: string; label: ReactNode; text: string; disabled?: boolean; group?: string }
type Change = { target: { value: string } };
interface Props {
  value: string | number;
  onChange: (e: Change) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** text shown when the value matches no option */
  placeholder?: string;
  /** shown before the label inside the button (e.g. "Level") */
  prefix?: ReactNode;
}

const textOf = (n: ReactNode): string => Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('');

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.toArray(children).forEach((c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };
    if (c.type === 'optgroup') collect(p.children, p.label, out);
    else if (c.type === 'option') out.push({ value: String(p.value ?? textOf(p.children)), label: p.children, text: textOf(p.children), disabled: p.disabled, group });
    else if (p.children) collect(p.children, group, out);
  });
  return out;
}

export function Select({ value, onChange, children, className = '', disabled, placeholder, prefix, ...rest }: Props) {
  const opts = useMemo(() => collect(children), [children]);
  const v = String(value);
  const cur = opts.find((o) => o.value === v);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, 200);
    setPos({ left: Math.min(Math.max(8, r.left), innerWidth - width - 8), top: up ? r.top - 6 : r.bottom + 6, width, maxH: Math.min(360, up ? above : below), up });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const re = () => place();
    document.addEventListener('pointerdown', off, true);
    window.addEventListener('resize', re); window.addEventListener('scroll', re, true);
    // scroll the chosen item into view
    requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }));
    return () => { document.removeEventListener('pointerdown', off, true); window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o: Opt) => { if (o.disabled) return; setOpen(false); btn.current?.focus(); if (o.value !== v) onChange({ target: { value: o.value } }); };
  const enabled = opts.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); setHi(Math.max(0, opts.findIndex((o) => o.value === v))); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = enabled.indexOf(hi), n = e.key === 'ArrowDown' ? enabled[Math.min(enabled.length - 1, at + 1)] : enabled[Math.max(0, at - 1)];
      setHi(n ?? enabled[0]);
      requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
    if ((e.key === 'Enter' || e.key === ' ') && hi >= 0) { e.preventDefault(); choose(opts[hi]); }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const i = opts.findIndex((o, k) => k > hi && !o.disabled && o.text.toLowerCase().startsWith(e.key.toLowerCase()));
      const j = i >= 0 ? i : opts.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(e.key.toLowerCase()));
      if (j >= 0) { setHi(j); pop.current?.querySelector<HTMLElement>(`[data-i="${j}"]`)?.scrollIntoView({ block: 'nearest' }); }
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button ref={btn} type="button" className={`mselect ${open ? 'open' : ''} ${className}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        aria-label={rest['aria-label']} onClick={() => { setOpen(!open); setHi(opts.findIndex((o) => o.value === v)); }} onKeyDown={key}>
        {prefix && <span className="ms-prefix">{prefix}</span>}
        <span className="ms-label">{cur ? cur.label : placeholder ?? ''}</span>
        <svg className="ms-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={pop} className={`mselect-pop ${pos.up ? 'up' : ''}`} role="listbox" aria-label={rest['aria-label']}
          style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: innerHeight - pos.top } : { top: pos.top }) }}>
          {opts.map((o, i) => {
            const head = o.group !== lastGroup && o.group ? <div className="ms-group" key={`g${i}`}>{o.group}</div> : null;
            lastGroup = o.group;
            return [head, (
              <div key={i} data-i={i} role="option" aria-selected={o.value === v} aria-disabled={o.disabled}
                className={`ms-opt ${o.value === v ? 'sel' : ''} ${i === hi ? 'hi' : ''} ${o.disabled ? 'dis' : ''}`}
                onPointerEnter={() => setHi(i)} onClick={() => choose(o)}>
                <span>{o.label}</span>
                {o.value === v && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>}
              </div>
            )];
          })}
        </div>, document.body)}
    </>
  );
}
