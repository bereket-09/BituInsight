import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import clsx from 'clsx';
import { Database, Maximize2, TrendingUp, Clock, Gauge, Server, AlertTriangle } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import ChartFullscreenModal from './ChartFullscreenModal';
import GranularityControl from './GranularityControl';

const ICON_STROKE = 1.75;

/**
 * Total Data Volume dashboard: KPI cards, the hourly / daily trend, and a daily
 * summary table.
 *
 * Volumes arrive from the backend already in terabytes — the megabyte-to-TB
 * conversion lives in the workflow, in one place, and nothing here rescales a
 * figure. Everything this component shows is read straight off the series.
 */

// Technology series have no entry in the shared chart theme; the data centre
// series do, and are read from it so they match every other report.
const TECHNOLOGY_COLORS = {
  volume4g: '#3B9EFF',
  volume2g3g: '#FF6B35',
};

/** 209.187 → "209.19 TB". Two decimals reads well for terabytes. */
export function formatTb(value, { withUnit = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const figure = n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withUnit ? `${figure} TB` : figure;
}

/** Axis ticks stay short: 1,842.30 TB would crowd the gutter. */
function formatAxisTb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

const VIEWS = {
  site: {
    label: 'By data centre',
    series: [
      { key: 'mdc1', name: 'MDC1' },
      { key: 'mdc2', name: 'MDC2' },
      { key: 'total', name: 'Combined' },
    ],
  },
  technology: {
    label: 'By technology',
    stacked: true,
    series: [
      { key: 'volume4g', name: '4G' },
      { key: 'volume2g3g', name: '2G+3G' },
    ],
  },
};

function VolumeTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
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
          <span className="tabular font-mono font-medium text-noc-text">{formatTb(entry.value)}</span>
        </div>
      ))}
      {point?.peakTotal != null && (
        <p className="mt-2 border-t border-noc-border pt-1.5 text-[11px] text-noc-muted">
          Average hour shown · peak {formatTb(point.peakTotal)} at {point.peakAt}
        </p>
      )}
      {point?.complete === false && (
        <p className="mt-2 border-t border-noc-border pt-1.5 text-[11px] text-noc-warning">
          Only one data centre reported this hour.
        </p>
      )}
    </div>
  );
}

