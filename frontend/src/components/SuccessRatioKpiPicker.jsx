import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownNarrowWide, ListOrdered, Search, X } from 'lucide-react';

const ICON_STROKE = 1.75;

/**
 * Chooser for the KPIs in a success-ratio report.
 *
 * The PS workbook holds 22 of them, which is past the point where a row of
 * buttons works: the list is filterable, and it can be ordered either the way
 * the workbook lists them or weakest-first, which is the order someone opening
 * the report at 3am actually wants.
 */
export default function SuccessRatioKpiPicker({
  kpis = [],
  value,
  onChange,
  attentionThreshold = 95,
  className,
}) {
  const [query, setQuery] = useState('');
  const [worstFirst, setWorstFirst] = useState(false);

  const ordered = useMemo(() => {
    const rows = [...kpis];
    rows.sort((a, b) =>
      worstFirst ? (a.average ?? 101) - (b.average ?? 101) : (a.order ?? 0) - (b.order ?? 0)
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (k) =>
        k.name.toLowerCase().includes(needle) ||
        String(k.entityHeader || '').toLowerCase().includes(needle) ||
        String(k.weakestNode || '').toLowerCase().includes(needle)
    );
  }, [kpis, query, worstFirst]);

  if (!kpis.length) return null;

  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Choose a KPI</p>
        <button
          type="button"
          onClick={() => setWorstFirst((on) => !on)}
          aria-pressed={worstFirst}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
            worstFirst
              ? 'bg-noc-accent/15 text-noc-accent'
              : 'text-noc-muted hover:text-noc-text'
          )}
        >
          {worstFirst ? (
            <ArrowDownNarrowWide className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          ) : (
            <ListOrdered className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          )}
          {worstFirst ? 'Weakest first' : 'Workbook order'}
        </button>
      </div>

      <div className="relative mt-2">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-noc-muted"
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${kpis.length} KPIs`}
          aria-label="Filter KPIs"
          className="input-field pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear filter"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-noc-muted hover:text-noc-text"
          >
            <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          </button>
        )}
      </div>

      <div
        role="listbox"
        aria-label="KPIs in this report"
        className="mt-2 max-h-[22rem] space-y-1 overflow-y-auto pr-1"
      >
        {ordered.map((kpi) => {
          const active = kpi.id === value;
          const weak = kpi.average != null && kpi.average < attentionThreshold;
          return (
            <button
              key={kpi.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange?.(kpi.id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-noc-accent/40 bg-noc-accent/10'
                  : 'border-noc-border bg-noc-surface hover:border-noc-accent/25 hover:bg-noc-card'
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={clsx(
                    'block truncate text-xs font-medium',
                    active ? 'text-noc-accent' : 'text-noc-text'
                  )}
                  title={kpi.name}
                >
                  {kpi.name}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-noc-muted">
                  {kpi.entityHeader} · {kpi.nodeCount} node{kpi.nodeCount === 1 ? '' : 's'} ·{' '}
                  {kpi.cadenceLabel}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block font-mono text-xs font-semibold text-noc-text">
                  {kpi.average != null ? `${kpi.average.toFixed(2)}%` : '—'}
                </span>
                <span className={clsx('badge mt-0.5', weak ? 'badge-warning' : 'badge-success')}>
                  {weak ? 'Watch' : 'Healthy'}
                </span>
              </span>
            </button>
          );
        })}
        {!ordered.length && (
          <p className="px-3 py-6 text-center text-xs text-noc-muted">
            No KPI in this report matches that filter.
          </p>
        )}
      </div>
    </div>
  );
}
