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
import { Users, Maximize2, TrendingUp, Clock, Gauge, Server, AlertTriangle } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import ChartFullscreenModal from './ChartFullscreenModal';
import GranularityControl from './GranularityControl';

const ICON_STROKE = 1.75;

/**
 * SAAU dashboard: KPI cards, the hourly / daily trend, and a daily summary table.
 *
 * SAAU is simultaneously attached active users — UTRAN plus GERAN plus E-UTRAN
 * active bearers — and it is a count, unit "[#]" in the export. No terabyte
 * conversion, no byte scaling, no unit suffix: the figures here are bearers.
 */

// Bearer series have no entry in the shared chart theme; the data centre series
// do, and are read from it so they match every other report.
const BEARER_COLORS = {
  eutran: '#4ADE80',
  utran: '#3B9EFF',
  geran: '#A78BFA',
};

/** 4011661 → "4.01M", 23456 → "23.5K". Bearers, never bytes. */
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-GB', { maximumFractionDigits: abs >= 100 ? 0 : 1 });
}

/** The exact figure, for a table cell where the reader is comparing days. */
function formatExact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

const VIEWS = {
  site: {
    label: 'By data centre',
    series: [
      { key: 'mdc1', name: 'MDC1' },
      { key: 'mdc2', name: 'MDC2' },
      { key: 'total', name: 'Combined SAAU' },
    ],
  },
  bearer: {
    label: 'By bearer type',
    stacked: true,
    series: [
      { key: 'eutran', name: '4G (E-UTRAN)' },
      { key: 'utran', name: '3G (UTRAN)' },
      { key: 'geran', name: '2G (GERAN)' },
    ],
  },
};

function SaauTooltip({ active, payload, label, theme }) {
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
          <span className="tabular font-mono font-medium text-noc-text">{formatExact(entry.value)}</span>
        </div>
      ))}
      {point?.peakTotal != null && (
        <p className="mt-2 border-t border-noc-border pt-1.5 text-[11px] text-noc-muted">
          Average hour shown · peak {formatCount(point.peakTotal)} at {point.peakAt}
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

function SaauChart({ data, view, theme, colorOf, height = 380 }) {
  const config = VIEWS[view];
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
      <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 9 }} interval="preserveStartEnd" />
      <YAxis tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={formatCount} width={56} />
      <Tooltip content={<SaauTooltip theme={theme} />} />
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
                stackId="saau"
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
  }));

  return (
    <div style={{ height: 240 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 10 }} />
          <YAxis tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={formatCount} width={56} />
          <Tooltip content={<SaauTooltip theme={theme} />} />
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
        <h3 className="mt-1 text-sm font-semibold text-noc-text">Day by day, in active bearers</h3>
        <p className="mt-1 max-w-[80ch] text-xs text-noc-muted">
          Each day shows its average hour and its busiest hour, for each data centre and for the two
          combined. SAAU is a headcount of active bearers, so hours are averaged across a day and
          never added together.
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-noc-border">
              {head('Day', 'left')}
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
                <td className="tabular px-3 py-2 text-right" style={{ color: colorOf('mdc1') }}>
                  {formatExact(d.avgMdc1)}
                </td>
                <td className="tabular px-3 py-2 text-right" style={{ color: colorOf('mdc2') }}>
                  {formatExact(d.avgMdc2)}
                </td>
                <td className="tabular px-3 py-2 text-right font-medium text-noc-text">
                  {formatExact(d.avgTotal)}
                </td>
                <td className="tabular px-3 py-2 text-right text-noc-textDim">{formatExact(d.peakMdc1)}</td>
                <td className="tabular px-3 py-2 text-right text-noc-textDim">{formatExact(d.peakMdc2)}</td>
                <td className="tabular px-3 py-2 text-right font-semibold text-noc-text">
                  {formatExact(d.peakTotal)}
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
        Figures are active bearers. Hours follow the period start times in the export.
        {anyPartial && (
          <>
            {' '}
            Averages skip any hour in which only one data centre reported.
          </>
        )}
      </p>
    </div>
  );
}

