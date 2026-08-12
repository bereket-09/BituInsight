import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter } from 'lucide-react';
import { reportApi, workflowApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import ReportHistoryRow from '../components/ReportHistoryRow';
import WorkbookHistoryRow from '../components/WorkbookHistoryRow';

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
      <div>
        <h1 className="text-2xl font-bold">Historical Reports</h1>
        <p className="mt-1 text-sm text-noc-muted">
          CMM workbooks appear as one grouped entry; expand to see all KPI reports inside
        </p>
      </div>

      <div className="card flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-noc-muted" />
          <select
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
        <select
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

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="card overflow-hidden p-0">
          {data?.items?.length === 0 ? (
            <div className="py-16 text-center text-noc-muted">
              <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No reports found
            </div>
          ) : (
            data.items.map((item) =>
              item.type === 'workbook' ? (
                <WorkbookHistoryRow key={item.id} item={item} />
              ) : (
                <ReportHistoryRow key={item.id} report={item} onDownload={handleDownload} />
              )
            )
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-noc-border px-4 py-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs"
              >
                Previous
              </button>
              <span className="text-xs text-noc-muted">
                Page {page} of {totalPages} ({data.total} total)
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
