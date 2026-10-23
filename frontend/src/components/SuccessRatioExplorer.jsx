import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from 'recharts';
import clsx from 'clsx';
import { AlertTriangle, Maximize2, TrendingDown } from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useSpanState } from '../hooks/useSpanState';
import ChartFullscreenModal from './ChartFullscreenModal';
import GranularityControl from './GranularityControl';
import SuccessRatioKpiPicker from './SuccessRatioKpiPicker';

const ICON_STROKE = 1.75;

/**
 * Series colours. Recharts needs literal colours rather than classes, so the
 * palette lives here as one named map — the same arrangement the attached-users
 * and throughput explorers use — and every other colour on the page comes from
 * the noc-* tokens.
 */
const COMBINED_COLOR = '#00B140';
const SITE_COLORS = { MDC1: '#3B9EFF', MDC2: '#FF6B35' };
const NODE_COLORS = ['#3B9EFF', '#FF6B35', '#A78BFA', '#FBBF24', '#F472B6', '#22D3EE', '#4ADE80', '#FB7185'];

/** Recharts reads a point by key, so a node's value gets its own namespaced one. */
const nodeKey = (node) => `node_${node}`;

export function formatRatio(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

const VIEWS = {
  nodes: { label: 'Per node', hint: 'Each node on its own, with the combined average over the top.' },
  sites: { label: 'Per data centre', hint: 'MDC1 and MDC2, each the average of its own nodes.' },
  combined: { label: 'Combined', hint: 'The average across every node, against the period average.' },
};

/** A percentage chart that starts at 0 wastes its whole height; this one does not. */
function percentDomain(values) {
  const present = values.filter((v) => v != null && Number.isFinite(v));
  if (!present.length) return [0, 100];
  const low = Math.min(...present);
  const high = Math.max(...present);
  const pad = Math.max(0.25, (high - low) * 0.15);
  return [Math.max(0, Math.floor((low - pad) * 10) / 10), Math.min(110, Math.ceil((high + pad) * 10) / 10)];
}

function RatioTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const coverage = point?.coverage;
  const short = coverage && coverage.readings < coverage.expected;
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
          <span className="tabular font-mono font-medium text-noc-text">
            {formatRatio(entry.value)}
          </span>
        </div>
      ))}
      {coverage && (
        <p
          className={clsx(
            'mt-2 border-t border-noc-border pt-1.5 text-[11px]',
            short ? 'text-noc-warning' : 'text-noc-muted'
          )}
        >
          {short
            ? `${coverage.readings} of ${coverage.expected} readings — averaged over what arrived, not zero-filled`
            : `${coverage.readings} readings averaged across ${coverage.nodesReporting} nodes`}
        </p>
      )}
    </div>
  );
}

function RatioChart({ data, view, kpi, average, theme, height = 380 }) {
  const nodes = kpi.nodes || [];
  const sites = kpi.sites || [];

  const seriesKeys =
    view === 'nodes'
      ? [...nodes.map((n, i) => ({ key: nodeKey(n), name: n, color: NODE_COLORS[i % NODE_COLORS.length], width: 1.5 })),
         { key: 'total', name: 'Combined', color: COMBINED_COLOR, width: 2.5 }]
      : view === 'sites'
        ? [...sites.map((s) => ({ key: s.toLowerCase(), name: s, color: SITE_COLORS[s] || COMBINED_COLOR, width: 2 })),
           { key: 'total', name: 'Combined', color: COMBINED_COLOR, width: 2.5 }]
        : [{ key: 'total', name: 'Combined', color: COMBINED_COLOR, width: 2.5 }];

  const domain = percentDomain(data.flatMap((row) => seriesKeys.map((s) => row[s.key])));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis
            domain={domain}
            tick={{ fill: theme.axis, fontSize: 10 }}
            tickFormatter={(v) => `${Number(v).toFixed(1)}`}
            width={52}
            unit="%"
          />
          <Tooltip content={<RatioTooltip theme={theme} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {average != null && (
            <ReferenceLine
              y={average}
              stroke={COMBINED_COLOR}
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{ value: `Period average ${formatRatio(average)}`, position: 'insideTopRight', fill: theme.axis, fontSize: 10 }}
            />
          )}
          {seriesKeys.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.width}
              dot={false}
              // A gap stays a gap: a node that sent nothing draws nothing.
              connectNulls={false}
            />
          ))}
          <Brush dataKey="name" height={24} stroke={theme.brushStroke} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Per-KPI explorer for a success-ratio report.
 *
 * One KPI at a time, never a blend of several: see it per node, per data centre
 * and combined, at whichever granularity the report carries.
 *
 * A workbook upload makes one report per KPI, so most reports carry a single
 * KPI and there is nothing to pick between — the picker is dropped and the
 * chart takes the full width. A whole-workbook report (a single-report upload,
 * and every report made before the workbook path existed) still carries all of
 * them, and keeps its picker.
 */
