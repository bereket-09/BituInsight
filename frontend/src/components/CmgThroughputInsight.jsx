import clsx from 'clsx';
import {
  Activity,
  ArrowRight,
  Calculator,
  Database,
  Layers,
  Zap,
  Calendar,
  Clock,
  Server,
} from 'lucide-react';

const PIPELINE_ICONS = {
  database: Database,
  calculator: Calculator,
  layers: Layers,
};

function formatGbps(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} Tbps`;
  return `${n.toFixed(2)} Gbps`;
}

/** Build insight from stored summary or live calculated metrics (older reports). */
export function resolveCmgInsight(summary = {}, calculated = {}) {
  if (summary.insight) return summary.insight;

  const m = calculated.metrics || {};
  const det = calculated.timeSeries?.detected || summary.timeContext || {};
  const dayCount = m.dayCount ?? calculated.timeSeries?.dailyPeaks?.length ?? 0;

  return {
    subtitle: 'Combined downlink + uplink CMG capacity, grouped by MDC1 and MDC2',
    formula: {
      title: 'Per CMG row',
      expression: '(DL max Mbps + UL max Mbps) ÷ 1000',
      result: 'Gbps',
      note: 'Node parsed from CMG name (e.g. @MDC1-NK-CMG-CP01 → MDC1)',
    },
    pipeline: [
      {
        step: 1,
        title: 'Import rows',
        detail: `${(m.rawRowCount || 0).toLocaleString()} CMG measurements`,
        icon: 'database',
      },
      {
        step: 2,
        title: 'Convert & classify',
        detail: 'Mbps → Gbps · assign MDC1 or MDC2',
        icon: 'calculator',
      },
      {
        step: 3,
        title: 'Sum per period',
        detail: `${m.periodCount || det.pointCount || 0} time buckets`,
        icon: 'layers',
      },
    ],
    scope: {
      timeSpan: det.spanLabel || det.span || '—',
      granularity: det.label || '—',
      periodCount: m.periodCount,
      dayCount,
      dayLabel: dayCount === 1 ? '1 day' : dayCount > 1 ? `${dayCount} days` : null,
      rawRows: m.rawRowCount,
      samCount: m.samCount,
      samNames: summary.samNames || [],
    },
    snapshot: {
      total: typeof m.totalThroughputGbps === 'number' ? formatGbps(m.totalThroughputGbps) : '—',
      mdc1: typeof m.totalMdc1Gbps === 'number' ? formatGbps(m.totalMdc1Gbps) : '—',
      mdc2: typeof m.totalMdc2Gbps === 'number' ? formatGbps(m.totalMdc2Gbps) : '—',
      mdc1SharePct: m.mdc1SharePct,
      mdc2SharePct: m.mdc2SharePct,
      latestPeriod: m.latestPeriod,
      latestTotal: typeof m.latestTotalGbps === 'number' ? formatGbps(m.latestTotalGbps) : '—',
      peakPeriod: m.peakPeriod,
      peakTotal: typeof m.peakPeriodGbps === 'number' ? formatGbps(m.peakPeriodGbps) : '—',
      averagePeriod: typeof m.averagePeriodGbps === 'number' ? formatGbps(m.averagePeriodGbps) : '—',
    },
  };
}

function ScopeChip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-noc-border/80 bg-noc-surface/60 px-2.5 py-1 text-[11px] text-noc-muted">
      {Icon && <Icon className="h-3 w-3 shrink-0 text-noc-accent/80" />}
      {children}
    </span>
  );
}

function SnapshotTile({ label, value, sub, accent }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-noc-border/50 bg-noc-surface/40 px-3 py-2.5',
        accent && 'border-l-2',
        accent === 'mdc1' && 'border-l-[#3B9EFF]',
        accent === 'mdc2' && 'border-l-[#FF6B35]',
        accent === 'total' && 'border-l-[#4ADE80]'
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-noc-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-noc-text">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-noc-muted">{sub}</p>}
    </div>
  );
}

export default function CmgThroughputInsight({
  summary = {},
  calculated = {},
  variant = 'full',
  className,
}) {
  const insight = resolveCmgInsight(summary, calculated);
  const { formula, pipeline, scope, snapshot } = insight;

  if (variant === 'compact') {
    return (
      <div className={clsx('space-y-2', className)}>
        <p className="text-xs leading-relaxed text-noc-muted">{insight.subtitle}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-noc-accent/25 bg-noc-accent/10 px-2.5 py-1 font-mono text-[11px] text-noc-accent">
            <Calculator className="h-3 w-3" />
            {formula.expression}
            <ArrowRight className="h-3 w-3 opacity-60" />
            <span className="text-noc-text">{formula.result}</span>
          </span>
          <ScopeChip icon={Calendar}>{scope.timeSpan}</ScopeChip>
          {scope.dayLabel && <ScopeChip icon={Clock}>{scope.dayLabel}</ScopeChip>}
          {scope.periodCount != null && (
            <ScopeChip>{scope.periodCount} periods</ScopeChip>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border border-noc-border bg-gradient-to-br from-noc-card via-noc-card to-noc-accent/5',
        className
      )}
    >
      <div className="border-b border-noc-border/60 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noc-accent/15 text-noc-accent">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-noc-text">How this KPI is calculated</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-noc-muted">
                {insight.subtitle}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-1 text-xs font-medium text-[#4ADE80]">
            Unit: Gbps
          </span>
        </div>
      </div>

      <div className="grid gap-4 border-b border-noc-border/40 px-5 py-4 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {pipeline.map((step, i) => {
            const Icon = PIPELINE_ICONS[step.icon] || Activity;
            return (
              <div key={step.step} className="flex flex-1 items-center gap-2 sm:gap-3">
                {i > 0 && (
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-noc-muted/50 sm:block" />
                )}
                <div className="flex flex-1 gap-3 rounded-xl border border-noc-border/50 bg-noc-surface/30 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noc-accent/10 text-xs font-bold text-noc-accent">
                    {step.step}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-noc-accent" />
                      <p className="text-xs font-semibold text-noc-text">{step.title}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-noc-muted">{step.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-dashed border-noc-accent/30 bg-noc-accent/5 px-4 py-3 lg:min-w-[240px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-noc-accent">
            {formula.title}
          </p>
          <p className="mt-1.5 font-mono text-sm font-medium text-noc-text">{formula.expression}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-noc-muted">
            <ArrowRight className="h-3 w-3" />
            Result in <strong className="text-noc-text">{formula.result}</strong>
          </p>
          {formula.note && (
            <p className="mt-2 text-[10px] leading-relaxed text-noc-muted/90">{formula.note}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-3">
        <ScopeChip icon={Calendar}>{scope.timeSpan}</ScopeChip>
        <ScopeChip icon={Clock}>{scope.granularity}</ScopeChip>
        {scope.periodCount != null && <ScopeChip>{scope.periodCount} periods</ScopeChip>}
        {scope.dayLabel && <ScopeChip>{scope.dayLabel}</ScopeChip>}
        {scope.rawRows != null && (
          <ScopeChip icon={Database}>{Number(scope.rawRows).toLocaleString()} rows</ScopeChip>
        )}
        {scope.samCount > 0 && (
          <ScopeChip icon={Server}>
            {scope.samCount} SAM{scope.samCount !== 1 ? 's' : ''}
          </ScopeChip>
        )}
      </div>

      <div className="grid gap-2 border-t border-noc-border/40 bg-noc-surface/20 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <SnapshotTile label="MDC1 total" value={snapshot.mdc1} sub={`${snapshot.mdc1SharePct ?? '—'}% share`} accent="mdc1" />
        <SnapshotTile label="MDC2 total" value={snapshot.mdc2} sub={`${snapshot.mdc2SharePct ?? '—'}% share`} accent="mdc2" />
        <SnapshotTile label="Combined" value={snapshot.total} sub="Sum across all periods" accent="total" />
        <SnapshotTile
          label="Latest period"
          value={snapshot.latestTotal}
          sub={snapshot.latestPeriod}
        />
        <SnapshotTile
          label="Peak period"
          value={snapshot.peakTotal}
          sub={snapshot.peakPeriod}
        />
      </div>

      {(summary.narrative || summary.narrativeLong) && (
        <p className="border-t border-noc-border/30 px-5 py-3 text-xs leading-relaxed text-noc-muted">
          {summary.narrativeLong || summary.narrative}
        </p>
      )}
    </div>
  );
}
