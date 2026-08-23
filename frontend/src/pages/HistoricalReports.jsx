import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSearch, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import clsx from 'clsx';
import { reportApi, workflowApi } from '../api';
import ReportHistoryRow, { HISTORY_GRID } from '../components/ReportHistoryRow';
import WorkbookHistoryRow from '../components/WorkbookHistoryRow';

const ICON_STROKE = 1.75;

function HistoryHeader() {
  return (
    <div
      className={clsx(
        HISTORY_GRID,
        'hidden border-b border-noc-border bg-noc-bg/60 px-4 py-2.5 md:grid'
      )}
    >
      <span />
      <span />
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        Report
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        Status
      </span>
      <span className="hidden text-right text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted lg:block">
        Coverage
      </span>
      <span className="hidden text-right text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted xl:block">
        Detail
      </span>
      <span className="text-right text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        Processed
      </span>
      <span />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-noc-border bg-noc-bg/60 px-4 py-3">
        <div className="skeleton h-2.5 w-32" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-noc-border/60 px-4 py-4 last:border-0">
          <div className="skeleton h-4 w-4 shrink-0 rounded" />
          <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-44" />
            <div className="skeleton h-2.5 w-64" />
          </div>
          <div className="skeleton hidden h-5 w-20 rounded-md md:block" />
          <div className="skeleton hidden h-3 w-24 md:block" />
          <div className="skeleton h-8 w-20 shrink-0 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function HistoricalReports() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [workflowSlug, setWorkflowSlug] = useState('');

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list().then((r) => r.data.workflows),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['history', page, status, workflowSlug],
    queryFn: () =>
      reportApi
        .list({ page, limit: 15, status: status || undefined, workflowSlug: workflowSlug || undefined, grouped: true })
        .then((r) => r.data),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const items = data?.items ?? [];
  const filtered = Boolean(status || workflowSlug);

  const handleDownload = async (reportId) => {
    const res = await reportApi.download(reportId);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${reportId}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Archive</p>
          <h1 className="mt-2 text-display-md text-noc-text">Historical reports</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-noc-textDim">
            CMM workbooks appear as one grouped entry. Expand a row to see every KPI report inside
            it.
          </p>
        </div>
        {data && (
          <p className="tabular text-xs text-noc-muted">
            {data.total} {data.total === 1 ? 'entry' : 'entries'}
          </p>
        )}
      </header>

      <div className="card flex flex-wrap items-end gap-4 py-4">
        <div className="min-w-[10rem]">
          <label
            htmlFor="history-status"
            className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted"
          >
            Status
          </label>
          <select
            id="history-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="input-field w-auto"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="min-w-[14rem]">
          <label
            htmlFor="history-workflow"
            className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted"
          >
            Workflow
          </label>
          <select
            id="history-workflow"
            value={workflowSlug}
            onChange={(e) => {
              setWorkflowSlug(e.target.value);
              setPage(1);
            }}
            className="input-field w-auto"
          >
            <option value="">All workflows (incl. workbooks)</option>
            {workflows?.map((wf) => (
              <option key={wf.slug} value={wf.slug}>
                {wf.name} (single reports only)
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <HistorySkeleton />
      ) : (
        <div className="card overflow-hidden p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-noc-border bg-noc-bg text-noc-muted">
                <FileSearch className="h-5 w-5" strokeWidth={ICON_STROKE} />
              </span>
              <p className="mt-4 text-sm font-medium text-noc-text">
                {filtered ? 'No reports match these filters' : 'Nothing has been processed yet'}
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-noc-muted">
                {filtered
                  ? 'Widen the status or workflow filter to see more of the archive.'
                  : 'Upload a CMM workbook or a single KPI export and it will appear here with its charts and summary.'}
              </p>
              {filtered ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatus('');
                    setWorkflowSlug('');
                    setPage(1);
                  }}
                  className="btn-secondary mt-5 px-3 py-2 text-xs"
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/upload" className="btn-primary mt-5 px-3 py-2 text-xs">
                  <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                  Upload a file
                </Link>
              )}
            </div>
          ) : (
            <>
              <HistoryHeader />
              {items.map((item) =>
                item.type === 'workbook' ? (
                  <WorkbookHistoryRow key={item.id} item={item} />
                ) : (
                  <ReportHistoryRow key={item.id} report={item} onDownload={handleDownload} />
                )
              )}
            </>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-noc-border bg-noc-bg/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                Previous
              </button>
              <span className="tabular text-xs text-noc-muted">
                Page {page} of {totalPages} · {data.total} total
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
