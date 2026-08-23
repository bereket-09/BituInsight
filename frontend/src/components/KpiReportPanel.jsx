import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileJson, Image } from 'lucide-react';
import { reportApi, workbookApi } from '../api';
import { downloadBlob } from '../utils/downloadBlob';
import LoadingSpinner from './LoadingSpinner';
import StatusBadge from './StatusBadge';
import SummaryCard from './SummaryCard';
import ChartCard from './ChartCard';
import MetricExplorer from './MetricExplorer';
import CmgThroughputExplorer from './CmgThroughputExplorer';
import CmgThroughputDataTable from './CmgThroughputDataTable';
import CmgThroughputInsight from './CmgThroughputInsight';
import TrafficVolumeExplorer from './TrafficVolumeExplorer';
import { parseTarget } from '../utils/parseTarget';

export default function KpiReportPanel({ reportId, workbookId, threshold: initialThreshold = 99 }) {
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(initialThreshold);
  const [thresholdMsg, setThresholdMsg] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setThreshold(initialThreshold);
  }, [initialThreshold, reportId]);

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => reportApi.get(reportId).then((r) => r.data.report),
    enabled: !!reportId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !['completed', 'failed'].includes(status) ? 3000 : false;
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: (newThreshold) =>
      workbookApi.updateKpiThreshold(workbookId, reportId, newThreshold),
    onSuccess: (_, newThreshold) => {
      setThresholdMsg('Threshold updated — reprocessing KPI...');
      setThreshold(newThreshold);
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['workbook', workbookId]);
    },
    onError: (err) => {
      setThresholdMsg(err.response?.data?.error || 'Failed to update threshold');
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading KPI report..." />;
  if (!report) return <p className="text-red-400">Report not found</p>;

  const isProcessing = ['pending', 'validating', 'processing'].includes(report.status);
  const summary = report.summary || {};
  const reportData = report.report_data || {};
  const calculated = reportData.calculated || {};
  const valueType = calculated.valueType || calculated.metrics?.valueType || 'percent';
  const activeThreshold =
    summary.threshold ??
    calculated.threshold ??
    calculated.metrics?.threshold ??
    threshold;

  if (isProcessing) {
    return (
      <div className="card flex items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-noc-border border-t-noc-accent" />
        <div>
          <p className="font-medium">Processing {report.kpi_name || summary.kpiName}...</p>
          <StatusBadge status={report.status} />
        </div>
      </div>
    );
  }

  if (report.status === 'failed') {
    return (
      <div className="card border-red-500/30 bg-red-500/5">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Failed — {report.kpi_name}</span>
        </div>
        {report.error_message && <p className="mt-2 text-sm text-red-300">{report.error_message}</p>}
        {report.validation_errors?.map((err, i) => (
          <p key={i} className="mt-1 font-mono text-xs text-red-300">
            {err.message}
          </p>
        ))}
      </div>
    );
  }

  const timeSeries = calculated.timeSeries || reportData.tables?.timeSeries;
  const chartConfigs = report.charts?.map((chart) => ({
    ...chart,
    parsedConfig: typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config,
  }));

  const kpiLabel = (report.kpi_name || summary.kpiName || 'kpi').replace(/[^a-zA-Z0-9_-]+/g, '_');

  const handleDownloadJson = async () => {
    setDownloading(true);
    try {
      const res = await reportApi.download(reportId);
      downloadBlob(res.data, `${kpiLabel}_report.json`);
    } finally {
      setDownloading(false);
    }
  };

  const handleChartDownload = async (chartId, title) => {
    const res = await reportApi.downloadChart(reportId, chartId);
    downloadBlob(res.data, `${(title || 'chart').replace(/\s+/g, '_')}.png`);
  };

  const handleDownloadAllCharts = async () => {
    if (!chartConfigs?.length) return;
    setDownloading(true);
    try {
      for (const chart of chartConfigs) {
        await handleChartDownload(chart.id, chart.title);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-3 border-noc-accent/20 bg-noc-accent/5">
        <div className="flex items-center gap-2 text-sm font-medium text-noc-text">
          <Download className="h-4 w-4 text-noc-accent" />
          Export KPI data
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={downloading}
            onClick={handleDownloadJson}
          >
            <FileJson className="h-3.5 w-3.5" />
            JSON report
          </button>
          {chartConfigs?.length > 0 && (
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={downloading}
              onClick={handleDownloadAllCharts}
            >
              <Image className="h-3.5 w-3.5" />
              All chart PNGs ({chartConfigs.length})
            </button>
          )}
        </div>
      </div>

      {workbookId && valueType === 'percent' && (
        <div className="card flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-noc-muted">
              Target threshold for this KPI (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(parseTarget(e.target.value, 99))}
              className="input-field w-28"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={thresholdMutation.isPending}
            onClick={() => thresholdMutation.mutate(threshold)}
          >
            {thresholdMutation.isPending ? 'Applying...' : 'Apply & reprocess'}
          </button>
          {thresholdMsg && (
            <p className="text-xs text-noc-muted">{thresholdMsg}</p>
          )}
        </div>
      )}

      {report.workflow_slug === 'cmg-data-throughput' ? (
        <CmgThroughputInsight
          summary={summary}
          calculated={calculated}
        />
      ) : (
        summary.narrative && (
          <div className="card border-l-4 border-l-noc-accent">
            <p className="text-sm leading-relaxed">{summary.narrative}</p>
          </div>
        )
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.highlights?.map((h) => (
          <SummaryCard key={h.label} label={h.label} value={h.value} trend={h.trend} />
        ))}
      </div>

      {summary.anomalies?.length > 0 && (
        <div className="card border-orange-500/30 bg-orange-500/5">
          <h3 className="mb-2 text-sm font-semibold text-orange-400">Anomalies</h3>
          <ul className="space-y-1">
            {summary.anomalies.map((a, i) => (
              <li key={i} className="text-sm text-orange-200">
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {timeSeries &&
        (report.workflow_slug === 'cmg-data-throughput' ? (
          <CmgThroughputExplorer
            timeSeries={timeSeries}
            summary={summary}
            calculated={calculated}
          />
        ) : report.workflow_slug === 'telecom-metric' || valueType === 'percent' ? (
          <MetricExplorer
            timeSeries={timeSeries}
            kpiName={report.kpi_name || summary.kpiName}
            valueType={valueType}
            threshold={activeThreshold}
          />
        ) : (
          <TrafficVolumeExplorer timeSeries={timeSeries} />
        ))}

      <div className="grid gap-6 lg:grid-cols-2">
        {chartConfigs?.map((chart) => (
          <ChartCard
            key={chart.id}
            title={chart.title}
            type={chart.chart_type}
            data={chart.parsedConfig?.data}
            height={280}
            onDownloadPng={() => handleChartDownload(chart.id, chart.title)}
          />
        ))}
      </div>

      {report.workflow_slug === 'cmg-data-throughput' && timeSeries && (
        <CmgThroughputDataTable timeSeries={timeSeries} filePrefix={`${kpiLabel}_${reportId}`} />
      )}

      {report.workflow_slug !== 'cmg-data-throughput' &&
        report.workflow_slug !== 'traffic-volume' &&
        timeSeries?.series?.primary?.length > 0 && (
          <div className="card overflow-x-auto">
            <h3 className="mb-4 text-sm font-semibold">
              Data table ({timeSeries.detected?.label})
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
                  <th className="pb-2 pr-4">Period</th>
                  <th className="pb-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {timeSeries.series.primary.map((row) => (
                  <tr key={row.timestamp || row.label} className="border-b border-noc-border/30">
                    <td className="py-2 pr-4 font-medium">{row.label}</td>
                    <td className="py-2 font-mono">
                      {valueType === 'percent'
                        ? `${(row.value ?? row.total)?.toFixed(2)}%`
                        : (row.value ?? row.total)?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
