import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Layers, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import StatusBadge from './StatusBadge';
import { HISTORY_GRID } from './ReportHistoryRow';

export default function WorkbookHistoryRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const s = item.listSummary || {};
  const stats = item.stats || {};
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const total = Number(stats.total ?? 0);
  const completed = Number(stats.completed ?? 0);
  const failed = Number(stats.failed ?? 0);
  const threshold = item.defaultThreshold ?? 99;

  return (
    <div className="border-b border-noc-border/60 last:border-0">
      <div
        className={clsx(
          HISTORY_GRID,
          'cursor-pointer px-4 py-3 text-left transition-colors',
          'hover:bg-noc-accent/5 focus-visible:bg-noc-accent/5',
          expanded && 'bg-noc-accent/[0.07]'
        )}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <Chevron className="h-4 w-4 text-noc-muted" strokeWidth={1.75} aria-hidden="true" />

        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-noc-accent/25 bg-noc-accent/10 text-noc-accent"
          aria-hidden="true"
        >
          <Layers className="h-4 w-4" strokeWidth={1.75} />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-noc-text">CMM workbook</p>
            <span className="hidden shrink-0 rounded border border-noc-border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-noc-muted sm:inline">
              {total} KPIs
            </span>
          </div>
          <p className="truncate font-mono text-[11px] text-noc-muted">{item.original_filename}</p>
          <div className="mt-1.5 flex items-center gap-2 md:hidden">
            <StatusBadge status={item.status} />
            <span className="tabular truncate text-[11px] text-noc-muted">
              {new Date(item.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="hidden md:block">
          <StatusBadge status={item.status} />
        </div>

        <div className="tabular hidden text-right text-xs text-noc-textDim lg:block">
          {completed}/{total} KPIs
        </div>

        <div className="tabular hidden text-right text-xs text-noc-textDim xl:block">
          {threshold}% target
        </div>

        <div className="tabular hidden truncate text-right text-xs text-noc-muted md:block">
          {new Date(item.created_at).toLocaleString()}
        </div>

        <Link
          to={`/workbooks/${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-secondary w-full justify-center px-2 py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          Open
        </Link>
      </div>

      {expanded && (
        <div className="border-t border-noc-border/50 bg-noc-bg/50 px-4 py-5 sm:pl-[4.75rem]">
          {s.narrative && (
            <p className="max-w-prose text-sm leading-relaxed text-noc-textDim">{s.narrative}</p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-noc-border bg-noc-border sm:grid-cols-4">
            {[
              { label: 'KPIs', value: total, tone: 'text-noc-text' },
              { label: 'Completed', value: completed, tone: 'text-noc-success' },
              { label: 'Failed', value: failed, tone: failed > 0 ? 'text-noc-danger' : 'text-noc-text' },
              { label: 'Threshold', value: `${threshold}%`, tone: 'text-noc-text' },
            ].map((cell) => (
              <div key={cell.label} className="bg-noc-card px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-[0.1em] text-noc-muted">
                  {cell.label}
                </dt>
                <dd className={clsx('tabular mt-1 text-base font-semibold', cell.tone)}>
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 overflow-x-auto rounded-xl border border-noc-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-noc-border bg-noc-bg/70 text-left">
                  <th className="px-3 py-2 font-medium uppercase tracking-[0.1em] text-[10px] text-noc-muted">
                    KPI
                  </th>
                  <th className="px-3 py-2 font-medium uppercase tracking-[0.1em] text-[10px] text-noc-muted">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right font-medium uppercase tracking-[0.1em] text-[10px] text-noc-muted">
                    Threshold
                  </th>
                  <th className="px-3 py-2 text-right font-medium uppercase tracking-[0.1em] text-[10px] text-noc-muted">
                    Average
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {item.kpis?.map((kpi) => (
                  <tr
                    key={kpi.reportId}
                    className="border-b border-noc-border/40 transition-colors last:border-0 hover:bg-noc-accent/5"
                  >
                    <td className="px-3 py-2 font-medium text-noc-text">{kpi.kpiName}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={kpi.status} />
                    </td>
                    <td className="tabular px-3 py-2 text-right text-noc-textDim">
                      {kpi.threshold ?? threshold}%
                    </td>
                    <td className="tabular px-3 py-2 text-right text-noc-textDim">
                      {kpi.listSummary?.average || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/workbooks/${item.id}`}
                        className="font-medium text-noc-accent underline-offset-4 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
