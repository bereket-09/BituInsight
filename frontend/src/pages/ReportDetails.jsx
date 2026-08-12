import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  Send,
  AlertTriangle,
  RefreshCw,
  Maximize2,
} from 'lucide-react';
import ChartFullscreenModal from '../components/ChartFullscreenModal';
import ThemeToggle from '../components/ThemeToggle';
import { reportApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import SummaryCard from '../components/SummaryCard';
import ChartCard from '../components/ChartCard';
import TrafficVolumeExplorer from '../components/TrafficVolumeExplorer';
import MetricExplorer from '../components/MetricExplorer';
import CmgThroughputExplorer from '../components/CmgThroughputExplorer';
import CmgThroughputDataTable from '../components/CmgThroughputDataTable';
import CmgThroughputInsight from '../components/CmgThroughputInsight';
import IntelligencePanel from '../components/IntelligencePanel';
import ReportPptExportButton from '../components/ReportPptExportButton';

export default function ReportDetails() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [teamsUrl, setTeamsUrl] = useState(
    () => localStorage.getItem('bituinsight_teams_webhook') || ''
  );
  const [teamsMessage, setTeamsMessage] = useState('');
  const [pngPreview, setPngPreview] = useState(null);

  useEffect(() => {
    return () => {
      if (pngPreview?.url) URL.revokeObjectURL(pngPreview.url);
    };
  }, [pngPreview]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report', id],
    queryFn: () => reportApi.get(id).then((r) => r.data.report),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !['completed', 'failed'].includes(status) ? 3000 : false;
    },
  });

  const teamsMutation = useMutation({
    mutationFn: () => reportApi.sendToTeams(id, teamsUrl || undefined),
    onSuccess: () => {
      setTeamsMessage('Report sent to Microsoft Teams successfully');
      queryClient.invalidateQueries(['report', id]);
    },
    onError: (err) => {
      setTeamsMessage(err.response?.data?.error || 'Failed to send to Teams');
    },
  });

  const handleDownload = async () => {
    const res = await reportApi.download(id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${id}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleChartDownload = async (chartId, title) => {
    const res = await reportApi.downloadChart(id, chartId);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}.png`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const openPngFullscreen = async (chartId, title) => {
    const res = await reportApi.downloadChart(id, chartId);
    const url = URL.createObjectURL(new Blob([res.data]));
    setPngPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url, title, chartId };
    });
  };

  const closePngPreview = () => {
    setPngPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  if (isLoading) return <LoadingSpinner label="Loading report..." />;
  if (!data) return <div className="text-red-400">Report not found</div>;

  const report = data;
  const summary = report.summary || {};
  const reportData = report.report_data || {};
  const calculated = reportData.calculated || {};
  const metrics = calculated.metrics || {};
  const isProcessing = ['pending', 'validating', 'processing'].includes(report.status);

  const chartConfigs = report.charts?.map((chart) => {
    const config = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
    return { ...chart, parsedConfig: config };
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/reports"
            className="mb-3 inline-flex items-center gap-1 text-xs text-noc-muted hover:text-noc-accent"
          >
            <ArrowLeft className="h-3 w-3" /> Back to reports
          </Link>
          <h1 className="text-2xl font-bold">{summary.title || report.workflow_name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={report.status} />
            <span className="text-xs text-noc-muted">
              {report.original_filename} · {new Date(report.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isProcessing && (
            <button onClick={() => refetch()} className="btn-secondary">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          )}
          {report.status === 'completed' && (
            <>
              <ReportPptExportButton
                reportId={id}
                fileName={report.original_filename?.replace(/\.[^.]+$/, '')}
              />
              <button onClick={handleDownload} className="btn-secondary">
                <Download className="h-4 w-4" />
                Download
              </button>
            </>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="card flex items-center gap-4 border-noc-accent/30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-noc-border border-t-noc-accent" />
          <div>
            <p className="font-medium">Processing report...</p>
            <p className="text-xs text-noc-muted">
              Status: {report.status} — this page auto-refreshes
            </p>
          </div>
        </div>
      )}

      {report.status === 'failed' && (
        <div className="card border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Processing Failed</span>
          </div>
          {report.error_message && (
            <p className="mt-2 text-sm text-red-300">{report.error_message}</p>
          )}
          {report.validation_errors?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {report.validation_errors.map((err, i) => (
                <li key={i} className="font-mono text-xs text-red-300">
                  {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {report.status === 'completed' && (
        <>
          <IntelligencePanel intelligence={summary.intelligence} />

          {report.workflow_slug === 'cmg-data-throughput' ? (
            <CmgThroughputInsight
              summary={summary}
              calculated={calculated}
            />
          ) : (
            // Older reports (and any run where the intelligence layer was skipped)
            // still carry the workflow's own template narrative.
            !summary.intelligence?.available &&
            summary.narrative && (
              <div className="card border-l-4 border-l-noc-accent">
                <p className="text-sm leading-relaxed text-noc-text">{summary.narrative}</p>
              </div>
            )
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.highlights?.map((h) => (
              <SummaryCard
                key={h.label}
                label={h.label}
                value={h.value}
                trend={h.trend}
              />
            ))}
          </div>

          {summary.anomalies?.length > 0 && (
            <div className="card border-orange-500/30 bg-orange-500/5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                Anomaly Highlights
              </h3>
              <ul className="space-y-2">
                {summary.anomalies.map((a, i) => (
                  <li key={i} className="text-sm text-orange-200">
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(calculated.timeSeries || reportData.tables?.timeSeries) &&
            (report.workflow_slug === 'telecom-metric' ? (
              <MetricExplorer
                timeSeries={calculated.timeSeries || reportData.tables?.timeSeries}
                kpiName={report.kpi_name || summary.kpiName}
                valueType={calculated.valueType || calculated.metrics?.valueType}
              />
            ) : report.workflow_slug === 'cmg-data-throughput' ? (
              <CmgThroughputExplorer
                timeSeries={calculated.timeSeries || reportData.tables?.timeSeries}
                summary={summary}
                calculated={calculated}
              />
            ) : (
              <TrafficVolumeExplorer
                timeSeries={calculated.timeSeries || reportData.tables?.timeSeries}
              />
            ))}

          <div className="grid gap-6 lg:grid-cols-2">
            {chartConfigs
              ?.filter(
                (c) =>
                  c.chart_type !== 'line' ||
                  !['traffic-volume-lines', 'cmg-throughput-lines'].includes(c.parsedConfig?.id)
              )
              .map((chart) => (
                <div key={chart.id} className="relative">
                  <ChartCard
                    title={chart.title}
                    type={chart.chart_type}
                    data={chart.parsedConfig?.data}
                    height={chart.parsedConfig?.id === 'technology-pie' ? 300 : 280}
                    onDownloadPng={() => handleChartDownload(chart.id, chart.title)}
                  />
                  <div className="absolute right-4 top-14 flex gap-1">
                    <button
                      type="button"
                      onClick={() => openPngFullscreen(chart.id, chart.title)}
                      className="rounded-lg bg-noc-surface/90 p-2 text-noc-muted backdrop-blur hover:text-noc-accent"
                      title="Fullscreen exported PNG"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChartDownload(chart.id, chart.title)}
                      className="rounded-lg bg-noc-surface/90 p-2 text-noc-muted backdrop-blur hover:text-noc-text"
                      title="Download PNG"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {report.workflow_slug === 'traffic-volume' &&
            reportData.tables?.timeSeries?.series?.primary && (
              <div className="card overflow-x-auto">
                <h3 className="mb-4 text-sm font-semibold">
                  Time series data ({reportData.tables.timeSeries.detected?.label})
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border text-left text-xs text-noc-muted">
                      <th className="pb-2 pr-4">Period</th>
                      <th className="pb-2 pr-4 text-[#FF6B35]">2G+3G</th>
                      <th className="pb-2 pr-4 text-[#3B9EFF]">4G</th>
                      <th className="pb-2 pr-4 text-[#B794F6]">Total</th>
                      <th className="pb-2">4G %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tables.timeSeries.series.primary.map((row) => (
                      <tr key={row.timestamp} className="border-b border-noc-border/30">
                        <td className="py-2 pr-4 font-medium">{row.label}</td>
                        <td className="py-2 pr-4 font-mono text-[#FF6B35]">
                          {row.volume2g3g?.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 font-mono text-[#3B9EFF]">
                          {row.volume4g?.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 font-mono text-[#B794F6]">
                          {row.total?.toLocaleString()}
                        </td>
                        <td className="py-2">{row.contribution4gPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {report.workflow_slug === 'cmg-data-throughput' &&
            (calculated.timeSeries || reportData.tables?.timeSeries) && (
              <CmgThroughputDataTable
                timeSeries={calculated.timeSeries || reportData.tables?.timeSeries}
                filePrefix={`${(report.kpi_name || summary.kpiName || 'cmg-throughput').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${id}`}
              />
            )}

          <div className="card">
            <h3 className="mb-4 text-sm font-semibold">Send to Microsoft Teams</h3>
            <div className="flex gap-3">
              <input
                type="url"
                placeholder="Teams webhook URL (optional — uses server default)"
                value={teamsUrl}
                onChange={(e) => setTeamsUrl(e.target.value)}
                className="input-field flex-1"
              />
              <button
                onClick={() => teamsMutation.mutate()}
                disabled={teamsMutation.isPending}
                className="btn-primary"
              >
                <Send className="h-4 w-4" />
                {teamsMutation.isPending ? 'Sending...' : 'Send to Teams'}
              </button>
            </div>
            {teamsMessage && (
              <p className={`mt-2 text-xs ${teamsMessage.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
                {teamsMessage}
              </p>
            )}
            {report.teamsDeliveries?.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-noc-muted">Delivery History</p>
                {report.teamsDeliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-xs">
                    <StatusBadge status={d.status === 'sent' ? 'completed' : d.status} />
                    <span className="text-noc-muted">
                      {d.sent_at ? new Date(d.sent_at).toLocaleString() : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ChartFullscreenModal
            open={!!pngPreview}
            onClose={closePngPreview}
            title={pngPreview?.title}
            imageUrl={pngPreview?.url}
            onDownload={
              pngPreview
                ? () => handleChartDownload(pngPreview.chartId, pngPreview.title)
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
