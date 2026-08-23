import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { CalendarRange, Download, X } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import GranularityControl from './GranularityControl';
import { buildCsvFilename, downloadCsv } from '../utils/csv';
import {
  deriveSeriesColumns,
  filterSeriesByDate,
  formatSeriesValue,
  readCell,
  seriesDateBounds,
} from '../utils/seriesSpans';

const ICON_STROKE = 1.75;

/**
 * The data-point list under a report: every period the KPI was measured over, at
 * the granularity the reader picks, narrowed to a date range, and exportable.
 *
 * The rows come from the views the backend already built, so the table and the
 * chart above it are looking at the same numbers. The CSV carries what is on
 * screen — same span, same filter — plus the ISO timestamp, which the human
 * period label alone cannot be sorted or re-parsed by.
 */
export default function SeriesDataTable({
  timeSeries,
  aggregate = 'sum',
  spanId,
  onSpanChange,
  title = 'Data points',
  description,
  unit,
  valueLabel = 'Value',
  percentOnly = false,
  fileNameParts = ['data-points'],
  highlightTimestamp,
  highlightLabel = 'Peak',
  className,
}) {
  const chartTheme = useChartTheme();
  const { options, spanId: activeSpanId, setSpanId, series, activeOption } = useSpanState(
    timeSeries,
    { aggregate, spanId, onSpanChange }
  );

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const bounds = useMemo(() => seriesDateBounds(series), [series]);
  const columns = useMemo(
    () =>
      deriveSeriesColumns(series, {
        colors: timeSeries?.colors,
        unit,
        valueLabel,
        percentOnly,
      }),
    [series, timeSeries?.colors, unit, valueLabel, percentOnly]
  );

  const rows = useMemo(
    () => filterSeriesByDate(series, fromDate, toDate),
    [series, fromDate, toDate]
  );

  if (!series.length || !columns.length) return null;

  const filtered = Boolean(fromDate || toDate);
  const spanName = activeOption?.name || activeSpanId;
  const clearRange = () => {
    setFromDate('');
    setToDate('');
  };

  // Theme-aware series colour where we have one, otherwise the colour the report
  // itself carries — the same values the server-rendered PNG exports use.
  const columnColor = (column) =>
    column.colorKey
      ? chartTheme.series[column.colorKey] || timeSeries?.colors?.[column.colorKey]?.line
      : undefined;

  const handleExport = () => {
    const headers = [
      'Timestamp (ISO 8601)',
      'Period',
      ...columns.map((column) => (column.unit ? `${column.label} (${column.unit})` : column.label)),
    ];
    const body = rows.map((row) => [
      row.timestamp ?? '',
      row.label ?? '',
      // Raw numbers, not the formatted display strings: a spreadsheet should get
      // something it can sum.
      ...columns.map((column) => {
        const value = readCell(row, column);
        return Number.isFinite(Number(value)) ? Number(value) : '';
      }),
    ]);
    downloadCsv(buildCsvFilename([...fileNameParts, spanName]), headers, body);
  };

  return (
    <div className={clsx('card overflow-hidden p-0', className)}>
      <div className="space-y-4 border-b border-noc-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-noc-text">{title}</h3>
            <p className="tabular mt-1 text-xs text-noc-muted">
              {spanName}
              {activeOption?.computed && ' (averaged)'} ·{' '}
              {filtered ? `${rows.length} of ${series.length} rows` : `${series.length} rows`}
              {description ? ` · ${description}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 px-3 py-2 text-xs"
            onClick={handleExport}
            disabled={rows.length === 0}
            title="Export the rows shown, at this granularity, as CSV"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <GranularityControl
            options={options}
            value={activeSpanId}
            onChange={setSpanId}
            size="sm"
          />

          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
              <CalendarRange className="h-3 w-3" strokeWidth={ICON_STROKE} />
              Date range
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={fromDate}
                min={bounds.min}
                max={toDate || bounds.max}
                onChange={(event) => setFromDate(event.target.value)}
                className="input-field w-auto px-2.5 py-1.5 text-xs"
              />
              <span className="text-xs text-noc-muted">to</span>
              <input
                type="date"
                aria-label="To date"
                value={toDate}
                min={fromDate || bounds.min}
                max={bounds.max}
                onChange={(event) => setToDate(event.target.value)}
                className="input-field w-auto px-2.5 py-1.5 text-xs"
              />
              {filtered && (
                <button
                  type="button"
                  onClick={clearRange}
                  className="inline-flex items-center gap-1 rounded-lg border border-noc-border px-2 py-1.5 text-xs font-medium text-noc-muted transition-colors hover:border-noc-accent/40 hover:text-noc-accent"
                >
                  <X className="h-3 w-3" strokeWidth={ICON_STROKE} />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium text-noc-text">No data points in this range</p>
          <p className="mt-1 text-xs text-noc-muted">
            The {spanName.toLowerCase()} view covers {bounds.min} to {bounds.max}.
          </p>
          <button type="button" onClick={clearRange} className="btn-secondary mt-4 text-xs">
            <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            Clear the date range
          </button>
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 z-10 bg-noc-card">
              <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                <th className="px-5 py-3 font-medium">Period</th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="px-5 py-3 font-medium"
                    style={{ color: columnColor(column) }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isHighlight =
                  highlightTimestamp && row.timestamp === highlightTimestamp;
                return (
                  <tr
                    key={row.timestamp || row.bucketKey || row.label}
                    className={clsx(
                      'border-b border-noc-border/40 transition-colors last:border-0',
                      isHighlight ? 'bg-noc-accent/[0.07]' : 'hover:bg-noc-accent/[0.04]'
                    )}
                  >
                    <td className="px-5 py-2.5 font-medium text-noc-text">
                      {row.label}
                      {isHighlight && (
                        <span className="badge badge-success ml-2">{highlightLabel}</span>
                      )}
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={clsx(
                          'px-5 py-2.5 font-mono text-xs',
                          column.kind === 'total' ? 'font-semibold text-noc-text' : 'text-noc-textDim'
                        )}
                        style={{ color: columnColor(column) }}
                      >
                        {formatSeriesValue(readCell(row, column), column.unit)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
