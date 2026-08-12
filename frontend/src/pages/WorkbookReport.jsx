import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import clsx from 'clsx';
import { workbookApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import KpiReportPanel from '../components/KpiReportPanel';
import KpiNav, { useKpiNavMode } from '../components/KpiNav';
import PptExportPanel from '../components/PptExportPanel';

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

  if (isLoading) return <LoadingSpinner label="Loading workbook..." />;
  if (!workbook) return <div className="text-red-400">Workbook not found</div>;

  const navItems = sortedKpis.map((kpi) => ({
    id: kpi.reportId,
    label: kpi.kpiName || kpi.sheetName,
    status: kpi.status,
    subLabel: `${kpi.threshold ?? workbook.defaultThreshold ?? 99}% · ${kpi.listSummary?.granularity || ''}`,
  }));

  const stats = workbook.stats || {};
  const isProcessing = stats.inProgress > 0 || ['pending', 'processing'].includes(workbook.status);

  const activeKpi =
    activeTab !== 'overview'
      ? sortedKpis.find((k) => k.reportId === activeTab)
      : null;

  const overviewContent = (
    <div className="space-y-6">
          <PptExportPanel workbookId={id} workbook={workbook} sortedKpis={sortedKpis} />

          <div className="card flex flex-wrap items-center gap-4 border-l-4 border-l-noc-accent">
            <p className="text-sm text-noc-muted">
              Default target threshold:{' '}
              <strong className="text-noc-text">{workbook.defaultThreshold ?? 99}%</strong>
              {' '}(override per KPI in each KPI tab)
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <p className="text-xs text-noc-muted">Data sheets</p>
              <p className="mt-1 text-2xl font-bold">{previewKpis.length || sortedKpis.length}</p>
            </div>
        <div className="card">
          <p className="text-xs text-noc-muted">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{stats.completed || 0}</p>
        </div>
        <div className="card">
          <p className="text-xs text-noc-muted">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{stats.failed || 0}</p>
        </div>
        <div className="card">
          <p className="text-xs text-noc-muted">In progress</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{stats.inProgress || 0}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-4 text-sm font-semibold">KPI inventory (Data sheets only)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
              <th className="pb-2 pr-4">KPI</th>
              <th className="pb-2 pr-4">Sheet</th>
              <th className="pb-2 pr-4">Rows</th>
              <th className="pb-2 pr-4">Granularity</th>
              <th className="pb-2 pr-4">Valid</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Threshold</th>
                  <th className="pb-2">Average</th>
            </tr>
          </thead>
          <tbody>
            {(previewKpis.length ? previewKpis : sortedKpis).map((kpi) => {
              const live = sortedKpis.find(
                (k) => k.sheetName === kpi.sheetName || k.kpiName === kpi.kpiName
              );
              return (
                <tr
                  key={kpi.sheetName || kpi.kpiName}
                  className="cursor-pointer border-b border-noc-border/30 hover:bg-noc-accent/5"
                  onClick={() => live?.reportId && setActiveTab(live.reportId)}
                >
                  <td className="py-2.5 pr-4 font-medium">{kpi.kpiName}</td>
                  <td className="py-2.5 pr-4 text-xs text-noc-muted">{kpi.sheetName}</td>
                  <td className="py-2.5 pr-4 font-mono">{kpi.rowCount ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    {kpi.granularity || live?.listSummary?.granularity || '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    {kpi.valid !== false ? (
                      <span className="inline-flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400">
                        <XCircle className="h-3.5 w-3.5" /> No
                      </span>
                    )}
                  </td>
                      <td className="py-2.5 pr-4">
                        {live ? (
                          <StatusBadge status={live.status} />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-noc-muted">
                            <Clock className="h-3.5 w-3.5" /> —
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        {live?.threshold ?? workbook.defaultThreshold ?? 99}%
                      </td>
                      <td className="py-2.5">{live?.listSummary?.average || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {workbook.preview?.ignoredSheets?.length > 0 && (
        <div className="card">
          <p className="text-xs text-noc-muted">
            Ignored {workbook.preview.ignoredSheetCount} non-data sheets (Documentation, Chart
            data, etc.)
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/upload"
          className="mb-3 inline-flex items-center gap-1 text-xs text-noc-muted hover:text-noc-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back to upload
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">CMM KPI Workbook</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-noc-muted">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="truncate">{workbook.original_filename}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={workbook.status} />
            {isProcessing && (
              <button type="button" onClick={() => refetch()} className="btn-secondary text-xs">
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

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
