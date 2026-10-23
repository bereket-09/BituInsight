import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  X,
  Minus,
  RefreshCw,
  Sparkles,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { workbookApi } from '../api';
import StatusBadge from '../components/StatusBadge';
import KpiReportPanel from '../components/KpiReportPanel';
import KpiNav, { useKpiNavMode } from '../components/KpiNav';
import PptExportPanel from '../components/PptExportPanel';

const ICON_STROKE = 1.75;

function Vital({ label, value, tone = 'neutral', index }) {
  const tones = {
    neutral: 'text-noc-text',
    success: 'text-noc-success',
    danger: 'text-noc-danger',
    pending: 'text-noc-warning',
  };
  return (
    <div
      className={clsx(
        'px-5 py-4',
        index % 2 === 1 && 'border-l border-noc-border',
        index === 2 && 'lg:border-l lg:border-noc-border',
        index >= 2 && 'border-t border-noc-border lg:border-t-0'
      )}
    >
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        {label}
      </dt>
      <dd className={clsx('tabular mt-2 font-display text-2xl font-semibold', tones[tone])}>
        {value}
      </dd>
    </div>
  );
}

function WorkbookSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-9 w-80 max-w-full" />
        <div className="skeleton h-3 w-64" />
      </div>
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-72 rounded-2xl" />
    </div>
  );
}

