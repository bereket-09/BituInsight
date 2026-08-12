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

export default function ReportHistoryRow({ report, onDownload }) {
  const [expanded, setExpanded] = useState(false);
  const s = report.listSummary || {};
  const validationErrors = report.validation_errors || [];

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

        <FileSpreadsheet className="h-5 w-5 shrink-0 text-noc-accent" />

        <div className="min-w-[140px] flex-1">
          <p className="font-medium text-noc-text">{report.workflow_name}</p>
          <p className="truncate text-xs text-noc-muted">{report.original_filename || '—'}</p>
        </div>

        <StatusBadge status={report.status} />

        <div className="hidden text-xs text-noc-muted md:block">
          {s.timeSpan || '—'}
        </div>

        <div className="hidden text-xs text-noc-muted lg:block">
          {s.timeGranularity || '—'}
        </div>

        <div className="text-xs text-noc-muted">
          {new Date(report.created_at).toLocaleString()}
        </div>

        <Link
          to={`/reports/${report.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-secondary py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
      </div>

      {expanded && (
        <div className="border-t border-noc-border/40 bg-noc-surface/20 px-4 py-4 pl-12">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-noc-muted">
                Report summary
              </h4>
              {s.narrative ? (
                <p className="text-sm leading-relaxed text-noc-text">{s.narrative}</p>
              ) : (
                <p className="text-sm text-noc-muted">No summary available</p>
              )}
              {validationErrors.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-red-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: 'Time span', value: s.timeSpan },
                { label: 'Granularity', value: s.timeGranularity },
                { label: 'Total volume', value: s.totalVolume },
                { label: '4G share', value: s.contribution4g },
                { label: 'Peak period', value: s.peakPeriod },
                { label: 'Data points', value: s.dataPoints },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-noc-border bg-noc-card px-3 py-2"
                >
                  <p className="text-[10px] uppercase text-noc-muted">{item.label}</p>
                  <p className="mt-0.5 text-sm font-medium text-noc-text">{item.value || '—'}</p>
                </div>
              ))}
              {s.anomalyCount > 0 && (
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                  <p className="text-[10px] uppercase text-orange-400">Anomalies</p>
                  <p className="mt-0.5 text-sm font-medium text-orange-300">{s.anomalyCount}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/reports/${report.id}`} className="btn-primary text-xs">
              Full report view
            </Link>
            {report.status === 'completed' && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(report.id)}
                className="btn-secondary text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Download JSON
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
