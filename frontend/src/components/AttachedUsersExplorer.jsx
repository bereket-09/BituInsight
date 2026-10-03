import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  ComposedChart,
  Area,
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
import GranularityControl from './GranularityControl';

const COLORS = {
  users4g: '#4ADE80',
  users3g: '#3B9EFF',
  users2g: '#A78BFA',
  mdc1: '#3B9EFF',
  mdc2: '#FF6B35',
  total: '#E6EDF3',
  vlr: '#FBBF24',
  bhca: '#F472B6',
};

/** 4127000 → "4.13M"; attached users are counts, never units of traffic. */
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 0 : 1 });
}

const VIEWS = {
  technology: {
    label: 'By technology',
    series: [
      { key: 'users4g', name: '4G' },
      { key: 'users3g', name: '3G' },
      { key: 'users2g', name: '2G' },
    ],
    stacked: true,
  },
  site: {
    label: 'By site',
    series: [
      { key: 'mdc1', name: 'MDC1' },
      { key: 'mdc2', name: 'MDC2' },
      { key: 'total', name: 'Total attached' },
    ],
  },
  voice: {
    label: 'Voice (VLR & BHCA)',
    series: [
      { key: 'vlr', name: 'VLR subscribers', axis: 'left' },
      { key: 'bhca', name: 'BHCA (Erlang)', axis: 'right' },
    ],
  },
};

function CountTooltip({ active, payload, label, theme }) {
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
          <span className="font-mono font-medium text-noc-text">{formatCount(entry.value)}</span>
        </div>
      ))}
      {point?.peakTotal != null && (
        <p className="mt-2 border-t border-noc-border pt-1.5 text-[11px] text-noc-muted">
          Average hour shown · peak {formatCount(point.peakTotal)} at {point.peakAt}
        </p>
      )}
    </div>
  );
}

function AttachChart({ data, view, theme, height = 380 }) {
  const config = VIEWS[view];
  const dual = view === 'voice';
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
      <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 9 }} interval="preserveStartEnd" />
      <YAxis yAxisId="left" tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={formatCount} width={56} />
      {dual && (
        <YAxis yAxisId="right" orientation="right" tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={formatCount} width={56} />
      )}
      <Tooltip content={<CountTooltip theme={theme} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Brush dataKey="name" height={24} stroke={theme.brushStroke} />
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
                yAxisId="left"
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="attach"
                stroke={COLORS[s.key]}
                fill={COLORS[s.key]}
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
                yAxisId={s.axis === 'right' ? 'right' : 'left'}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={COLORS[s.key]}
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

export default function AttachedUsersExplorer({ timeSeries, calculated = {}, spanId, onSpanChange, className }) {
  const theme = useChartTheme();
  const metrics = calculated.metrics || {};
  const { options, spanId: activeSpanId, setSpanId, series } = useSpanState(timeSeries, {
    spanId,
    onSpanChange,
  });
  const [view, setView] = useState('technology');
  const [fullscreen, setFullscreen] = useState(false);

  const data = useMemo(() => series.map((p) => ({ ...p, name: p.label })), [series]);
  const isBucketed = activeSpanId !== 'native';
  const peak = timeSeries?.peak;
  const views = Object.entries(VIEWS).filter(([id]) => id !== 'voice' || metrics.hasVoice);

  if (!timeSeries) {
    return <div className="card text-sm text-noc-muted">No time series for this report.</div>;
  }

  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <GranularityControl options={options} value={activeSpanId} onChange={setSpanId} label="Granularity" />
      <div className="flex flex-wrap rounded-lg border border-noc-border p-0.5">
        {views.map(([id, v]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-xs',
              view === id ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted'
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
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />
        Overall peak
      </span>
      <span className="tabular text-noc-muted">{peak.label}</span>
      <span className="tabular font-mono font-semibold text-noc-text">{formatCount(peak.total)} attached</span>
      <span className="tabular font-mono" style={{ color: COLORS.users4g }}>4G {formatCount(peak.users4g)}</span>
      <span className="tabular font-mono" style={{ color: COLORS.users3g }}>3G {formatCount(peak.users3g)}</span>
      <span className="tabular font-mono" style={{ color: COLORS.users2g }}>2G {formatCount(peak.users2g)}</span>
      {metrics.averageTotalUsers != null && (
        <span className="tabular text-noc-muted">
          · average hour {formatCount(metrics.averageTotalUsers)}
        </span>
      )}
    </div>
  );

  const note = isBucketed && (
    <p className="text-[11px] text-noc-muted">
      Each {activeSpanId === 'weekly' ? 'week' : 'day'} shows its average hour — attached users are a
      headcount, so hours are averaged, never added. Hover a point for its peak hour.
    </p>
  );

  return (
    <div className={clsx('card space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Attached users timeline</h3>
          <p className="mt-1 text-xs text-noc-muted">
            2G + 3G + 4G users attached each hour, added across{' '}
            {metrics.cmmNodeCount ? `all ${metrics.cmmNodeCount} CMMs` : 'every CMM'}.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 py-1.5 text-xs"
          onClick={() => setFullscreen(true)}
          title="Fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {controls}
      {banner}
      {note}
      <AttachChart data={data} view={view} theme={theme} />

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={`Attached users — ${timeSeries.detected?.spanLabel || ''}`}
      >
        <div className="space-y-4">
          {controls}
          {banner}
          {note}
          <AttachChart data={data} view={view} theme={theme} height={520} />
        </div>
      </ChartFullscreenModal>
    </div>
  );
}
