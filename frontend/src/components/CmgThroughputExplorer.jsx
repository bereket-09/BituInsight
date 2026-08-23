import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import clsx from 'clsx';
import { Maximize2, TrendingUp } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import ChartFullscreenModal from './ChartFullscreenModal';
import CmgThroughputInsight from './CmgThroughputInsight';
import GranularityControl from './GranularityControl';

function formatGbps(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} Tbps`;
  return `${n.toFixed(2)} Gbps`;
}

function ThroughputTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2.5 shadow-xl backdrop-blur"
      style={{ backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder }}
    >
      <p className="mb-2 text-xs font-semibold text-noc-text">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-noc-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-mono font-medium text-noc-text">{formatGbps(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ThroughputChart({ chartData, chartMode, visible, chartTheme, series, height = 380 }) {
  const axisProps = {
    dataKey: 'name',
    tick: { fill: chartTheme.axis, fontSize: 9 },
    interval: 'preserveStartEnd',
  };

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={chartMode !== 'line'} />
      <XAxis {...axisProps} />
      <YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} tickFormatter={formatGbps} width={52} />
      <Tooltip content={<ThroughputTooltip theme={chartTheme} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Brush dataKey="name" height={24} stroke={chartTheme.brushStroke} />
    </>
  );

  if (chartMode === 'stacked') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            {common}
            {visible.mdc1 && (
              <Area
                type="monotone"
                dataKey="mdc1"
                name="MDC1"
                stackId="1"
                stroke={series[0].color}
                fill={series[0].color}
                fillOpacity={0.45}
                strokeWidth={2}
              />
            )}
            {visible.mdc2 && (
              <Area
                type="monotone"
                dataKey="mdc2"
                name="MDC2"
                stackId="1"
                stroke={series[1].color}
                fill={series[1].color}
                fillOpacity={0.45}
                strokeWidth={2}
              />
            )}
            {visible.total && (
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke={series[2].color}
                dot={false}
                strokeWidth={2.5}
                strokeDasharray="6 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          {common}
          {visible.mdc1 && (
            <Line type="monotone" dataKey="mdc1" name="MDC1" stroke={series[0].color} dot={false} strokeWidth={2} />
          )}
          {visible.mdc2 && (
            <Line type="monotone" dataKey="mdc2" name="MDC2" stroke={series[1].color} dot={false} strokeWidth={2} />
          )}
          {visible.total && (
            <Line type="monotone" dataKey="total" name="Total" stroke={series[2].color} dot={false} strokeWidth={2.5} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CmgThroughputExplorer({
  timeSeries,
  summary = {},
  calculated = {},
  spanId,
  onSpanChange,
  className,
}) {
  const chartTheme = useChartTheme();
  const detected = timeSeries?.detected || {};

  // Granularity is shared with the data table when the page passes it down, so a
  // chart and the rows beneath it can never disagree about what is being shown.
  const {
    options: spanOptions,
    spanId: activeSpanId,
    setSpanId,
    series: rawSeries,
    activeOption,
  } = useSpanState(timeSeries, { spanId, onSpanChange });

  const [chartMode, setChartMode] = useState('stacked');
  const [visible, setVisible] = useState({ mdc1: true, mdc2: true, total: false });
  const [fullscreen, setFullscreen] = useState(false);

  const viewPeak = timeSeries?.peaksByView?.[activeSpanId] || timeSeries?.peak;
  const spanName = activeOption?.name || activeSpanId;

  const chartData = useMemo(
    () =>
      rawSeries.map((p) => ({
        name: p.label,
        timestamp: p.timestamp,
        mdc1: p.mdc1 ?? 0,
        mdc2: p.mdc2 ?? 0,
        total: p.total ?? p.value ?? (p.mdc1 ?? 0) + (p.mdc2 ?? 0),
      })),
    [rawSeries]
  );

  const series = [
    { key: 'mdc1', label: 'MDC1', color: chartTheme.series.mdc1 },
    { key: 'mdc2', label: 'MDC2', color: chartTheme.series.mdc2 },
    { key: 'total', label: 'Total', color: chartTheme.series.total },
  ];

  const hasSeriesVisible = visible.mdc1 || visible.mdc2 || visible.total;

  const peakBanner = viewPeak && (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-noc-border/60 bg-noc-accent/5 px-3 py-2.5 text-xs">
      <span className="flex items-center gap-1.5 font-medium text-noc-accent">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />
        {spanName} peak
      </span>
      <span className="tabular text-noc-muted">{viewPeak.label}</span>
      <span className="tabular font-mono" style={{ color: chartTheme.series.mdc1 }}>
        MDC1 {formatGbps(viewPeak.mdc1)}
      </span>
      <span className="tabular font-mono" style={{ color: chartTheme.series.mdc2 }}>
        MDC2 {formatGbps(viewPeak.mdc2)}
      </span>
      <span className="tabular font-mono font-semibold" style={{ color: chartTheme.series.total }}>
        Total {formatGbps(viewPeak.total)}
      </span>
    </div>
  );

  const chartControls = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <GranularityControl
          options={spanOptions}
          value={activeSpanId}
          onChange={setSpanId}
          label="Granularity"
        />
        <div className="flex rounded-lg border border-noc-border p-0.5">
          {['stacked', 'line'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setChartMode(mode)}
              className={clsx(
                'rounded-md px-2.5 py-1.5 text-xs capitalize',
                chartMode === mode ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted'
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {series.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={visible[s.key]}
              onChange={(e) => setVisible((v) => ({ ...v, [s.key]: e.target.checked }))}
              className="rounded border-noc-border"
            />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
            {s.key === 'total' && chartMode === 'stacked' && (
              <span className="text-[10px] text-noc-muted">(overlay)</span>
            )}
          </label>
        ))}
      </div>
    </>
  );

  if (!timeSeries) {
    return <div className="card text-sm text-noc-muted">No throughput time-series for this report.</div>;
  }

  return (
    <div className={clsx('card space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Throughput timeline</h3>
          <CmgThroughputInsight
            summary={summary}
            calculated={calculated}
            variant="compact"
            className="mt-1.5"
          />
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 py-1.5 text-xs"
          onClick={() => setFullscreen(true)}
          title="Fullscreen with filters"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {chartControls}
      {peakBanner}

      {!hasSeriesVisible ? (
        <p className="py-8 text-center text-sm text-noc-muted">
          Select at least one series (MDC1, MDC2, or Total) to display the chart.
        </p>
      ) : (
        <ThroughputChart
          chartData={chartData}
          chartMode={chartMode}
          visible={visible}
          chartTheme={chartTheme}
          series={series}
        />
      )}

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={`CMG throughput — ${detected.spanLabel || ''}`}
      >
        <div className="space-y-4">
          {chartControls}
          {peakBanner}
          {!hasSeriesVisible ? (
            <p className="py-16 text-center text-sm text-noc-muted">
              Select at least one series to display the chart.
            </p>
          ) : (
            <ThroughputChart
              chartData={chartData}
              chartMode={chartMode}
              visible={visible}
              chartTheme={chartTheme}
              series={series}
              height={520}
            />
          )}
        </div>
      </ChartFullscreenModal>
    </div>
  );
}
