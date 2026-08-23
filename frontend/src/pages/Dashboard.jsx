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
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../api';
import StatusBadge from '../components/StatusBadge';

const ICON_STROKE = 1.75;

/* A ledger cell: quiet label, figure carries the weight. */
function LedgerCell({ label, value }) {
  return (
    <div className="flex-1 px-3 first:pl-0 last:pr-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">{label}</dt>
      <dd className="tabular mt-1 text-lg font-semibold leading-none text-noc-text">{value}</dd>
    </div>
  );
}

/* Pipeline rows share one scale, so the bars are directly comparable. */
function PipelineRow({ label, value, share, tone }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-noc-textDim">{label}</span>
        <span className="tabular text-xl font-semibold leading-none text-noc-text">{value}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-noc-border/70">
        <div
          className={clsx('h-full rounded-full transition-[width] duration-700 ease-out', tone)}
          style={{ width: `${share}%` }}
        />
      </div>
    </li>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, actionTo, compact = false }) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center rounded-2xl border border-dashed border-noc-border text-center',
        compact ? 'px-5 py-8' : 'px-6 py-12'
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-noc-border bg-noc-bg text-noc-muted">
        <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} />
      </span>
      <p className="mt-4 text-sm font-medium text-noc-text">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">{description}</p>
      {actionTo && (
        <Link to={actionTo} className="btn-secondary mt-5 px-3 py-2 text-xs">
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        </Link>
      )}
    </div>
  );
}