function CorrelationRcaCard({ correlationAnalysis }) {
  if (!correlationAnalysis) return null;
  const { hasCorrelations, incidents = [] } = correlationAnalysis;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-noc-border pb-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            Cross-KPI Intelligence
          </p>
          <h2 className="text-display-md text-noc-text">Multi-KPI Root-Cause & Correlation Radar</h2>
        </div>
        <p className="tabular shrink-0 text-xs text-noc-muted">
          {hasCorrelations
            ? `${incidents.length} correlated incident${incidents.length === 1 ? '' : 's'} identified across sheets`
            : 'Multi-layer telecom signaling & user plane verified consistent'}
        </p>
      </div>

      {!hasCorrelations ? (
        <div className="card flex items-center gap-4 bg-noc-success/5 border-noc-success/20 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noc-success/15 text-noc-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-noc-text">Zero Cross-KPI Anomaly Conflicts</h3>
            <p className="mt-0.5 text-xs text-noc-textDim">
              No correlated multi-layer dips or surges detected across SAAU, Throughput, and Attached Users. Network state is synchronized.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className={clsx(
                'card border p-5 space-y-3 transition-all',
                inc.severity === 'critical'
                  ? 'border-noc-danger/40 bg-noc-danger/[0.03]'
                  : inc.severity === 'major'
                    ? 'border-noc-warning/40 bg-noc-warning/[0.03]'
                    : 'border-noc-border'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'badge',
                      inc.severity === 'critical'
                        ? 'badge-danger'
                        : inc.severity === 'major'
                          ? 'badge-warning'
                          : 'badge-info'
                    )}
                  >
                    {inc.severity}
                  </span>
                  <h3 className="text-sm font-semibold text-noc-text">{inc.title}</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-noc-muted">
                  <span className="font-mono text-noc-accent font-semibold">{inc.confidence}% confidence</span>
                  <span>·</span>
                  <span>Window: {inc.timeKey}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-noc-textDim">{inc.explanation}</p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-noc-muted">
                  Correlated KPIs:
                </span>
                {inc.affectedKpis.map((kpi) => (
                  <span
                    key={kpi}
                    className="rounded-md border border-noc-border bg-noc-surface px-2 py-0.5 text-[11px] font-medium text-noc-text"
                  >
                    {kpi}
                  </span>
                ))}
              </div>

              <div className="rounded-xl border border-noc-accent/20 bg-noc-accent/5 p-3 text-xs leading-relaxed text-noc-text">
                <span className="font-semibold text-noc-accent">Recommended Action: </span>
                {inc.recommendation}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CapacityRadarCard({ capacityRadar }) {
  if (!capacityRadar || !capacityRadar.items?.length) return null;
  const { limitingKpi, limitingUtilization, earliestExhaustionDays, overallRisk, items } = capacityRadar;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-noc-border pb-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5 mb-1">
            <Gauge className="h-3.5 w-3.5" />
            Predictive Headroom
          </p>
          <h2 className="text-display-md text-noc-text">Capacity Saturation Countdown Radar</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'badge',
              overallRisk === 'critical'
                ? 'badge-danger'
                : overallRisk === 'warning'
                  ? 'badge-warning'
                  : 'badge-success'
            )}
          >
            {overallRisk === 'critical'
              ? 'Exhaustion Imminent'
              : overallRisk === 'warning'
                ? 'Capacity Constrained'
                : 'Optimal Headroom'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.kpiName} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-noc-text truncate" title={item.kpiName}>
                  {item.kpiName}
                </p>
                <p className="text-[11px] text-noc-muted truncate">Sheet: {item.sheetName}</p>
              </div>
              <span
                className={clsx(
                  'badge text-[10px] shrink-0',
                  item.risk === 'critical'
                    ? 'badge-danger'
                    : item.risk === 'warning'
                      ? 'badge-warning'
                      : 'badge-neutral'
                )}
              >
                {item.utilizationPct}% Peak
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-noc-muted">
                <span>Peak vs Limit</span>
                <span className="font-mono">
                  {item.peak.toLocaleString()} / {item.threshold.toLocaleString()} {item.unit}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-noc-border/80">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-700',
                    item.utilizationPct >= 90
                      ? 'bg-noc-danger'
                      : item.utilizationPct >= 75
                        ? 'bg-noc-warning'
                        : 'bg-noc-accent'
                  )}
                  style={{ width: `${Math.min(100, item.utilizationPct)}%` }}
                />
              </div>
            </div>

            <div className="border-t border-noc-border/60 pt-2 flex items-center justify-between text-[11px]">
              <span className="text-noc-muted">Projected Saturation:</span>
              <span
                className={clsx(
                  'font-semibold font-mono',
                  item.daysToSaturation !== null && item.daysToSaturation <= 30
                    ? 'text-noc-danger'
                    : item.daysToSaturation !== null && item.daysToSaturation <= 90
                      ? 'text-noc-warning'
                      : 'text-noc-textDim'
                )}
              >
                {item.daysToSaturation !== null ? `${item.daysToSaturation} days` : '> 90 days (Stable)'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function WorkbookReport() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [navMode, setNavMode] = useKpiNavMode();
  const { data: workbook, isLoading, refetch } = useQuery({
    queryKey: ['workbook', id],
    queryFn: () => workbookApi.get(id).then((r) => r.data.workbook),
    refetchInterval: (query) => {
      const stats = query.state.data?.stats;
      if (stats?.inProgress > 0) return 3000;
      const status = query.state.data?.status;
      return status && !['completed', 'failed'].includes(status) ? 3000 : false;
    },
  });

  const sortedKpis = useMemo(() => {
    if (!workbook?.kpis) return [];
    return [...workbook.kpis].sort((a, b) =>
      (a.kpiName || a.sheetName || '').localeCompare(b.kpiName || b.sheetName || '')
    );
  }, [workbook?.kpis]);

  const previewKpis = workbook?.preview?.kpis || [];
  /**
   * The workflow that claimed this workbook, when one did — the PS and CS
   * success-ratio exports. Their KPIs carry no target threshold, so the
   * threshold columns are theirs to leave out.
   */
  const workbookWorkflow = workbook?.preview?.workbookWorkflow || null;

  if (isLoading) return <WorkbookSkeleton />;

  if (!workbook) {
    return (
      <div className="card flex flex-col items-start gap-3 p-8">
        <span className="badge badge-neutral">Not found</span>
        <h1 className="text-display-md text-noc-text">This workbook is not available</h1>
        <p className="max-w-[56ch] text-sm text-noc-textDim">
          It may have been removed, or the link points at an id that no longer exists.
        </p>
        <Link to="/upload" className="btn-secondary mt-2">
          <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} />
          Back to upload
        </Link>
      </div>
    );
  }

  const navItems = sortedKpis.map((kpi) => ({
    id: kpi.reportId,
    label: kpi.kpiName || kpi.sheetName,
    status: kpi.status,
    subLabel: workbookWorkflow
      ? [kpi.listSummary?.granularity, kpi.listSummary?.average].filter(Boolean).join(' · ')
      : `${kpi.threshold ?? workbook.defaultThreshold ?? 99}% · ${kpi.listSummary?.granularity || ''}`,
  }));

  const stats = workbook.stats || {};
  const isProcessing = stats.inProgress > 0 || ['pending', 'processing'].includes(workbook.status);

  const activeKpi =
    activeTab !== 'overview'
      ? sortedKpis.find((k) => k.reportId === activeTab)
      : null;

  const inventoryRows = previewKpis.length ? previewKpis : sortedKpis;

  const overviewContent = (
    <div className="space-y-8">
      <PptExportPanel workbookId={id} workbook={workbook} sortedKpis={sortedKpis} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-noc-border pb-3">
          <div>
            <p className="eyebrow mb-1.5">At a glance</p>
            <h2 className="text-display-md text-noc-text">Processing summary</h2>
          </div>
          <p className="tabular shrink-0 text-xs text-noc-muted">
            {workbookWorkflow
              ? `${workbookWorkflow.name} · one report per KPI, each averaged per node, per data centre and combined`
              : `Default target ${workbook.defaultThreshold ?? 99}% · override per KPI in its tab`}
          </p>
        </div>

        <div className="card p-0">
          <dl className="grid grid-cols-2 lg:grid-cols-4">
            <Vital
              index={0}
              label="Data sheets"
              value={previewKpis.length || sortedKpis.length}
            />
            <Vital index={1} label="Completed" value={stats.completed || 0} tone="success" />
            <Vital
              index={2}
              label="Failed"
              value={stats.failed || 0}
              tone={stats.failed > 0 ? 'danger' : 'neutral'}
            />
            <Vital
              index={3}
              label="In progress"
              value={stats.inProgress || 0}
              tone={stats.inProgress > 0 ? 'pending' : 'neutral'}
            />
          </dl>
        </div>
      </section>

      {/* Multi-KPI Root-Cause & Correlation Radar */}
      <CorrelationRcaCard correlationAnalysis={workbook.correlationAnalysis} />

      {/* Capacity Saturation Countdown Radar */}
      <CapacityRadarCard capacityRadar={workbook.capacityRadar} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-noc-border pb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-muted">
            KPI inventory
          </h2>
          <p className="tabular shrink-0 text-xs text-noc-muted">
            {inventoryRows.length} Data sheet{inventoryRows.length === 1 ? '' : 's'} · select a row
            to open it
          </p>
        </div>

        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border bg-noc-bg/40 text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-5 py-3 font-medium">KPI</th>
                  <th className="px-5 py-3 font-medium">Sheet</th>
                  <th className="px-5 py-3 font-medium">Rows</th>
                  <th className="px-5 py-3 font-medium">Granularity</th>
                  <th className="px-5 py-3 font-medium">Valid</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  {!workbookWorkflow && (
                    <th className="px-5 py-3 font-medium">Threshold</th>
                  )}
                  <th className="px-5 py-3 font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((kpi) => {
                  const live = sortedKpis.find(
                    (k) => k.sheetName === kpi.sheetName || k.kpiName === kpi.kpiName
                  );
                  const open = () => live?.reportId && setActiveTab(live.reportId);
                  return (
                    <tr
                      key={kpi.sheetName || kpi.kpiName}
                      tabIndex={live?.reportId ? 0 : undefined}
                      role={live?.reportId ? 'button' : undefined}
                      className={clsx(
                        'border-b border-noc-border/40 transition-colors last:border-0',
                        live?.reportId && 'cursor-pointer hover:bg-noc-accent/[0.05]'
                      )}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          open();
                        }
                      }}
                    >
                      <td className="px-5 py-3 font-medium text-noc-text">{kpi.kpiName}</td>
                      <td className="px-5 py-3 text-xs text-noc-muted">{kpi.sheetName}</td>
                      <td className="px-5 py-3 font-mono text-xs text-noc-textDim">
                        {kpi.rowCount ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-noc-textDim">
                        {kpi.granularity || live?.listSummary?.granularity || '—'}
                      </td>
                      <td className="px-5 py-3">
                        {kpi.valid !== false ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-success">
                            <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-danger">
                            <X className="h-3.5 w-3.5" strokeWidth={2.25} /> No
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {live ? (
                          <StatusBadge status={live.status} />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-noc-muted">
                            <Minus className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} /> Queued
                          </span>
                        )}
                      </td>
                      {!workbookWorkflow && (
                        <td className="px-5 py-3 font-mono text-xs text-noc-textDim">
                          {live?.threshold ?? workbook.defaultThreshold ?? 99}%
                        </td>
                      )}
                      <td className="px-5 py-3 font-mono text-xs text-noc-text">
                        {live?.listSummary?.average || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {workbook.preview?.ignoredSheets?.length > 0 && (
          <p className="tabular text-xs text-noc-muted">
            {workbook.preview.ignoredSheetCount} non-data sheets were ignored (documentation,
            chart data, and similar).
          </p>
        )}
      </section>
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <Link
          to="/upload"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Back to upload
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-3xl">
            <p className="eyebrow">{workbookWorkflow ? workbookWorkflow.name : 'CMM workbook'}</p>
            <h1 className="mt-2 text-display-lg text-noc-text">KPI workbook</h1>
            <div className="tabular mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-noc-muted">
              <StatusBadge status={workbook.status} />
              <span className="h-3 w-px bg-noc-border" aria-hidden />
              <span className="truncate font-mono">{workbook.original_filename}</span>
              <span className="h-3 w-px bg-noc-border" aria-hidden />
              <span>
                {sortedKpis.length} KPI report{sortedKpis.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {isProcessing && (
            <button type="button" onClick={() => refetch()} className="btn-secondary shrink-0">
              <RefreshCw className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Refresh
            </button>
          )}
        </div>
      </header>

      <div
        className={clsx(
          navMode === 'sidebar' ? 'flex flex-col gap-6 lg:flex-row lg:items-start' : 'space-y-6'
        )}
      >
        <KpiNav
          activeId={activeTab}
          onSelect={setActiveTab}
          items={navItems}
          mode={navMode}
          onModeChange={setNavMode}
          className={navMode === 'sidebar' ? 'lg:sticky lg:top-20' : undefined}
        />

        <div className="min-w-0 flex-1">
          {activeTab === 'overview' && overviewContent}
          {activeKpi && (
            <KpiReportPanel
              reportId={activeKpi.reportId}
              workbookId={id}
              threshold={activeKpi.threshold ?? workbook.defaultThreshold ?? 99}
            />
          )}
        </div>
      </div>
    </div>
  );
}