function VolumeChart({ data, view, theme, colorOf, height = 380 }) {
  const config = VIEWS[view];
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
      <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 9 }} interval="preserveStartEnd" />
      <YAxis
        tick={{ fill: theme.axis, fontSize: 10 }}
        tickFormatter={formatAxisTb}
        width={48}
        label={{ value: 'TB', angle: -90, position: 'insideLeft', fill: theme.axis, fontSize: 10 }}
      />
      <Tooltip content={<VolumeTooltip theme={theme} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Brush dataKey="name" height={24} stroke={theme.brushStroke} fill={theme.brushFill} />
    </>
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {config.stacked ? (
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            {common}
            {config.series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="volume"
                stroke={colorOf(s.key)}
                fill={colorOf(s.key)}
                fillOpacity={0.4}
                strokeWidth={1.5}
              />
            ))}
          </ComposedChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            {common}
            {config.series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={colorOf(s.key)}
                dot={false}
                strokeWidth={s.key === 'total' ? 2.5 : 2}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function DailyShapeChart({ dailyStats, theme, colorOf }) {
  const data = dailyStats.map((d) => ({
    name: d.day,
    avgTotal: d.avgTotal,
    peakTotal: d.peakTotal,
    dayTotal: d.dayTotal,
  }));

  return (
    <div style={{ height: 240 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 10 }} />
          <YAxis tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={formatAxisTb} width={48} />
          <Tooltip content={<VolumeTooltip theme={theme} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="avgTotal" name="Average hour" fill={colorOf('mdc1')} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
          <Bar dataKey="peakTotal" name="Peak hour" fill={colorOf('total')} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent = false }) {
  return (
    <div className={clsx('card stat-glow p-4', accent && 'border-noc-accent/30')}>
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        <Icon className="h-3 w-3" strokeWidth={ICON_STROKE} />
        {label}
      </p>
      <p className="tabular mt-2 text-xl font-semibold tracking-tight text-noc-text">{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-noc-muted">{sub}</p>}
    </div>
  );
}

function DailyTable({ dailyStats, colorOf }) {
  const topPeak = Math.max(...dailyStats.map((d) => d.peakTotal));
  const topTotal = Math.max(...dailyStats.map((d) => d.dayTotal));
  const anyPartial = dailyStats.some((d) => d.partialHours > 0);

  const head = (text, align = 'right') => (
    <th
      scope="col"
      className={clsx(
        'whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-noc-muted',
        align === 'left' ? 'text-left' : 'text-right'
      )}
    >
      {text}
    </th>
  );

  return (
    <div className="card space-y-3 p-5">
      <div>
        <p className="eyebrow">Daily summary</p>
        <h3 className="mt-1 text-sm font-semibold text-noc-text">Day by day, in terabytes</h3>
        <p className="mt-1 max-w-[80ch] text-xs text-noc-muted">
          Each day shows what the core carried in total, the average hour and the busiest hour, for
          each data centre and for the two combined. The combined figure is MDC1 plus MDC2 at the
          same period start time.
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-noc-border">
              {head('Day', 'left')}
              {head('Day total')}
              {head('MDC1 avg')}
              {head('MDC2 avg')}
              {head('Combined avg')}
              {head('MDC1 peak')}
              {head('MDC2 peak')}
              {head('Combined peak')}
              {head('Peak hour', 'left')}
            </tr>
          </thead>
          <tbody>
            {dailyStats.map((d) => (
              <tr key={d.dayKey} className="border-b border-noc-border/50 last:border-0 hover:bg-noc-surface">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-noc-text">
                  {d.day}
                  {d.partialHours > 0 && (
                    <span className="badge badge-warning ml-2">{d.partialHours}h partial</span>
                  )}
                </th>
                <td className="tabular px-3 py-2 text-right text-noc-text">
                  {formatTb(d.dayTotal, { withUnit: false })}
                  {d.dayTotal === topTotal && <span className="ml-1.5 text-noc-accent">▲</span>}
                </td>
                <td className="tabular px-3 py-2 text-right" style={{ color: colorOf('mdc1') }}>
                  {formatTb(d.avgMdc1, { withUnit: false })}
                </td>
                <td className="tabular px-3 py-2 text-right" style={{ color: colorOf('mdc2') }}>
                  {formatTb(d.avgMdc2, { withUnit: false })}
                </td>
                <td className="tabular px-3 py-2 text-right font-medium text-noc-text">
                  {formatTb(d.avgTotal, { withUnit: false })}
                </td>
                <td className="tabular px-3 py-2 text-right text-noc-textDim">
                  {formatTb(d.peakMdc1, { withUnit: false })}
                </td>
                <td className="tabular px-3 py-2 text-right text-noc-textDim">
                  {formatTb(d.peakMdc2, { withUnit: false })}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold text-noc-text">
                  {formatTb(d.peakTotal, { withUnit: false })}
                  {d.peakTotal === topPeak && <span className="ml-1.5 text-noc-accent">▲</span>}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-left text-noc-muted">
                  {d.peakHourOfDay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-noc-muted">
        Figures in TB. Hours follow the period start times in the export.
        {anyPartial && (
          <>
            {' '}
            Averages skip any hour in which only one data centre reported, so a gap in the export
            does not drag the other site down; a day total still counts only what was recorded.
          </>
        )}
      </p>
    </div>
  );
}

export default function DataVolumeExplorer({
  timeSeries,
  calculated = {},
  summary = {},
  spanId,
  onSpanChange,
  className,
}) {
  const theme = useChartTheme();
  const metrics = calculated.metrics || {};
  const dailyStats = calculated.dailyStats || [];
  const { options, spanId: activeSpanId, setSpanId, series } = useSpanState(timeSeries, {
    spanId,
    onSpanChange,
  });
  const [view, setView] = useState('site');
  const [fullscreen, setFullscreen] = useState(false);

  const colorOf = (key) => theme.series[key] || TECHNOLOGY_COLORS[key];
  const data = useMemo(() => series.map((p) => ({ ...p, name: p.label })), [series]);
  const isBucketed = activeSpanId !== 'native';
  const peak = timeSeries?.peak;
  const detected = timeSeries?.detected || {};

  if (!timeSeries) {
    return <div className="card text-sm text-noc-muted">No data volume time series for this report.</div>;
  }

  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <GranularityControl options={options} value={activeSpanId} onChange={setSpanId} label="Granularity" />
      <div className="flex flex-wrap rounded-lg border border-noc-border p-0.5">
        {Object.entries(VIEWS).map(([id, v]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-xs transition-colors',
              view === id ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted hover:text-noc-text'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );

  const banner = peak && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-noc-border/60 bg-noc-accent/5 px-3 py-2.5 text-xs">
      <span className="flex items-center gap-1.5 font-medium text-noc-accent">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        Busiest hour
      </span>
      <span className="tabular text-noc-muted">{peak.label}</span>
      <span className="tabular font-mono" style={{ color: colorOf('mdc1') }}>
        MDC1 {formatTb(peak.mdc1)}
      </span>
      <span className="tabular font-mono" style={{ color: colorOf('mdc2') }}>
        MDC2 {formatTb(peak.mdc2)}
      </span>
      <span className="tabular font-mono font-semibold" style={{ color: colorOf('total') }}>
        Combined {formatTb(peak.total)}
      </span>
    </div>
  );

  const note = isBucketed && (
    <p className="text-[11px] text-noc-muted">
      Each {activeSpanId === 'weekly' ? 'week' : 'day'} shows its average hour. Hover a point for the
      busiest hour behind it.
    </p>
  );

  return (
    <div className={clsx('space-y-5', className)}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Database}
          label="Total volume"
          value={formatTb(metrics.grandTotal)}
          sub={`MDC1 and MDC2 over ${metrics.timeSpan || 'the period'}`}
          accent
        />
        <KpiCard
          icon={TrendingUp}
          label="Peak hour"
          value={formatTb(metrics.peakTotal)}
          sub={`Combined · ${metrics.peakPeriod || '—'}`}
        />
        <KpiCard
          icon={Clock}
          label="Average hour"
          value={formatTb(metrics.averageHourly)}
          sub="Combined across the report"
        />
        <KpiCard
          icon={Gauge}
          label="Average day"
          value={formatTb(metrics.averageDailyTotal)}
          sub={`Average daily peak ${formatTb(metrics.averageDailyPeak)}`}
        />
        <KpiCard
          icon={Server}
          label="MDC1"
          value={formatTb(metrics.mdc1?.average)}
          sub={`Average hour · peak ${formatTb(metrics.mdc1?.peak)} · ${metrics.mdc1SharePct ?? '—'}% share`}
        />
        <KpiCard
          icon={Server}
          label="MDC2"
          value={formatTb(metrics.mdc2?.average)}
          sub={`Average hour · peak ${formatTb(metrics.mdc2?.peak)} · ${metrics.mdc2SharePct ?? '—'}% share`}
        />
      </div>

      {metrics.partialHours > 0 && (
        <div className="card flex items-start gap-2.5 border-noc-warning/30 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-noc-warning" strokeWidth={ICON_STROKE} />
          <p className="text-xs leading-relaxed text-noc-textDim">
            {metrics.partialHours} of {metrics.periodCount} hours carry a reading from only one data
            centre. Those hours are shown on the chart but left out of every average, so one site's
            gap does not read as a quiet hour for the other.
          </p>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-noc-text">Data volume timeline</h3>
            <p className="mt-1 text-xs text-noc-muted">
              Terabytes carried per hour. Combined is MDC1 plus MDC2 at the same period start time.
              The export reports megabytes; every figure here is that value divided by 1024².
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 py-1.5 text-xs"
            onClick={() => setFullscreen(true)}
            title="Fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        {controls}
        {banner}
        {note}
        <VolumeChart data={data} view={view} theme={theme} colorOf={colorOf} />
      </div>

      {dailyStats.length > 1 && (
        <div className="card space-y-3">
          <div>
            <p className="eyebrow">Daily shape</p>
            <h3 className="mt-1 text-sm font-semibold text-noc-text">
              Average hour against peak hour, by day
            </h3>
          </div>
          <DailyShapeChart dailyStats={dailyStats} theme={theme} colorOf={colorOf} />
        </div>
      )}

      {dailyStats.length > 0 && <DailyTable dailyStats={dailyStats} colorOf={colorOf} />}

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={`Total data volume — ${detected.spanLabel || summary.title || ''}`}
      >
        <div className="space-y-4">
          {controls}
          {banner}
          {note}
          <VolumeChart data={data} view={view} theme={theme} colorOf={colorOf} height={520} />
        </div>
      </ChartFullscreenModal>
    </div>
  );
}
