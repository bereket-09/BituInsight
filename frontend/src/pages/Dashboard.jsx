import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

function StatTile({ label, value, icon: Icon, accent = 'accent' }) {
  const accents = {
    accent: 'text-noc-accent bg-noc-accent/10',
    green: 'text-green-500 dark:text-green-400 bg-green-500/10',
    orange: 'text-orange-500 dark:text-orange-400 bg-orange-500/10',
    red: 'text-red-500 dark:text-red-400 bg-red-500/10',
  };

  return (
    <div className="stat-glow">
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-noc-muted">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-noc-text">{value ?? 0}</p>
        </div>
        {Icon && (
          <div className={clsx('rounded-xl p-2.5', accents[accent] || accents.accent)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading) return <LoadingSpinner label="Loading dashboard..." />;
  if (error) return <div className="text-red-400">Failed to load dashboard</div>;

  const { stats, workbookStats, kpiInWorkbooks, recentReports, recentWorkbooks, workflowUsage } =
    data;
  const wb = workbookStats || {};
  const maxWf = Math.max(...(workflowUsage?.map((w) => Number(w.count)) || [1]), 1);

  return (
    <div className="space-y-8">
      <section className="dashboard-hero">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-noc-accent/30 bg-noc-accent/10 px-3 py-1 text-xs font-medium text-noc-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Telecom KPI Command Center
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              BituInsight
              <span className="block text-lg font-normal text-noc-muted sm:inline sm:ml-2 sm:text-xl">
                Operations Dashboard
              </span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-noc-text-dim sm:text-base">
              Monitor CMM workbook processing, single KPI uploads, and executive-ready chart exports
              — all in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/upload" className="btn-primary">
                <Upload className="h-4 w-4" />
                Upload workbook
              </Link>
              <Link to="/reports" className="btn-secondary">
                <BarChart3 className="h-4 w-4" />
                View history
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:min-w-[280px]">
            <div className="rounded-xl border border-noc-border/80 bg-noc-surface/80 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-noc-muted">
                KPI reports
              </p>
              <p className="mt-1 text-2xl font-bold text-noc-accent">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-noc-border/80 bg-noc-surface/80 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-noc-muted">
                Workbooks
              </p>
              <p className="mt-1 text-2xl font-bold text-noc-accent">{wb.total || 0}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-noc-muted">Completion rate</span>
                <Zap className="h-4 w-4 text-green-500" />
              </div>
              <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">
                {stats.total
                  ? `${Math.round((Number(stats.completed) / Number(stats.total)) * 100)}%`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Completed reports" value={stats.completed} icon={CheckCircle2} accent="green" />
        <StatTile label="In progress" value={stats.in_progress} icon={Clock} accent="orange" />
        <StatTile label="Failed" value={stats.failed} icon={XCircle} accent="red" />
        <StatTile label="KPIs in workbooks" value={kpiInWorkbooks} icon={Layers} accent="accent" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-noc-accent" />
              <h2 className="text-sm font-semibold">Recent CMM workbooks</h2>
            </div>
            <Link
              to="/reports"
              className="flex items-center gap-1 text-xs text-noc-accent hover:underline"
            >
              All history <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentWorkbooks?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-noc-border py-12 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-noc-muted/50" />
              <p className="mt-3 text-sm text-noc-muted">No workbooks yet</p>
              <Link to="/upload" className="mt-3 inline-flex text-xs text-noc-accent hover:underline">
                Upload your first CMM file
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentWorkbooks.map((wbRow) => (
                <Link
                  key={wbRow.id}
                  to={`/workbooks/${wbRow.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-noc-border/60 bg-noc-surface/50 px-4 py-3 transition-all hover:border-noc-accent/40 hover:bg-noc-accent/5"
                >
                  <div className="rounded-lg bg-noc-accent/10 p-2.5 text-noc-accent transition-transform group-hover:scale-105">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium group-hover:text-noc-accent">
                      {wbRow.original_filename}
                    </p>
                    <p className="text-xs text-noc-muted">
                      {wbRow.completed_kpis}/{wbRow.kpi_count} KPIs ·{' '}
                      {new Date(wbRow.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={wbRow.status} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-noc-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-noc-accent" />
            <h2 className="text-sm font-semibold">Workflow usage</h2>
          </div>
          {workflowUsage?.length === 0 ? (
            <p className="text-sm text-noc-muted">No workflow data yet</p>
          ) : (
            <div className="space-y-4">
              {workflowUsage.map((wf) => (
                <div key={wf.slug}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="truncate pr-2">{wf.name}</span>
                    <span className="font-mono text-noc-accent">{wf.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-noc-surface">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-noc-accent to-violet-500 transition-all duration-500"
                      style={{ width: `${(Number(wf.count) / maxWf) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-lg border border-noc-border/60 bg-noc-surface/40 p-3">
            <p className="text-xs font-medium text-noc-muted">Workbook pipeline</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-lg font-bold text-green-500">{wb.completed || 0}</p>
                <p className="text-noc-muted">Done</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-500">{wb.in_progress || 0}</p>
                <p className="text-noc-muted">Active</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400">{wb.failed || 0}</p>
                <p className="text-noc-muted">Failed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent single KPI reports</h2>
          <Link
            to="/reports"
            className="flex items-center gap-1 text-xs text-noc-accent hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentReports?.length === 0 ? (
          <p className="py-6 text-center text-sm text-noc-muted">No standalone reports yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
                  <th className="pb-3 pr-4 font-medium">Workflow</th>
                  <th className="pb-3 pr-4 font-medium">File</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-noc-border/50 transition-colors hover:bg-noc-surface/50"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        to={`/reports/${report.id}`}
                        className="font-medium text-noc-accent hover:underline"
                      >
                        {report.workflow_name}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate py-3 pr-4 text-noc-muted">
                      {report.original_filename || '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="py-3 text-noc-muted">
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
