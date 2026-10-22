import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowRight,
  Calculator,
  Database,
  Layers,
  Server,
  SignalLow,
} from 'lucide-react';
import { formatRatio } from './SuccessRatioExplorer';

const ICON_STROKE = 1.75;
const PIPELINE_ICONS = { database: Database, calculator: Calculator, layers: Layers };

function Chip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-noc-border/80 bg-noc-surface/60 px-2.5 py-1 text-[11px] text-noc-muted">
      {Icon && <Icon className="h-3 w-3 shrink-0 text-noc-accent/80" strokeWidth={ICON_STROKE} />}
      {children}
    </span>
  );
}

/**
 * The all-KPI view of a success-ratio report.
 *
 * It says plainly how a figure was reached — mean of a node's readings, mean of
 * a centre's nodes, mean of all nodes — and then ranks every KPI on its own
 * average. Nothing here averages across KPIs: a single "network success ratio"
 * mixing attach with paging and handover would belong to no one.
 */
export default function SuccessRatioInsight({ summary = {}, calculated = {}, className }) {
  const metrics = calculated.metrics || {};
  const insight = summary.insight || {};
  const ranking = calculated.ranking || calculated.kpiIndex || [];
  const [worstFirst, setWorstFirst] = useState(true);

  const rows = useMemo(() => {
    const list = [...ranking];
    list.sort((a, b) =>
      worstFirst ? (a.average ?? 101) - (b.average ?? 101) : (a.order ?? 0) - (b.order ?? 0)
    );
    return list;
  }, [ranking, worstFirst]);

  if (!rows.length) return null;

  const threshold = metrics.attentionThreshold ?? 95;

  return (
    <div className={clsx('space-y-5', className)}>
      <div className="card border-l-2 border-l-noc-accent p-6">
        <p className="eyebrow mb-2.5">How every figure here is worked out</p>
        <p className="max-w-[72ch] font-display text-[17px] font-medium leading-[1.6] tracking-tight text-noc-text">
          {summary.narrative}
        </p>

        {insight.formula && (
          <div className="mt-4 rounded-xl border border-noc-border bg-noc-surface/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-noc-muted">
              {insight.formula.title}
            </p>
            <p className="tabular mt-1.5 font-mono text-sm text-noc-text">
              {insight.formula.expression}
            </p>
            <p className="mt-2 max-w-[72ch] text-xs text-noc-muted">{insight.formula.note}</p>
          </div>
        )}

        {insight.pipeline?.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {insight.pipeline.map((step, index) => {
              const Icon = PIPELINE_ICONS[step.icon] || Layers;
              return (
                <span key={step.step} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-noc-border bg-noc-surface/60 px-3 py-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-noc-accent" strokeWidth={ICON_STROKE} />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-noc-text">{step.title}</span>
                      <span className="block text-[11px] text-noc-muted">{step.detail}</span>
                    </span>
                  </span>
                  {index < insight.pipeline.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-noc-muted" strokeWidth={ICON_STROKE} />
                  )}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip icon={Layers}>{insight.scope?.timeSpan || metrics.timeSpan}</Chip>
          <Chip icon={Database}>
            {metrics.kpiCount} {metrics.kpiGroupLabel}
          </Chip>
          <Chip icon={Server}>
            {metrics.nodeCount} nodes · {(metrics.siteNames || []).join(' / ')}
          </Chip>
          <Chip icon={SignalLow}>
            {metrics.kpisBelowAttention} below {threshold}%
          </Chip>
        </div>
      </div>

      <div className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <p className="eyebrow">Every KPI, on its own</p>
            <h3 className="mt-1 text-sm font-semibold">
              {metrics.kpiCount} {metrics.kpiGroupLabel}, each averaged separately
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setWorstFirst((on) => !on)}
            aria-pressed={worstFirst}
            className="btn-secondary py-1.5 text-xs"
          >
            <ArrowDown
              className={clsx('h-3.5 w-3.5 transition-transform', !worstFirst && 'rotate-180')}
              strokeWidth={ICON_STROKE}
            />
            {worstFirst ? 'Weakest first' : 'Workbook order'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="tabular w-full border-collapse text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                <th className="border-b border-noc-border px-5 py-2 font-medium">KPI</th>
                <th className="border-b border-noc-border px-3 py-2 font-medium">Reported per</th>
                <th className="border-b border-noc-border px-3 py-2 text-right font-medium">Average</th>
                <th className="border-b border-noc-border px-3 py-2 text-right font-medium">Worst hour</th>
                <th className="border-b border-noc-border px-3 py-2 font-medium">When</th>
                <th className="border-b border-noc-border px-3 py-2 font-medium">Weakest node</th>
                <th className="border-b border-noc-border px-5 py-2 text-right font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((kpi) => {
                const weak = kpi.average != null && kpi.average < threshold;
                return (
                  <tr key={kpi.id} className="border-b border-noc-border/50 last:border-0 hover:bg-noc-accent/[0.04]">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'h-2 w-2 shrink-0 rounded-full',
                            weak ? 'bg-noc-warning' : 'bg-noc-accent'
                          )}
                          aria-hidden
                        />
                        <span className="text-sm text-noc-text">{kpi.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-noc-muted">
                      {kpi.entityHeader} ({kpi.nodeCount})
                    </td>
                    <td
                      className={clsx(
                        'px-3 py-2.5 text-right font-mono text-sm font-semibold',
                        weak ? 'text-noc-warning' : 'text-noc-text'
                      )}
                    >
                      {formatRatio(kpi.average)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm text-noc-textDim">
                      {formatRatio(kpi.worstHour)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-noc-muted">{kpi.worstHourAt || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-noc-muted">{kpi.weakestNode || '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs text-noc-muted">
                      {formatRatio(kpi.coveragePct, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="px-5 pb-5 pt-3 text-[11px] text-noc-muted">
          Each row is that KPI alone. A few counters read marginally above 100% in the source
          export, where the numerator and the denominator are collected over slightly different
          windows; those figures are shown as the counter reported them.
        </p>
      </div>
    </div>
  );
}
