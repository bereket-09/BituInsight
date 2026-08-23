import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import clsx from 'clsx';
import { Filter, Maximize2 } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import ChartFullscreenModal from './ChartFullscreenModal';
import GranularityControl from './GranularityControl';

function formatValue(v, valueType) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (valueType === 'percent') return `${n.toFixed(2)}%`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function MetricTooltip({ active, payload, label, valueType, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2.5 shadow-xl backdrop-blur"
      style={{ backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder }}
    >
      <p className="mb-2 text-xs font-semibold text-noc-text">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 text-xs">
          <span className="text-noc-muted">{entry.name}</span>
          <span className="font-mono font-medium text-noc-text">
            {formatValue(entry.value, valueType)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MetricExplorer({
  timeSeries,
  kpiName,
  valueType = 'percent',
  threshold = 99,
  spanId,
  onSpanChange,
}) {
  const targetThreshold = valueType === 'percent' ? Number(threshold) || 99 : null;
  const chartTheme = useChartTheme();
  const [chartMode, setChartMode] = useState('area');
  const [spanFilter, setSpanFilter] = useState('all');
  const [fullscreen, setFullscreen] = useState(false);

  // A percentage cannot be summed into an hour or a day, so its coarser views are
  // means over the raw points rather than the backend's summed buckets.
  const {
    options: spanOptions,
    spanId: activeSpanId,
    setSpanId,
    series: activeSeries,
    activeOption,
  } = useSpanState(timeSeries, {
    spanId,
    onSpanChange,
  });

  const detected = timeSeries?.detected || {};

  const chartData = useMemo(() => {
    let data = activeSeries.map((p) => ({
      label: p.label,
      value: p.value ?? p.total ?? 0,
      timestamp: p.timestamp,
    }));
    if (spanFilter === 'last24' && data.length > 96) data = data.slice(-96);
    if (spanFilter === 'last7d' && data.length > 672) data = data.slice(-672);
    return data;
  }, [activeSeries, spanFilter]);

  const avg =
    chartData.length > 0
      ? chartData.reduce((s, d) => s + d.value, 0) / chartData.length
      : 0;

  const chartBody = (
    <div style={{ height: 360 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartMode === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.series.total} stopOpacity={0.35} />
                <stop offset="100%" stopColor={chartTheme.series.total} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} domain={valueType === 'percent' ? [0, 100] : ['auto', 'auto']} />
            <Tooltip content={<MetricTooltip valueType={valueType} theme={chartTheme} />} />
            <Legend />
            {targetThreshold != null && (
              <ReferenceLine
                y={targetThreshold}
                stroke="#FF6B35"
                strokeDasharray="4 4"
                label={{ value: `${targetThreshold}%`, fill: '#FF6B35', fontSize: 10 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              name={kpiName || 'KPI'}
              stroke={chartTheme.series.total}
              fill="url(#metricGrad)"
              strokeWidth={2}
            />
            <Brush dataKey="label" height={24} stroke={chartTheme.series.total} />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} domain={valueType === 'percent' ? [0, 100] : ['auto', 'auto']} />
            <Tooltip content={<MetricTooltip valueType={valueType} theme={chartTheme} />} />
            <Legend />
            {targetThreshold != null && (
              <ReferenceLine y={targetThreshold} stroke="#FF6B35" strokeDasharray="4 4" />
            )}
            <ReferenceLine y={avg} stroke={chartTheme.muted} strokeDasharray="2 6" label={{ value: 'avg', fill: chartTheme.muted, fontSize: 9 }} />
            <Line
              type="monotone"
              dataKey="value"
              name={kpiName || 'KPI'}
              stroke={chartTheme.series.total}
              dot={false}
              strokeWidth={2}
            />
            <Brush dataKey="label" height={24} stroke={chartTheme.series.total} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{kpiName || 'KPI trend'}</h3>
          <p className="tabular text-xs text-noc-muted">
            {detected.spanLabel} · {activeOption?.name || detected.label}
            {activeOption?.computed && ' (averaged)'} · {chartData.length} points
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-noc-border p-0.5">
            {['area', 'line'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartMode(mode)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs capitalize',
                  chartMode === mode ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-noc-border px-2 py-1">
            <Filter className="h-3 w-3 text-noc-muted" />
            <select
              value={spanFilter}
              onChange={(e) => setSpanFilter(e.target.value)}
              className="bg-transparent text-xs text-noc-text outline-none"
            >
              <option value="all">All data</option>
              <option value="last24">Last ~24h</option>
              <option value="last7d">Last ~7d</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="rounded-lg border border-noc-border p-2 text-noc-muted hover:text-noc-accent"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <GranularityControl options={spanOptions} value={activeSpanId} onChange={setSpanId} />
      {chartBody}
      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={kpiName}
      >
        <div style={{ height: '70vh' }}>{chartBody}</div>
      </ChartFullscreenModal>
    </div>
  );
}
