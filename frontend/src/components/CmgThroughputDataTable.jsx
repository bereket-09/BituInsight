import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { TrendingUp, Calendar, Download } from 'lucide-react';
import { downloadBlob } from '../utils/downloadBlob';

function formatGbps(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)} Gbps`;
}

const VIEW_LABELS = {
  native: '15-minute',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
};

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n');

  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

function safeFilenamePart(value) {
  return String(value || 'table')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export default function CmgThroughputDataTable({ timeSeries, filePrefix = 'cmg-throughput', className }) {
  const spans = timeSeries?.availableSpans;
  const [spanId, setSpanId] = useState(spans?.auto || 'native');

  const activeSeries = useMemo(() => {
    if (!timeSeries?.series) return [];
    const map = {
      native: timeSeries.series.native,
      hourly: timeSeries.series.hourly,
      daily: timeSeries.series.daily,
      weekly: timeSeries.series.weekly,
    };
    return map[spanId] || timeSeries.series.primary || [];
  }, [timeSeries, spanId]);

  const viewPeak = timeSeries?.peaksByView?.[spanId] || timeSeries?.peak;
  const dailyPeaks = timeSeries?.dailyPeaks || [];
  const showDailyPeaks = dailyPeaks.length > 0;
  const filenamePrefix = safeFilenamePart(filePrefix);

  const handleDownloadThroughputTable = () => {
    downloadCsv(
      `${filenamePrefix}_${safeFilenamePart(spanId)}_throughput_data_table.csv`,
      ['Period', 'Timestamp', 'MDC1 Gbps', 'MDC2 Gbps', 'Total Gbps', 'MDC1 %'],
      activeSeries.map((row) => [
        row.label,
        row.timestamp,
        row.mdc1,
        row.mdc2,
        row.total,
        row.mdc1SharePct ?? '',
      ])
    );
  };

  const handleDownloadDailyPeaks = () => {
    downloadCsv(
      `${filenamePrefix}_daily_peak_periods.csv`,
      ['Day', 'Peak period', 'Timestamp', 'MDC1 Gbps', 'MDC2 Gbps', 'Peak total Gbps'],
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

  if (!activeSeries.length) return null;

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-noc-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Throughput data table</h3>
            <p className="text-xs text-noc-muted">
              View: {VIEW_LABELS[spanId] || spanId} · {activeSeries.length} rows
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={spanId}
              onChange={(e) => setSpanId(e.target.value)}
              className="input-field w-auto min-w-[180px] text-sm"
            >
              {spans?.options?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                  {opt.id === spans?.auto ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={handleDownloadThroughputTable}
              title="Download this throughput table as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        </div>

        {viewPeak && (
          <div className="flex flex-wrap items-center gap-4 border-b border-noc-border/60 bg-noc-accent/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-noc-accent">
              <TrendingUp className="h-4 w-4" />
              Peak for {VIEW_LABELS[spanId] || spanId} view
            </div>
            <span className="text-xs text-noc-muted">
              <strong className="text-noc-text">{viewPeak.label}</strong>
            </span>
            <span className="font-mono text-xs text-[#3B9EFF]">MDC1 {formatGbps(viewPeak.mdc1)}</span>
            <span className="font-mono text-xs text-[#FF6B35]">MDC2 {formatGbps(viewPeak.mdc2)}</span>
            <span className="font-mono text-xs font-semibold text-[#4ADE80]">
              Total {formatGbps(viewPeak.total)}
            </span>
          </div>
        )}

        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-noc-card">
              <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5 text-[#3B9EFF]">MDC1</th>
                <th className="px-4 py-2.5 text-[#FF6B35]">MDC2</th>
                <th className="px-4 py-2.5 text-[#4ADE80]">Total</th>
                <th className="px-4 py-2.5">MDC1 %</th>
              </tr>
            </thead>
            <tbody>
              {activeSeries.map((row) => {
                const isPeak =
                  viewPeak?.timestamp && row.timestamp === viewPeak.timestamp;
                return (
                  <tr
                    key={row.timestamp || row.label}
                    className={clsx(
                      'border-b border-noc-border/30',
                      isPeak && 'bg-noc-accent/10'
                    )}
                  >
                    <td className="px-4 py-2 font-medium">
                      {row.label}
                      {isPeak && (
                        <span className="ml-2 rounded bg-noc-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-noc-accent">
                          PEAK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-[#3B9EFF]">
                      {formatGbps(row.mdc1)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[#FF6B35]">
                      {formatGbps(row.mdc2)}
                    </td>
                    <td className="px-4 py-2 font-mono font-medium text-[#4ADE80]">
                      {formatGbps(row.total)}
                    </td>
                    <td className="px-4 py-2 font-mono text-noc-muted">
                      {row.mdc1SharePct ?? '—'}
                      {row.mdc1SharePct != null ? '%' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showDailyPeaks && dailyPeaks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-noc-border px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-noc-accent" />
                  <h3 className="text-sm font-semibold">Daily peak periods</h3>
                </div>
                <p className="mt-1 text-xs text-noc-muted">
                  Highest 15-minute throughput within each calendar day ({dailyPeaks.length}{' '}
                  {dailyPeaks.length === 1 ? 'day' : 'days'})
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={handleDownloadDailyPeaks}
                title="Download daily peak periods as CSV"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
                  <th className="px-4 py-2.5">Day</th>
                  <th className="px-4 py-2.5">Peak period</th>
                  <th className="px-4 py-2.5 text-[#3B9EFF]">MDC1</th>
                  <th className="px-4 py-2.5 text-[#FF6B35]">MDC2</th>
                  <th className="px-4 py-2.5 text-[#4ADE80]">Peak total</th>
                </tr>
              </thead>
              <tbody>
                {dailyPeaks.map((row) => (
                  <tr key={row.dayKey} className="border-b border-noc-border/30">
                    <td className="px-4 py-2 font-medium">{row.dayLabel}</td>
                    <td className="px-4 py-2 text-noc-muted">{row.periodLabel}</td>
                    <td className="px-4 py-2 font-mono text-[#3B9EFF]">
                      {formatGbps(row.mdc1)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[#FF6B35]">
                      {formatGbps(row.mdc2)}
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-[#4ADE80]">
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