/* Skeletons trace the real layout: hero, then the 4/8 and 8/4 bands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="dashboard-hero">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-10 w-64" />
            <div className="skeleton h-4 w-full max-w-md" />
            <div className="flex gap-3 pt-3">
              <div className="skeleton h-10 w-40 rounded-xl" />
              <div className="skeleton h-10 w-32 rounded-xl" />
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="skeleton h-44 w-full rounded-2xl" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="card lg:col-span-4">
          <div className="skeleton h-3 w-24" />
          <div className="mt-6 space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-1 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-8">
          <div className="skeleton h-3 w-40" />
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-noc-danger/30 bg-noc-danger/10 text-noc-danger">
          <AlertTriangle className="h-5 w-5" strokeWidth={ICON_STROKE} />
        </span>
        <p className="mt-4 text-sm font-medium text-noc-text">Dashboard could not be loaded</p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">
          The service did not respond. Your reports are unaffected — retry in a moment.
        </p>
        <button type="button" onClick={() => refetch()} className="btn-secondary mt-5 px-3 py-2 text-xs">
          <RefreshCw
            className={clsx('h-3.5 w-3.5', isFetching && 'animate-spin')}
            strokeWidth={ICON_STROKE}
          />
          Try again
        </button>
      </div>
    );
  }

  const { stats, workbookStats, kpiInWorkbooks, recentReports, recentWorkbooks, workflowUsage } =
    data;
  const wb = workbookStats || {};

  const total = Number(stats?.total) || 0;
  const completed = Number(stats?.completed) || 0;
  const inProgress = Number(stats?.in_progress) || 0;
  const failed = Number(stats?.failed) || 0;
  const completionRate = total ? Math.round((completed / total) * 100) : null;

  const share = (n) => (total ? (n / total) * 100 : 0);
  const maxWf = Math.max(...(workflowUsage?.map((w) => Number(w.count)) || [1]), 1);

  const pipeline = [
    { label: 'Completed', value: completed, share: share(completed), tone: 'bg-noc-success' },
    { label: 'In progress', value: inProgress, share: share(inProgress), tone: 'bg-noc-info' },
    { label: 'Failed', value: failed, share: share(failed), tone: 'bg-noc-danger' },
  ];

  return (
    <div className="stagger space-y-6">
      {/*
        Hero carries the whole summary moment: identity and intent on the left,
        one dominant figure plus a three-item ledger on the right. Nothing below
        competes with it for first read.
      */}
      <section className="dashboard-hero">
        <div className="relative z-10 grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="eyebrow">Operations overview</p>
            <h1 className="mt-3 text-display-lg text-noc-text">Core Insight</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-noc-textDim sm:text-base">
              Track CMM workbook processing, single KPI uploads and executive chart exports from a
              single view.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/upload" className="btn-primary">
                <Upload className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Upload workbook
              </Link>
              <Link to="/reports" className="btn-secondary">
                <BarChart3 className="h-4 w-4" strokeWidth={ICON_STROKE} />
                View history
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-noc-border/70 bg-noc-bg/60 p-5 backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-muted">
                  Completion rate
                </p>
                <span className="tabular text-[11px] text-noc-muted">
                  {completed} of {total}
                </span>
              </div>

              <p className="tabular mt-2 text-display-xl text-noc-text">
                {completionRate === null ? '—' : `${completionRate}%`}
              </p>

              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-noc-border/70"
                role="progressbar"
                aria-valuenow={completionRate ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Report completion rate"
              >
                <div
                  className="h-full rounded-full bg-noc-accent transition-[width] duration-700 ease-out"
                  style={{ width: `${completionRate ?? 0}%` }}
                />
              </div>

              <dl className="mt-5 flex divide-x divide-noc-border/70 border-t border-noc-border/70 pt-4">
                <LedgerCell label="KPI reports" value={total} />
                <LedgerCell label="Workbooks" value={Number(wb.total) || 0} />
                <LedgerCell label="In workbooks" value={Number(kpiInWorkbooks) || 0} />
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Band one is deliberately 4/8 — the pipeline is a narrow reference column
          beside the list people actually click through. */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-noc-text">Report pipeline</h2>
            <span className="tabular text-[11px] text-noc-muted">{total} total</span>
          </div>

          <ul className="mt-5 space-y-5">
            {pipeline.map((row) => (
              <PipelineRow key={row.label} {...row} />
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-noc-border/70 bg-noc-bg/60 p-3 lg:mt-auto">
            <p className="text-[10px] uppercase tracking-[0.12em] text-noc-muted">
              Workbook pipeline
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Done', value: Number(wb.completed) || 0, tone: 'text-noc-success' },
                { label: 'Active', value: Number(wb.in_progress) || 0, tone: 'text-noc-info' },
                { label: 'Failed', value: Number(wb.failed) || 0, tone: 'text-noc-danger' },
              ].map((cell) => (
                <div key={cell.label}>
                  <dd className={clsx('tabular text-lg font-semibold leading-none', cell.tone)}>
                    {cell.value}
                  </dd>
                  <dt className="mt-1.5 text-[11px] text-noc-muted">{cell.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="card lg:col-span-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-noc-text">Recent CMM workbooks</h2>
            <Link
              to="/reports"
              className="group inline-flex items-center gap-1 rounded-md text-xs font-medium text-noc-accent"
            >
              All history
              <ArrowRight
                className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
          </div>

          {!recentWorkbooks?.length ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No workbooks processed yet"
              description="Upload a CMM workbook and every KPI sheet inside it is validated, charted and stored here."
              actionLabel="Upload a workbook"
              actionTo="/upload"
            />
          ) : (
            <ul className="-mx-2 space-y-1">
              {recentWorkbooks.map((wbRow) => {
                const done = Number(wbRow.completed_kpis) || 0;
                const count = Number(wbRow.kpi_count) || 0;
                return (
                  <li key={wbRow.id}>
                    <Link
                      to={`/workbooks/${wbRow.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-transparent px-3 py-3 transition-all hover:border-noc-border hover:bg-noc-accent/5 active:translate-y-px"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-noc-text transition-colors group-hover:text-noc-accent">
                          {wbRow.original_filename}
                        </p>
                        <p className="tabular mt-1 text-xs text-noc-muted">
                          {done}/{count} KPIs · {new Date(wbRow.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="hidden w-24 shrink-0 sm:block">
                        <div className="h-1 overflow-hidden rounded-full bg-noc-border/70">
                          <div
                            className="h-full rounded-full bg-noc-accent"
                            style={{ width: `${count ? (done / count) * 100 : 0}%` }}
                          />
                        </div>
                      </div>

                      <StatusBadge status={wbRow.status} />

                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-noc-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                        strokeWidth={ICON_STROKE}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Band two mirrors the first, flipped — the wide element stays on the
          reading edge while the narrow reference column alternates sides. */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="card lg:col-span-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-noc-text">Recent single KPI reports</h2>
            <Link
              to="/reports"
              className="group inline-flex items-center gap-1 rounded-md text-xs font-medium text-noc-accent"
            >
              View all
              <ArrowRight
                className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
          </div>

          {!recentReports?.length ? (
            <EmptyState
              icon={BarChart3}
              title="No single KPI reports yet"
              description="Upload one KPI export on its own when you need a focused chart set rather than a full workbook."
              actionLabel="Upload a file"
              actionTo="/upload"
              compact
            />
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-noc-border text-left">
                    <th className="pb-2.5 pr-4 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                      Workflow
                    </th>
                    <th className="pb-2.5 pr-4 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                      File
                    </th>
                    <th className="pb-2.5 pr-4 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                      Status
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentReports.map((report) => (
                    <tr
                      key={report.id}
                      className="border-b border-noc-border/50 transition-colors last:border-0 hover:bg-noc-accent/5"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          to={`/reports/${report.id}`}
                          className="font-medium text-noc-text underline-offset-4 transition-colors hover:text-noc-accent hover:underline"
                        >
                          {report.workflow_name}
                        </Link>
                      </td>
                      <td className="max-w-[220px] truncate py-3 pr-4 font-mono text-xs text-noc-muted">
                        {report.original_filename || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="tabular py-3 text-right text-xs text-noc-muted">
                        {new Date(report.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card lg:col-span-4">
          <div className="mb-5 flex items-center gap-2">
            <Activity className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
            <h2 className="text-sm font-semibold text-noc-text">Workflow usage</h2>
          </div>

          {!workflowUsage?.length ? (
            <p className="text-xs leading-relaxed text-noc-muted">
              Usage builds up as reports are processed. Each workflow you run appears here with its
              share of the total.
            </p>
          ) : (
            <ul className="space-y-4">
              {workflowUsage.map((wf) => (
                <li key={wf.slug}>
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-noc-textDim">{wf.name}</span>
                    <span className="tabular font-medium text-noc-text">{wf.count}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-noc-border/70">
                    <div
                      className="h-full rounded-full bg-noc-accent transition-[width] duration-700 ease-out"
                      style={{ width: `${(Number(wf.count) / maxWf) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