export default function SuccessRatioExplorer({
  calculated = {},
  kpiId,
  onKpiChange,
  spanId,
  onSpanChange,
  className,
}) {
  const theme = useChartTheme();
  const metrics = calculated.metrics || {};
  const kpis = calculated.kpis || [];
  const kpiIndex = calculated.kpiIndex || [];

  const [internalKpiId, setInternalKpiId] = useState(kpis[0]?.id);
  useEffect(() => {
    setInternalKpiId(kpis[0]?.id);
  }, [kpis]);

  const controlledKpi = typeof onKpiChange === 'function';
  const requestedId = controlledKpi ? kpiId : internalKpiId;
  const kpi = kpis.find((k) => k.id === requestedId) || kpis[0] || null;
  const setKpiId = controlledKpi ? onKpiChange : setInternalKpiId;

  const [view, setView] = useState('nodes');
  const [fullscreen, setFullscreen] = useState(false);

  const { options, spanId: activeSpanId, setSpanId, series } = useSpanState(kpi?.timeSeries, {
    spanId,
    onSpanChange,
  });

  const data = useMemo(
    () =>
      series.map((point) => {
        const row = {
          name: point.label,
          total: point.total,
          mdc1: point.mdc1,
          mdc2: point.mdc2,
          coverage: point.coverage,
        };
        for (const [node, value] of Object.entries(point.nodeValues || {})) {
          row[nodeKey(node)] = value;
        }
        return row;
      }),
    [series]
  );

  if (!kpis.length) {
    return <div className="card text-sm text-noc-muted">No success-ratio KPIs in this report.</div>;
  }

  const kpiMetrics = kpi?.metrics || {};
  const incomplete = kpiMetrics.missingReadings > 0;
  const showPicker = kpis.length > 1;

  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <GranularityControl options={options} value={activeSpanId} onChange={setSpanId} label="Granularity" />
      <div className="flex flex-wrap rounded-lg border border-noc-border p-0.5">
        {Object.entries(VIEWS).map(([id, config]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-xs transition-colors',
              view === id ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted hover:text-noc-text'
            )}
          >
            {config.label}
          </button>
        ))}
      </div>
    </div>
  );

  const banner = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-noc-border/60 bg-noc-accent/5 px-3 py-2.5 text-xs">
      <span className="flex items-center gap-1.5 font-medium text-noc-accent">
        <TrendingDown className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        Worst hour
      </span>
      <span className="tabular text-noc-muted">{kpiMetrics.worstHourAt || '—'}</span>
      <span className="tabular font-mono font-semibold text-noc-text">
        {formatRatio(kpiMetrics.worstHour)}
      </span>
      <span className="tabular text-noc-muted">· period average {formatRatio(kpiMetrics.average)}</span>
      {kpiMetrics.weakestNode && (
        <span className="tabular text-noc-muted">
          · weakest node {kpiMetrics.weakestNode} at {formatRatio(kpiMetrics.weakestNodeAverage)}
        </span>
      )}
      {kpiMetrics.siteGapPct != null && (
        <span className="tabular text-noc-muted">
          · MDC1 to MDC2 gap {kpiMetrics.siteGapPct.toFixed(2)} points
        </span>
      )}
    </div>
  );

  const note = (
    <p className="text-[11px] text-noc-muted">
      {VIEWS[view].hint} Every figure is an average, never a sum: a node is the mean of its own
      readings in the bucket, a data centre the mean of its nodes, and combined the mean of all{' '}
      {kpiMetrics.nodeCount} nodes.
    </p>
  );

  const chart = (height) => (
    <RatioChart data={data} view={view} kpi={kpi} average={kpiMetrics.average} theme={theme} height={height} />
  );

  return (
    <div className={clsx('space-y-5', className)}>
      <div
        className={clsx(
          'grid gap-5',
          showPicker && 'lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]'
        )}
      >
        {showPicker && (
          <div className="card">
            <SuccessRatioKpiPicker
              kpis={kpiIndex}
              value={kpi?.id}
              onChange={setKpiId}
              attentionThreshold={metrics.attentionThreshold}
            />
          </div>
        )}

        <div className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                {kpi?.entityHeader} · {kpi?.cadenceLabel} readings
              </p>
              <h3 className="mt-1 truncate text-sm font-semibold" title={kpi?.name}>
                {kpi?.name}
              </h3>
              <p className="mt-1 text-xs text-noc-muted">
                {kpiMetrics.nodeCount} node{kpiMetrics.nodeCount === 1 ? '' : 's'} across{' '}
                {(kpi?.sites || []).join(' and ') || 'one site'} ·{' '}
                {kpiMetrics.hourCount} hours · {kpiMetrics.dayCount} days
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
          {incomplete && (
            <p className="flex items-start gap-2 rounded-lg border border-noc-warning/30 bg-noc-warning/5 px-3 py-2 text-[11px] text-noc-textDim">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-noc-warning" strokeWidth={ICON_STROKE} />
              <span>
                {kpiMetrics.missingReadings.toLocaleString()} reading
                {kpiMetrics.missingReadings === 1 ? '' : 's'} never arrived ({formatRatio(kpiMetrics.coveragePct)}{' '}
                coverage). Each gap is left out of its average rather than counted as zero, so a
                short bucket reports the mean of what did arrive.
              </span>
            </p>
          )}
          {note}
          {chart(380)}
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Per node and per data centre</p>
        <h3 className="mt-1 text-sm font-semibold">{kpi?.name} — averages over the whole period</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-noc-border text-[11px] uppercase tracking-wide text-noc-muted">
                <th className="py-2 pr-4 font-medium">{kpi?.entityHeader || 'Node'}</th>
                <th className="py-2 pr-4 font-medium">Data centre</th>
                <th className="py-2 pr-4 text-right font-medium">Average</th>
                <th className="py-2 pr-4 text-right font-medium">Lowest reading</th>
                <th className="py-2 pr-4 text-right font-medium">Highest reading</th>
                <th className="py-2 pr-4 text-right font-medium">Readings</th>
                <th className="py-2 text-right font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {(kpi?.nodeStats || []).map((row) => (
                <tr key={row.node} className="border-b border-noc-border/50 last:border-0">
                  <td className="py-2 pr-4 font-medium text-noc-text">{row.node}</td>
                  <td className="py-2 pr-4 text-noc-muted">{row.site || '—'}</td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-text">
                    {formatRatio(row.average)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {formatRatio(row.lowest)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {formatRatio(row.highest)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {row.readings.toLocaleString()}
                  </td>
                  <td className="tabular py-2 text-right font-mono text-noc-muted">
                    {formatRatio(row.coveragePct, 1)}
                  </td>
                </tr>
              ))}
              {(kpi?.siteStats || []).map((row) => (
                <tr key={row.site} className="border-b border-noc-border/50 bg-noc-surface/60 last:border-0">
                  <td className="py-2 pr-4 font-medium text-noc-text">{row.site}</td>
                  <td className="py-2 pr-4 text-noc-muted">
                    average of {row.nodeCount} node{row.nodeCount === 1 ? '' : 's'}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-text">
                    {formatRatio(row.average)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {formatRatio(row.lowest)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {formatRatio(row.highest)}
                  </td>
                  <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                    {row.readings.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-noc-muted">—</td>
                </tr>
              ))}
              <tr className="bg-noc-accent/5">
                <td className="py-2 pr-4 font-semibold text-noc-accent">Combined</td>
                <td className="py-2 pr-4 text-noc-muted">
                  average of all {kpiMetrics.nodeCount} nodes
                </td>
                <td className="tabular py-2 pr-4 text-right font-mono font-semibold text-noc-accent">
                  {formatRatio(kpiMetrics.average)}
                </td>
                <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                  {formatRatio(kpiMetrics.worstHour)}
                </td>
                <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                  {formatRatio(kpiMetrics.bestHour)}
                </td>
                <td className="tabular py-2 pr-4 text-right font-mono text-noc-muted">
                  {kpiMetrics.readings?.toLocaleString()}
                </td>
                <td className="tabular py-2 text-right font-mono text-noc-muted">
                  {formatRatio(kpiMetrics.coveragePct, 1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-noc-muted">
          The lowest and highest columns show single readings for a node and the worst and best
          hour for the combined row.
        </p>
      </div>

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={`${kpi?.name || 'Success ratio'} — ${kpi?.timeSeries?.detected?.spanLabel || ''}`}
      >
        <div className="space-y-4">
          {controls}
          {banner}
          {note}
          {chart(520)}
        </div>
      </ChartFullscreenModal>
    </div>
  );
}
