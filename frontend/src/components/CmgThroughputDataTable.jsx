import clsx from 'clsx';
import { Calendar, Download, TrendingUp } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import SeriesDataTable from './SeriesDataTable';
import { buildCsvFilename, downloadCsv } from '../utils/csv';
import { formatSeriesValue } from '../utils/seriesSpans';

const ICON_STROKE = 1.75;

function formatGbps(value) {
  return formatSeriesValue(value, 'Gbps');
}

/**
 * The CMG data-point list: the generic series table configured for throughput,
 * plus the daily-peak digest, which answers a different question (when did each
 * day top out) and therefore stays its own table at its own granularity.
 *
 * `spanId`/`onSpanChange` are optional. Supplied, the page owns the granularity
 * and this table stays in step with the chart above it; omitted, the table keeps
 * its own selection and starts on the span the backend recommends.
 */
export default function CmgThroughputDataTable({
  timeSeries,
  filePrefix = 'cmg-throughput',
  spanId,
  onSpanChange,
  className,
}) {
  const chartTheme = useChartTheme();
  const { spanId: activeSpanId, setSpanId, activeOption } = useSpanState(timeSeries, {
    spanId,
    onSpanChange,
  });

  const dailyPeaks = timeSeries?.dailyPeaks || [];
  const viewPeak = timeSeries?.peaksByView?.[activeSpanId] || timeSeries?.peak;
  const spanName = activeOption?.name || activeSpanId;

  const handleDownloadDailyPeaks = () => {
    downloadCsv(
      buildCsvFilename([filePrefix, 'daily-peak-periods']),
      [
        'Day',
        'Peak period',
        'Timestamp (ISO 8601)',
        'MDC1 (Gbps)',
        'MDC2 (Gbps)',
        'Peak total (Gbps)',
      ],
      dailyPeaks.map((row) => [
        row.dayLabel,
        row.periodLabel,
        row.timestamp,
        row.mdc1,
        row.mdc2,
        row.total,
      ])
    );
  };

  if (!timeSeries?.series) return null;

  return (
    <div className={clsx('space-y-4', className)}>
      {viewPeak && (
        <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-noc-accent">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            {spanName} peak
          </span>
          <span className="tabular text-xs font-semibold text-noc-text">{viewPeak.label}</span>
          <span
            className="tabular font-mono text-xs"
            style={{ color: chartTheme.series.mdc1 }}
          >
            MDC1 {formatGbps(viewPeak.mdc1)}
          </span>
          <span
            className="tabular font-mono text-xs"
            style={{ color: chartTheme.series.mdc2 }}
          >
            MDC2 {formatGbps(viewPeak.mdc2)}
          </span>
          <span
            className="tabular font-mono text-xs font-semibold"
            style={{ color: chartTheme.series.total }}
          >
            Total {formatGbps(viewPeak.total)}
          </span>
        </div>
      )}

      <SeriesDataTable
        timeSeries={timeSeries}
        spanId={activeSpanId}
        onSpanChange={setSpanId}
        title="Throughput data points"
        unit="Gbps"
        valueLabel="Throughput"
        fileNameParts={[filePrefix, 'throughput-data-points']}
        highlightTimestamp={viewPeak?.timestamp}
        highlightLabel="Peak"
      />

      {dailyPeaks.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-noc-border px-5 py-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-noc-text">
                <Calendar className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
                Daily peak periods
              </h3>
              <p className="tabular mt-1 text-xs text-noc-muted">
                Highest 15-minute throughput within each calendar day · {dailyPeaks.length}{' '}
                {dailyPeaks.length === 1 ? 'day' : 'days'}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary shrink-0 px-3 py-2 text-xs"
              onClick={handleDownloadDailyPeaks}
              title="Export the daily peak periods as CSV"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-5 py-3 font-medium">Day</th>
                  <th className="px-5 py-3 font-medium">Peak period</th>
                  <th className="px-5 py-3 font-medium" style={{ color: chartTheme.series.mdc1 }}>
                    MDC1
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: chartTheme.series.mdc2 }}>
                    MDC2
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: chartTheme.series.total }}>
                    Peak total
                  </th>
                </tr>
              </thead>
              <tbody>
                {dailyPeaks.map((row) => (
                  <tr
                    key={row.dayKey}
                    className="border-b border-noc-border/40 transition-colors last:border-0 hover:bg-noc-accent/[0.04]"
                  >
                    <td className="px-5 py-2.5 font-medium text-noc-text">{row.dayLabel}</td>
                    <td className="px-5 py-2.5 text-xs text-noc-muted">{row.periodLabel}</td>
                    <td
                      className="px-5 py-2.5 font-mono text-xs"
                      style={{ color: chartTheme.series.mdc1 }}
                    >
                      {formatGbps(row.mdc1)}
                    </td>
                    <td
                      className="px-5 py-2.5 font-mono text-xs"
                      style={{ color: chartTheme.series.mdc2 }}
                    >
                      {formatGbps(row.mdc2)}
                    </td>
                    <td
                      className="px-5 py-2.5 font-mono text-xs font-semibold"
                      style={{ color: chartTheme.series.total }}
                    >
                      {formatGbps(row.total)}
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
