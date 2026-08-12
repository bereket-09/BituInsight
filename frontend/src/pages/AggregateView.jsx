import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Layers } from 'lucide-react';
import { reportApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import TrafficVolumeExplorer from '../components/TrafficVolumeExplorer';

export default function AggregateView() {
  const { workflowSlug } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aggregate', workflowSlug],
    queryFn: () => reportApi.aggregate(workflowSlug).then((r) => r.data),
    enabled: !!workflowSlug,
  });

  if (isLoading) return <LoadingSpinner label="Combining KPI reports..." />;
  if (error) return <div className="text-red-400">Failed to load aggregate view</div>;

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

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/reports"
          className="mb-3 inline-flex items-center gap-1 text-xs text-noc-muted hover:text-noc-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back to history
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="h-7 w-7 text-noc-accent" />
          Combined KPI: {data?.workflowName || workflowSlug}
        </h1>
        <p className="mt-1 text-sm text-noc-muted">{data?.narrative}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs text-noc-muted">Reports combined</p>
          <p className="text-2xl font-bold">{data?.reportCount ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs text-noc-muted">Time-series points</p>
          <p className="text-2xl font-bold">{data?.combinedMetrics?.totalDataPoints ?? 0}</p>
        </div>
        {data?.combinedMetrics?.avgContribution4gPct != null && (
          <div className="card">
            <p className="text-xs text-noc-muted">Avg 4G share</p>
            <p className="text-2xl font-bold">
              {data.combinedMetrics.avgContribution4gPct.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {syntheticTimeSeries ? (
        <TrafficVolumeExplorer timeSeries={syntheticTimeSeries} />
      ) : (
        <div className="card text-noc-muted">No time-series data to combine yet.</div>
      )}

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold">Source reports</h3>
        <ul className="space-y-2">
          {data?.sourceReports?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-noc-muted">{r.filename}</span>
              <span className="text-xs text-noc-muted">
                {r.span} · {r.pointCount} pts
              </span>
              <Link to={`/reports/${r.id}`} className="text-noc-accent hover:underline">
                View
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
