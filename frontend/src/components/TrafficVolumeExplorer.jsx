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
import { Calendar, Layers, Maximize2 } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import { useTheme } from '../context/ThemeContext';
import ChartFullscreenModal from './ChartFullscreenModal';
import GranularityControl from './GranularityControl';

function formatVol(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

function VolumeTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2.5 shadow-xl backdrop-blur"
      style={{
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
      }}
    >
      <p className="mb-2 text-xs font-semibold text-noc-text">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-noc-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-mono font-medium text-noc-text">{formatVol(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function VolumeChart({
  chartData,
  chartMode,
  visible,
  chartTheme,
  isDark,
  height = 380,
  gradientPrefix = '',
}) {
  const series = [
    { key: 'volume2g3g', label: '2G+3G', color: chartTheme.series.volume2g3g },
    { key: 'volume4g', label: '4G', color: chartTheme.series.volume4g },
    { key: 'total', label: 'Total', color: chartTheme.series.total },
  ];

  const avgTotal =
    chartData.length > 0 ? chartData.reduce((s, d) => s + d.total, 0) / chartData.length : 0;

  const tickStyle = { fill: chartTheme.axis, fontSize: 10 };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartMode === 'stacked' ? (
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              {series
                .filter((s) => s.key !== 'total')
                .map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`${gradientPrefix}grad-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis
              tick={tickStyle}
              tickFormatter={formatVol}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<VolumeTooltip theme={chartTheme} />} />
            <Legend wrapperStyle={{ fontSize: 11, color: chartTheme.axis }} />
            {visible.volume2g3g && (
              <Area
                type="monotone"
                dataKey="volume2g3g"
                name="2G+3G"
                stackId="1"
                stroke={series[0].color}
                fill={`url(#${gradientPrefix}grad-volume2g3g)`}
                strokeWidth={2}
              />
            )}
            {visible.volume4g && (
              <Area
                type="monotone"
                dataKey="volume4g"
                name="4G"
                stackId="1"
                stroke={series[1].color}
                fill={`url(#${gradientPrefix}grad-volume4g)`}
                strokeWidth={2}
              />
            )}
            <ReferenceLine
              y={avgTotal}
              stroke={chartTheme.series.total}
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />
            {chartData.length > 6 && (
              <Brush
                dataKey="name"
                height={28}
                stroke={chartTheme.brushStroke}
                fill={chartTheme.brushFill}
                travellerWidth={8}
              />
            )}
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis
              tick={tickStyle}
              tickFormatter={formatVol}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<VolumeTooltip theme={chartTheme} />} />
            <Legend wrapperStyle={{ fontSize: 11, color: chartTheme.axis }} />
            {series.map(
              (s) =>
                visible[s.key] && (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.key === 'total' ? 2.5 : 2}
                    dot={{
                      r: chartData.length <= 14 ? 4 : 2,
                      fill: s.color,
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 6,
                      stroke: isDark ? '#0d1117' : '#fff',
                      strokeWidth: 2,
                    }}
                  />
                )
            )}
            {chartData.length > 6 && (
              <Brush
                dataKey="name"
                height={28}
                stroke={chartTheme.brushStroke}
                fill={chartTheme.brushFill}
                travellerWidth={8}
              />
            )}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function TrafficVolumeExplorer({
  timeSeries,
  spanId,
  onSpanChange,
  className,
}) {
  const chartTheme = useChartTheme();
  const { isDark } = useTheme();
  const detected = timeSeries?.detected;

  // Shared with the data table below when the page owns the selection.
  const {
    options: spanOptions,
    spanId: activeSpanId,
    setSpanId,
    series: rawSeries,
  } = useSpanState(timeSeries, { spanId, onSpanChange });

  const [chartMode, setChartMode] = useState('line');
  const [visible, setVisible] = useState({ volume2g3g: true, volume4g: true, total: true });
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  const seriesColors = [
    { key: 'volume2g3g', label: '2G+3G', color: chartTheme.series.volume2g3g },
    { key: 'volume4g', label: '4G', color: chartTheme.series.volume4g },
    { key: 'total', label: 'Total', color: chartTheme.series.total },
  ];

  const chartData = useMemo(() => {
    let data = rawSeries.map((p) => ({
      name: p.label,
      timestamp: p.timestamp,
      volume2g3g: p.volume2g3g,
      volume4g: p.volume4g,
      total: p.total,
    }));
    if (rangeStart) {
      const i = data.findIndex((d) => d.timestamp >= rangeStart);
      if (i >= 0) data = data.slice(i);
    }
    if (rangeEnd) {
      const i = data.findIndex((d) => d.timestamp > rangeEnd);
      data = i >= 0 ? data.slice(0, i) : data;
    }
    return data;
  }, [rawSeries, rangeStart, rangeEnd]);

  if (!timeSeries) {
    return <div className="card text-sm text-noc-muted">No time-series data for this report.</div>;
  }

  const controls = (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <GranularityControl
          options={spanOptions}
          value={activeSpanId}
          onChange={(next) => {
            setSpanId(next);
            // The period pickers list this span's own points, so a leftover
            // selection from another span would silently filter everything out.
            setRangeStart('');
            setRangeEnd('');
          }}
          label="Granularity"
        />
        <div className="min-w-[140px]">
          <label className="mb-1 text-[10px] font-medium uppercase tracking-wider text-noc-muted">
            From
          </label>
          <select
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="input-field text-sm"
          >
            <option value="">Start</option>
            {rawSeries.map((p) => (
              <option key={p.timestamp} value={p.timestamp}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 text-[10px] font-medium uppercase tracking-wider text-noc-muted">
            To
          </label>
          <select
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="input-field text-sm"
          >
            <option value="">End</option>
            {rawSeries.map((p) => (
              <option key={p.timestamp} value={p.timestamp}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {seriesColors.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))}
            className={clsx(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
              visible[s.key]
                ? 'border-transparent'
                : 'border-noc-border bg-noc-surface text-noc-muted opacity-60'
            )}
            style={
              visible[s.key]
                ? { backgroundColor: `${s.color}22`, borderColor: s.color, color: s.color }
                : undefined
            }
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <div className={clsx('card space-y-5 border-noc-accent/20 shadow-glow', className)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-noc-text">
              <Layers className="h-5 w-5 text-noc-accent" />
              Traffic volume explorer
            </h3>
            <p className="mt-1 text-xs text-noc-muted">
              <Calendar className="mr-1 inline h-3.5 w-3.5" />
              {detected?.spanLabel} · {detected?.label} · {chartData.length} points
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-noc-border p-0.5">
              {['line', 'stacked'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                    chartMode === mode
                      ? 'bg-noc-accent text-white'
                      : 'text-noc-muted hover:text-noc-text'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="rounded-lg border border-noc-border bg-noc-surface p-2.5 text-noc-muted hover:border-noc-accent/40 hover:text-noc-accent"
              title="Fullscreen preview"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {controls}

        <VolumeChart
          chartData={chartData}
          chartMode={chartMode}
          visible={visible}
          chartTheme={chartTheme}
          isDark={isDark}
        />
      </div>

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={`Traffic volume — ${detected?.spanLabel || ''}`}
      >
        <div className="space-y-4">
          {controls}
          <VolumeChart
            chartData={chartData}
            chartMode={chartMode}
            visible={visible}
            chartTheme={chartTheme}
            isDark={isDark}
            height={520}
            gradientPrefix="fs-"
          />
        </div>
      </ChartFullscreenModal>
    </>
  );
}