export default function SaauExplorer({
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

  const colorOf = (key) => theme.series[key] || BEARER_COLORS[key];
  const data = useMemo(() => series.map((p) => ({ ...p, name: p.label })), [series]);
  const isBucketed = activeSpanId !== 'native';
  const peak = timeSeries?.peak;
  const detected = timeSeries?.detected || {};

  if (!timeSeries) {
    return <div className="card text-sm text-noc-muted">No SAAU time series for this report.</div>;
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
        MDC1 {formatExact(peak.mdc1)}
      </span>
      <span className="tabular font-mono" style={{ color: colorOf('mdc2') }}>
        MDC2 {formatExact(peak.mdc2)}
      </span>
      <span className="tabular font-mono font-semibold" style={{ color: colorOf('total') }}>
        Combined {formatExact(peak.total)}
      </span>
    </div>
  );

  const note = isBucketed && (
    <p className="text-[11px] text-noc-muted">
      Each {activeSpanId === 'weekly' ? 'week' : 'day'} shows its average hour — SAAU is a headcount,
      so hours are averaged, never added. Hover a point for the busiest hour behind it.
    </p>
  );

  return (
    <div className={clsx('space-y-5', className)}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Users}
          label="Peak SAAU"
          value={formatCount(metrics.peakTotal)}
          sub={`Combined · ${metrics.peakPeriod || '—'}`}
          accent
        />
        <KpiCard
          icon={Clock}
          label="Average SAAU"
          value={formatCount(metrics.averageHourly)}
          sub="Combined, average hour"
        />
        <KpiCard
          icon={Gauge}
          label="Average daily peak"
          value={formatCount(metrics.averageDailyPeak)}
          sub={`Highest daily peak ${formatCount(metrics.highestDailyPeak)}`}
        />
        <KpiCard
          icon={TrendingUp}
          label="4G bearers"
          value={`${metrics.shareEutranPct ?? '—'}%`}
          sub={`3G ${metrics.shareUtranPct ?? '—'}% · 2G ${metrics.shareGeranPct ?? '—'}%`}
        />
        <KpiCard
          icon={Server}
          label="MDC1"
          value={formatCount(metrics.mdc1?.average)}
          sub={`Average hour · peak ${formatCount(metrics.mdc1?.peak)} · ${metrics.mdc1SharePct ?? '—'}% share`}
        />
        <KpiCard
          icon={Server}
          label="MDC2"
          value={formatCount(metrics.mdc2?.average)}
          sub={`Average hour · peak ${formatCount(metrics.mdc2?.peak)} · ${metrics.mdc2SharePct ?? '—'}% share`}
        />
      </div>

      {metrics.partialHours > 0 && (
        <div className="card flex items-start gap-2.5 border-noc-warning/30 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-noc-warning" strokeWidth={ICON_STROKE} />
          <p className="text-xs leading-relaxed text-noc-textDim">
            {metrics.partialHours} of {metrics.periodCount} hours carry a reading from only one data
            centre. Those hours are shown on the chart but left out of every average.
          </p>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-noc-text">SAAU timeline</h3>
            <p className="mt-1 text-xs text-noc-muted">
              UTRAN plus GERAN plus E-UTRAN active bearers per hour. Combined is MDC1 plus MDC2 at
              the same period start time. A count of bearers, not a volume.
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
        <SaauChart data={data} view={view} theme={theme} colorOf={colorOf} />
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
        title={`SAAU — ${detected.spanLabel || summary.title || ''}`}
      >
        <div className="space-y-4">
          {controls}
          {banner}
          {note}
          <SaauChart data={data} view={view} theme={theme} colorOf={colorOf} height={520} />
        </div>
      </ChartFullscreenModal>
    </div>
  );
}
