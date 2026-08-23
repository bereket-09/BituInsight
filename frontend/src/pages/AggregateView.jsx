import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, LineChart, ExternalLink } from 'lucide-react';
import { reportApi } from '../api';
import TrafficVolumeExplorer from '../components/TrafficVolumeExplorer';

const ICON_STROKE = 1.75;

function AggregateSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="skeleton h-2.5 w-28" />
        <div className="skeleton h-9 w-80 max-w-full" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="skeleton h-32 rounded-2xl lg:col-span-5" />
        <div className="skeleton h-32 rounded-2xl lg:col-span-4" />
        <div className="skeleton h-32 rounded-2xl lg:col-span-3" />
      </div>
      <div className="skeleton h-80 w-full rounded-2xl" />
    </div>
  );
}

/* Primary figure first and largest; the rest are supporting reference numbers. */
function Metric({ label, value, hint, primary = false }) {
  return (
    <div className="card stat-glow">
      <p className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">{label}</p>
      <p
        className={
          primary
            ? 'tabular mt-3 text-display-lg text-noc-text'
            : 'tabular mt-3 text-[1.75rem] font-semibold leading-none tracking-tight text-noc-text'
        }
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-noc-muted">{hint}</p>}
    </div>
  );
}

export default function AggregateView() {
  const { workflowSlug } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aggregate', workflowSlug],
    queryFn: () => reportApi.aggregate(workflowSlug).then((r) => r.data),
    enabled: !!workflowSlug,
  });

  if (isLoading) return <AggregateSkeleton />;

  if (error) {
    return (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-noc-danger/30 bg-noc-danger/10 text-noc-danger">
          <AlertTriangle className="h-5 w-5" strokeWidth={ICON_STROKE} />
        </span>
        <p className="mt-4 text-sm font-medium text-noc-text">Combined view could not be loaded</p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">
          The reports for this workflow could not be merged right now.
        </p>
        <Link to="/reports" className="btn-secondary mt-5 px-3 py-2 text-xs">
          Back to history
        </Link>
      </div>
    );
  }

  const syntheticTimeSeries = data?.combinedTimeSeries?.length
    ? {
        detected: {
          label: 'Combined',
          spanLabel: data.combinedMetrics?.span?.start
            ? `${new Date(data.combinedMetrics.span.start).toLocaleDateString()} – ${new Date(data.combinedMetrics.span.end).toLocaleDateString()}`
            : 'All uploaded periods',
          pointCount: data.combinedTimeSeries.length,
        },
        series: {
          primary: data.combinedTimeSeries,
          native: data.combinedTimeSeries,
          daily: data.combinedTimeSeries,
          hourly: [],
          weekly: [],
          monthly: [],
        },
        availableSpans: {
          auto: 'native',
          options: [
            {
              id: 'native',
              label: `Combined (${data.combinedTimeSeries.length} points)`,
              pointCount: data.combinedTimeSeries.length,
            },
          ],
        },
      }
    : null;

  const reportCount = data?.reportCount ?? 0;
  const sourceReports = data?.sourceReports ?? [];
  const avg4g = data?.combinedMetrics?.avgContribution4gPct;

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Back to history
        </Link>
        <p className="eyebrow mt-4">Combined KPI</p>
        <h1 className="mt-2 text-display-md text-noc-text">{data?.workflowName || workflowSlug}</h1>
        {data?.narrative && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-noc-textDim">
            {data.narrative}
          </p>
        )}
      </header>

      {/* Deliberately uneven: the count of merged reports is the fact that frames
          everything else on the page, so it gets the widest cell and the display size. */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Metric
            label="Reports combined"
            value={reportCount}
            hint={reportCount === 1 ? 'Single source report' : 'Merged into one series'}
            primary
          />
        </div>
        <div className={avg4g != null ? 'lg:col-span-4' : 'lg:col-span-7'}>
          <Metric
            label="Time-series points"
            value={data?.combinedMetrics?.totalDataPoints ?? 0}
            hint="Across all merged periods"
          />
        </div>
        {avg4g != null && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Metric label="Avg 4G share" value={`${avg4g.toFixed(1)}%`} hint="Mean across reports" />
          </div>
        )}
      </div>

      {syntheticTimeSeries ? (
        <TrafficVolumeExplorer timeSeries={syntheticTimeSeries} />
      ) : (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-noc-border bg-noc-bg text-noc-muted">
            <LineChart className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </span>
          <p className="mt-4 text-sm font-medium text-noc-text">Nothing to combine yet</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">
            At least one completed report with a time series is needed before a combined chart can
            be drawn.
          </p>
          <Link to="/upload" className="btn-secondary mt-5 px-3 py-2 text-xs">
            Upload a report
          </Link>
        </div>
      )}

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-noc-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-noc-text">Source reports</h2>
          <span className="tabular text-xs text-noc-muted">{sourceReports.length}</span>
        </div>

        {sourceReports.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-noc-muted">
            No source reports are linked to this workflow yet.
          </p>
        ) : (
          <ul>
            {sourceReports.map((r) => (
              <li key={r.id} className="border-b border-noc-border/60 last:border-0">
                <Link
                  to={`/reports/${r.id}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-noc-accent/5 active:translate-y-px sm:grid-cols-[minmax(0,1fr)_10rem_5rem_auto]"
                >
                  <span className="truncate font-mono text-xs text-noc-text transition-colors group-hover:text-noc-accent">
                    {r.filename}
                  </span>
                  <span className="tabular hidden text-right text-xs text-noc-muted sm:block">
                    {r.span}
                  </span>
                  <span className="tabular hidden text-right text-xs text-noc-muted sm:block">
                    {r.pointCount} pts
                  </span>
                  <ExternalLink
                    className="h-3.5 w-3.5 text-noc-muted transition-colors group-hover:text-noc-accent"
                    strokeWidth={ICON_STROKE}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
