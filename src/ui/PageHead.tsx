// One tidy heading for every page: a small line above, the title, and a few small numbers.
import type { ReactNode } from 'react';

export function PageHead({ kicker, title, sub, stats, children }: { kicker?: string; title: string; sub?: string; stats?: [string, ReactNode][]; children?: ReactNode }) {
  return (
    <section className="ex-head page-head">
      {kicker && <small>{kicker}</small>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      {stats && stats.length > 0 && <div className="ex-stats">{stats.map(([k, v]) => <span key={k}><i>{k}</i>{v}</span>)}</div>}
      {children}
    </section>
  );
}
