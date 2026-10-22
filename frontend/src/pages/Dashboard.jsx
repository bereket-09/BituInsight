import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
  Upload,
  Sparkles,
  Layers,
  Search,
  CheckCircle2,
  Clock,
  TrendingUp,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../api';
import StatusBadge from '../components/StatusBadge';
import { useSidebar } from '../context/SidebarContext';

const ICON_STROKE = 1.75;

function StatCard({ icon: Icon, label, value, subtext, trend, tone = 'accent' }) {
  const toneMap = {
    accent: 'bg-noc-accent/10 text-noc-accent border-noc-accent/20',
    success: 'bg-noc-success/10 text-noc-success border-noc-success/20',
    info: 'bg-noc-info/10 text-noc-info border-noc-info/20',
    warning: 'bg-noc-warning/10 text-noc-warning border-noc-warning/20',
  };

  return (
    <div className="card group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-noc-accent/40">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-noc-muted">
            {label}
          </p>
          <p className="tabular mt-2 font-display text-3xl font-bold tracking-tight text-noc-text">
            {value}
          </p>
          {subtext && (
            <p className="mt-1 text-xs text-noc-textDim">
              {subtext}
            </p>
          )}
        </div>
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            toneMap[tone] || toneMap.accent
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-noc-border/60 pt-2.5 text-[11px] text-noc-muted">
          <TrendingUp className="h-3 w-3 text-noc-accent" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, actionTo }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-noc-border p-8 text-center sm:p-12">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-noc-border bg-noc-card text-noc-muted">
        <Icon className="h-6 w-6" strokeWidth={ICON_STROKE} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-noc-text">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">{description}</p>
      {actionTo && (
        <Link to={actionTo} className="btn-secondary mt-5 text-xs">
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        </Link>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-36 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 w-full rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="skeleton h-96 w-full rounded-2xl lg:col-span-8" />
        <div className="skeleton h-96 w-full rounded-2xl lg:col-span-4" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { openAiCopilot } = useSidebar();
  const [activityTab, setActivityTab] = useState('workbooks'); // 'workbooks' | 'reports'
  const [searchFilter, setSearchFilter] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then((r) => r.data),
    refetchInterval: 12000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-noc-danger/30 bg-noc-danger/10 text-noc-danger">
          <AlertTriangle className="h-6 w-6" strokeWidth={ICON_STROKE} />
        </span>
        <h2 className="mt-4 text-base font-semibold text-noc-text">Dashboard Service Unavailable</h2>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-noc-muted">
          Could not communicate with the analytics backend. Ingested files and historical reports remain intact.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-secondary mt-6 gap-2 text-xs"
        >
          <RefreshCw
            className={clsx('h-3.5 w-3.5', isFetching && 'animate-spin')}
            strokeWidth={ICON_STROKE}
          />
          Retry Connection
        </button>
      </div>
    );
  }

  const { stats, workbookStats, kpiInWorkbooks, recentReports = [], recentWorkbooks = [], workflowUsage = [] } =
    data || {};
  const wb = workbookStats || {};

  const total = Number(stats?.total) || 0;
  const completed = Number(stats?.completed) || 0;
  const inProgress = Number(stats?.in_progress) || 0;
  const failed = Number(stats?.failed) || 0;
  const completionRate = total ? Math.round((completed / total) * 100) : 100;

  const totalWb = Number(wb.total) || 0;
  const maxWf = Math.max(...(workflowUsage.map((w) => Number(w.count)) || [1]), 1);

  // Filtered lists
  const filteredWorkbooks = recentWorkbooks.filter((w) =>
    (w.original_filename || '').toLowerCase().includes(searchFilter.toLowerCase())
  );
  const filteredReports = recentReports.filter(
    (r) =>
      (r.workflow_name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
      (r.original_filename || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ===================== HERO OPERATIONS BANNER ===================== */}
      <section className="relative overflow-hidden rounded-3xl border border-noc-border/90 bg-gradient-to-br from-noc-surface via-noc-surface to-noc-card p-6 shadow-sm sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-noc-accent animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-accent">
                Core Insight Platform · Operational
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-noc-text sm:text-3xl">
              Telecom KPI & Network Intelligence
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm leading-relaxed text-noc-textDim">
              Automated ingestion for multi-sheet CMM workbooks, seasonal anomaly detection,
              capacity headroom forecasting, and executive PowerPoint export generation.
            </p>
          </div>

          {/* Quick Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/upload" className="btn-primary text-xs sm:text-sm">
              <Upload className="h-4 w-4" strokeWidth={2} />
              Upload Workbook
            </Link>
            <button
              type="button"
              onClick={openAiCopilot}
              className="btn-secondary gap-2 text-xs sm:text-sm"
            >
              <Sparkles className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              Ask Copilot
            </button>
            <Link to="/reports" className="btn-secondary text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" strokeWidth={ICON_STROKE} />
              History
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== OPERATIONAL METRICS CARDS ===================== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileSpreadsheet}
          label="CMM Workbooks"
          value={totalWb}
          subtext={`${Number(wb.completed) || 0} completed · ${Number(wb.in_progress) || 0} processing`}
          tone="accent"
          trend="Workbook Engine active"
        />
        <StatCard
          icon={BarChart3}
          label="KPI Reports"
          value={total}
          subtext={`${completed} processed · ${Number(kpiInWorkbooks) || 0} via workbooks`}
          tone="info"
          trend={`${completionRate}% overall success rate`}
        />
        <StatCard
          icon={ShieldCheck}
          label="Pipeline Success"
          value={`${completionRate}%`}
          subtext={`${failed === 0 ? 'Zero ingestion errors' : `${failed} failed runs detected`}`}
          tone={failed > 0 ? 'warning' : 'success'}
          trend="Robust error recovery"
        />
        <StatCard
          icon={Layers}
          label="Active Workflows"
          value={workflowUsage.length || '5'}
          subtext="Throughput, SAAU, Users, Volume"
          tone="accent"
          trend="Pluggable KPI modules"
        />
      </div>

      {/* ===================== AI INTELLIGENCE & TELEMETRY BANNER ===================== */}
      <section className="rounded-2xl border border-noc-accent/25 bg-gradient-to-r from-noc-accent/5 via-noc-surface to-noc-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noc-accent/15 text-noc-accent border border-noc-accent/30">
              <Sparkles className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-noc-text">
                  Automated Intelligence Layer Active
                </h3>
                <span className="badge badge-success text-[10px]">Seasonality Aware</span>
              </div>
              <p className="mt-1 text-xs text-noc-textDim leading-relaxed max-w-2xl">
                Every uploaded dataset is analyzed against hour-of-day baselines to filter out routine traffic swings.
                Capacity headroom, robust z-score outliers, and executive narratives are attached automatically.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openAiCopilot}
              className="btn-secondary text-xs px-3 py-1.5 border-noc-accent/30 hover:border-noc-accent"
            >
              Ask AI Copilot
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>

      {/* ===================== MAIN SECTION: ACTIVITY HUB & WORKFLOW USAGE ===================== */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Recent Ingestion Activity with Switcher & Search */}
        <section className="card flex flex-col p-6 lg:col-span-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-noc-border/80 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivityTab('workbooks')}
                className={clsx(
                  'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
                  activityTab === 'workbooks'
                    ? 'bg-noc-accent text-white shadow-sm'
                    : 'text-noc-muted hover:bg-noc-surface hover:text-noc-text'
                )}
              >
                CMM Workbooks ({recentWorkbooks.length})
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('reports')}
                className={clsx(
                  'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
                  activityTab === 'reports'
                    ? 'bg-noc-accent text-white shadow-sm'
                    : 'text-noc-muted hover:bg-noc-surface hover:text-noc-text'
                )}
              >
                Single KPI Reports ({recentReports.length})
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-noc-muted" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter files..."
                className="input-field py-1.5 pl-8 pr-3 text-xs w-full sm:w-48"
              />
            </div>
          </div>

          {/* Activity Content */}
          <div className="mt-4 flex-1">
            {activityTab === 'workbooks' ? (
              filteredWorkbooks.length === 0 ? (
                <EmptyState
                  icon={FileSpreadsheet}
                  title="No CMM workbooks found"
                  description="Upload a multi-sheet CMM Excel export to validate, parse and chart all KPIs together."
                  actionLabel="Upload Workbook"
                  actionTo="/upload"
                />
              ) : (
                <ul className="space-y-2.5">
                  {filteredWorkbooks.map((wbRow) => {
                    const done = Number(wbRow.completed_kpis) || 0;
                    const count = Number(wbRow.kpi_count) || 0;
                    const pct = count ? Math.round((done / count) * 100) : 0;

                    return (
                      <li key={wbRow.id}>
                        <Link
                          to={`/workbooks/${wbRow.id}`}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-noc-border/80 bg-noc-surface/50 p-4 transition-all hover:border-noc-accent/40 hover:bg-noc-card"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <FileSpreadsheet className="h-4 w-4 shrink-0 text-noc-accent" />
                              <p className="truncate text-sm font-semibold text-noc-text group-hover:text-noc-accent transition-colors">
                                {wbRow.original_filename}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-noc-muted">
                              {done} of {count} KPI sheets processed · {new Date(wbRow.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="w-28 sm:w-32">
                              <div className="flex justify-between text-[10px] text-noc-muted mb-1">
                                <span>Progress</span>
                                <span className="font-semibold text-noc-text">{pct}%</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-noc-border/80">
                                <div
                                  className="h-full rounded-full bg-noc-accent transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            <StatusBadge status={wbRow.status} />
                            <ArrowRight className="h-4 w-4 text-noc-muted group-hover:text-noc-accent group-hover:translate-x-1 transition-all" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : filteredReports.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No single KPI reports found"
                description="Upload an individual KPI sheet for focused executive chart sets."
                actionLabel="Upload File"
                actionTo="/upload"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-noc-border/80 text-[11px] font-semibold uppercase tracking-wider text-noc-muted">
                      <th className="pb-3 pr-4">Workflow</th>
                      <th className="pb-3 pr-4">File Name</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 text-right">Processed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-noc-border/60">
                    {filteredReports.map((report) => (
                      <tr
                        key={report.id}
                        className="transition-colors hover:bg-noc-accent/5"
                      >
                        <td className="py-3.5 pr-4">
                          <Link
                            to={`/reports/${report.id}`}
                            className="font-semibold text-noc-text hover:text-noc-accent transition-colors"
                          >
                            {report.workflow_name || report.workflow_slug}
                          </Link>
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-noc-textDim max-w-[200px] truncate">
                          {report.original_filename || '—'}
                        </td>
                        <td className="py-3.5 pr-4">
                          <StatusBadge status={report.status} />
                        </td>
                        <td className="py-3.5 text-right tabular text-noc-muted">
                          {new Date(report.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Right 4 Cols: Workflow Distribution & Quick Links */}
        <div className="space-y-6 lg:col-span-4">
          {/* Workflow Usage */}
          <section className="card p-6">
            <div className="flex items-center gap-2 border-b border-noc-border/80 pb-3">
              <Activity className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              <h2 className="text-sm font-semibold text-noc-text">Workflow Distribution</h2>
            </div>

            {workflowUsage.length === 0 ? (
              <p className="mt-4 text-xs text-noc-muted leading-relaxed">
                Distribution will populate automatically as files and workbooks are ingested.
              </p>
            ) : (
              <ul className="mt-5 space-y-4">
                {workflowUsage.map((wf) => {
                  const cnt = Number(wf.count) || 0;
                  const pct = Math.round((cnt / maxWf) * 100);

                  return (
                    <li key={wf.slug} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-noc-text">{wf.name}</span>
                        <span className="tabular font-semibold text-noc-muted">{cnt} runs</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-noc-border/80">
                        <div
                          className="h-full rounded-full bg-noc-accent transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Platform Information Card */}
          <section className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-noc-muted" strokeWidth={ICON_STROKE} />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-noc-muted">
                Executive Exports
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-noc-textDim">
              Generate pixel-perfect PowerPoint slides and Microsoft Teams cards for any processed report.
            </p>
            <div className="pt-2">
              <Link
                to="/reports"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-accent hover:underline"
              >
                <span>Browse historical reports</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
