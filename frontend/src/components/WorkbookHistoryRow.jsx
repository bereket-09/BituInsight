import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Layers, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import StatusBadge from './StatusBadge';

export default function WorkbookHistoryRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const s = item.listSummary || {};
  const stats = item.stats || {};

  return (
    <div className="border-b border-noc-border/50 last:border-0">
      <div
        className={clsx(
          'flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-noc-surface/40',
          expanded && 'bg-noc-surface/30'
        )}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <button type="button" className="text-noc-muted" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-noc-accent/15">
          <Layers className="h-5 w-5 text-noc-accent" />
        </div>

        <div className="min-w-[140px] flex-1">
          <p className="font-medium text-noc-text">CMM Workbook</p>
          <p className="truncate text-xs text-noc-muted">{item.original_filename}</p>
        </div>

        <StatusBadge status={item.status} />

        <div className="hidden text-xs text-noc-muted md:block">
          {stats.completed ?? 0}/{stats.total ?? 0} KPIs
        </div>

        <div className="hidden text-xs text-noc-muted lg:block">
          Default {item.defaultThreshold ?? 99}%
        </div>

        <div className="text-xs text-noc-muted">
          {new Date(item.created_at).toLocaleString()}
        </div>

        <Link
          to={`/workbooks/${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-secondary py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
      </div>

      {expanded && (
        <div className="border-t border-noc-border/40 bg-noc-surface/20 px-4 py-4 pl-12">
          <p className="mb-3 text-sm text-noc-muted">{s.narrative}</p>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-noc-border bg-noc-card px-3 py-2">
              <p className="text-[10px] uppercase text-noc-muted">KPIs</p>
              <p className="text-sm font-medium">{stats.total ?? 0}</p>
            </div>
            <div className="rounded-lg border border-noc-border bg-noc-card px-3 py-2">
              <p className="text-[10px] uppercase text-noc-muted">Completed</p>
              <p className="text-sm font-medium text-green-400">{stats.completed ?? 0}</p>
            </div>
            <div className="rounded-lg border border-noc-border bg-noc-card px-3 py-2">
              <p className="text-[10px] uppercase text-noc-muted">Failed</p>
              <p className="text-sm font-medium text-red-400">{stats.failed ?? 0}</p>
            </div>
            <div className="rounded-lg border border-noc-border bg-noc-card px-3 py-2">
              <p className="text-[10px] uppercase text-noc-muted">Threshold</p>
              <p className="text-sm font-medium">{item.defaultThreshold ?? 99}%</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-noc-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-noc-border bg-noc-surface/80 text-left text-noc-muted">
                  <th className="px-3 py-2">KPI</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Threshold</th>
                  <th className="px-3 py-2">Average</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {item.kpis?.map((kpi) => (
                  <tr key={kpi.reportId} className="border-b border-noc-border/30">
                    <td className="px-3 py-2 font-medium">{kpi.kpiName}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={kpi.status} />
                    </td>
                    <td className="px-3 py-2 font-mono">{kpi.threshold ?? item.defaultThreshold ?? 99}%</td>
                    <td className="px-3 py-2">{kpi.listSummary?.average || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/workbooks/${item.id}`}
                        className="text-noc-accent hover:underline"
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
