import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Download,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import StatusBadge from './StatusBadge';

/*
 * Both history row types and the list header share this column template, so the
 * list reads as one aligned table rather than a stack of independent cards.
 * Mobile collapses to four columns and folds the meta into the title cell.
 */
export const HISTORY_GRID =
  'grid w-full grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 ' +
  'md:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_6.75rem_10.5rem_5.75rem] ' +
  'lg:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_6.75rem_7rem_10.5rem_5.75rem] ' +
  'xl:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_6.75rem_7rem_7rem_10.5rem_5.75rem]';

export default function ReportHistoryRow({ report, onDownload }) {
  const [expanded, setExpanded] = useState(false);
  const s = report.listSummary || {};
  const validationErrors = report.validation_errors || [];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const facts = [
    { label: 'Time span', value: s.timeSpan },
    { label: 'Granularity', value: s.timeGranularity },
    { label: 'Total volume', value: s.totalVolume },
    { label: '4G share', value: s.contribution4g },
    { label: 'Peak period', value: s.peakPeriod },
    { label: 'Data points', value: s.dataPoints },
  ];

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
        <Chevron
          className="h-4 w-4 text-noc-muted transition-transform"
          strokeWidth={1.75}
          aria-hidden="true"
        />

        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-noc-border bg-noc-bg text-noc-textDim"
          aria-hidden="true"
        >
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-noc-text">{report.workflow_name}</p>
          <p className="truncate font-mono text-[11px] text-noc-muted">
            {report.original_filename || '—'}
          </p>
          <div className="mt-1.5 flex items-center gap-2 md:hidden">
            <StatusBadge status={report.status} />
            <span className="tabular truncate text-[11px] text-noc-muted">
              {new Date(report.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="hidden md:block">
          <StatusBadge status={report.status} />
        </div>

        <div className="tabular hidden truncate text-right text-xs text-noc-textDim lg:block">
          {s.timeSpan || '—'}
        </div>

        <div className="hidden truncate text-right text-xs text-noc-textDim xl:block">
          {s.timeGranularity || '—'}
        </div>

        <div className="tabular hidden truncate text-right text-xs text-noc-muted md:block">
          {new Date(report.created_at).toLocaleString()}
        </div>

        <Link
          to={`/reports/${report.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-secondary w-full justify-center px-2 py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          Open
        </Link>
      </div>

      {expanded && (
        <div className="border-t border-noc-border/50 bg-noc-bg/50 px-4 py-5 sm:pl-[4.75rem]">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div>
              <p className="eyebrow">Report summary</p>
              {s.narrative ? (
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-noc-textDim">
                  {s.narrative}
                </p>
              ) : (
                <p className="mt-2 text-sm text-noc-muted">No summary available for this report.</p>
              )}

              {validationErrors.length > 0 && (
                <ul className="mt-4 space-y-1.5 rounded-xl border border-noc-danger/25 bg-noc-danger/5 p-3">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-noc-danger">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link to={`/reports/${report.id}`} className="btn-primary px-3 py-2 text-xs">
                  Full report view
                </Link>
                {report.status === 'completed' && onDownload && (
                  <button
                    type="button"
                    onClick={() => onDownload(report.id)}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Download JSON
                  </button>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-noc-border bg-noc-border sm:grid-cols-3">
              {facts.map((item) => (
                <div key={item.label} className="bg-noc-card px-3 py-2.5">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-noc-muted">
                    {item.label}
                  </dt>
                  <dd className="tabular mt-1 text-sm font-medium text-noc-text">
                    {item.value || '—'}
                  </dd>
                </div>
              ))}
              {s.anomalyCount > 0 && (
                <div className="bg-noc-warning/10 px-3 py-2.5">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-noc-warning">
                    Anomalies
                  </dt>
                  <dd className="tabular mt-1 text-sm font-medium text-noc-warning">
                    {s.anomalyCount}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
