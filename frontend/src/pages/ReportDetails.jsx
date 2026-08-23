import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  Send,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import clsx from 'clsx';
import ChartFullscreenModal from '../components/ChartFullscreenModal';
import { reportApi } from '../api';
import StatusBadge from '../components/StatusBadge';
import ChartCard from '../components/ChartCard';
import TrafficVolumeExplorer from '../components/TrafficVolumeExplorer';
import MetricExplorer from '../components/MetricExplorer';
import CmgThroughputExplorer from '../components/CmgThroughputExplorer';
import CmgThroughputDataTable from '../components/CmgThroughputDataTable';
import CmgThroughputInsight from '../components/CmgThroughputInsight';
import IntelligencePanel from '../components/IntelligencePanel';
import ReportPptExportButton from '../components/ReportPptExportButton';

const ICON_STROKE = 1.75;

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, neutral: Minus };
const TREND_TONES = {
  up: 'text-noc-success',
  down: 'text-noc-warning',
  neutral: 'text-noc-muted',
};

/**
 * Every block on this page is a section of one document. The heading rank tells
 * the reader what is the finding and what is the evidence behind it.
 */
function Section({ title, eyebrow, meta, variant = 'primary', children }) {
  const quiet = variant === 'quiet';
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-noc-border pb-3">
        <div className="min-w-0">
          {eyebrow && !quiet && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h2
            className={clsx(
              quiet
                ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-muted'
                : 'text-display-md text-noc-text'
            )}
          >
            {title}
          </h2>
        </div>
        {meta && <p className="tabular shrink-0 text-xs text-noc-muted">{meta}</p>}
      </div>
      {children}
    </section>
  );
}

function HighlightStrip({ highlights }) {
  return (
    <div className="card p-0">
      <dl className="grid grid-cols-2 lg:grid-cols-3">
        {highlights.map((h, i) => {
          const TrendIcon = TREND_ICONS[h.trend] || Minus;
          return (
            <div
              key={h.label}
              className={clsx(
                'px-5 py-4',
                i % 2 === 1 && 'border-l border-noc-border',
                i % 3 !== 0 && 'lg:border-l lg:border-noc-border',
                i % 3 === 0 && 'lg:border-l-0',
                i >= 2 && 'border-t border-noc-border',
                i < 3 && 'lg:border-t-0'
              )}
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                {h.label}
              </dt>
              <dd className="mt-2 flex items-baseline gap-2">
                <span className="tabular font-display text-2xl font-semibold text-noc-text">
                  {h.value}
                </span>
                <TrendIcon
                  className={clsx('h-4 w-4 shrink-0', TREND_TONES[h.trend] || TREND_TONES.neutral)}
                  strokeWidth={ICON_STROKE}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-9 w-2/3 max-w-lg" />
        <div className="skeleton h-3 w-72" />
      </div>
      <div className="card space-y-3 p-6">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-3/4" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function ReportDetails() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [teamsUrl, setTeamsUrl] = useState(
    () => localStorage.getItem('coreinsight_teams_webhook') || ''
  );
  const [teamsMessage, setTeamsMessage] = useState('');
  const [teamsOk, setTeamsOk] = useState(false);
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
      setTeamsOk(true);
      setTeamsMessage('Report sent to Microsoft Teams successfully');
      queryClient.invalidateQueries(['report', id]);
    },
    onError: (err) => {
      setTeamsOk(false);
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

  if (isLoading) return <ReportSkeleton />;

  if (!data) {
    return (
      <div className="card flex flex-col items-start gap-3 p-8">
        <span className="badge badge-neutral">Not found</span>
        <h1 className="text-display-md text-noc-text">This report is not available</h1>
        <p className="max-w-[56ch] text-sm text-noc-textDim">
          It may have been removed, or the link points at an id that no longer exists.
        </p>
        <Link to="/reports" className="btn-secondary mt-2">
          <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} />
          Back to reports
        </Link>
      </div>
    );
  }

  const report = data;
  const summary = report.summary || {};
  const reportData = report.report_data || {};
  const calculated = reportData.calculated || {};
  const metrics = calculated.metrics || {};
  const isProcessing = ['pending', 'validating', 'processing'].includes(report.status);
  const timeSeries = calculated.timeSeries || reportData.tables?.timeSeries;

  const chartConfigs = report.charts?.map((chart) => {
    const config = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
    return { ...chart, parsedConfig: config };
  });

  const visibleCharts = chartConfigs?.filter(
    (c) =>
      c.chart_type !== 'line' ||
      !['traffic-volume-lines', 'cmg-throughput-lines'].includes(c.parsedConfig?.id)
  );

  const legacyNarrative =
    !summary.intelligence?.available && summary.narrative ? summary.narrative : null;

  return (
    <div className="space-y-10">
      {/* ——— Masthead ——— */}
      <header className="space-y-4">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Back to reports
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-3xl">
            <p className="eyebrow">{report.workflow_name}</p>
            <h1 className="mt-2 text-display-lg text-noc-text">
              {summary.title || report.workflow_name}
            </h1>
            <div className="tabular mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-noc-muted">
              <StatusBadge status={report.status} />
              <span className="h-3 w-px bg-noc-border" aria-hidden />
              <span className="truncate font-mono">{report.original_filename}</span>
              <span className="h-3 w-px bg-noc-border" aria-hidden />
              <time dateTime={report.created_at}>
                {new Date(report.created_at).toLocaleString()}
              </time>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isProcessing && (
              <button onClick={() => refetch()} className="btn-secondary">
                <RefreshCw className="h-4 w-4" strokeWidth={ICON_STROKE} />
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
                  <Download className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  Download
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {isProcessing && (
        <div className="card space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-noc-accent/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-noc-accent" />
            </span>
            <p className="text-sm font-semibold tracking-tight text-noc-text">
              Building this report
            </p>
            <p className="text-xs text-noc-muted">
              Status: {report.status} · this page refreshes on its own
            </p>
          </div>
          <div className="space-y-2.5">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-10/12" />
            <div className="skeleton h-3.5 w-7/12" />
          </div>
        </div>
      )}

      {report.status === 'failed' && (
        <div className="card border-noc-danger/30 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-noc-danger"
              strokeWidth={ICON_STROKE}
            />
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-noc-text">
                Processing failed
              </h2>
              {report.error_message && (
                <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-noc-textDim">
                  {report.error_message}
                </p>
              )}
              {report.validation_errors?.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-noc-border pt-4">
                  {report.validation_errors.map((err, i) => (
                    <li key={i} className="font-mono text-xs text-noc-danger">
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {report.status === 'completed' && (
        <>
          {/* ——— The analysis: the reason this page exists ——— */}
          <IntelligencePanel intelligence={summary.intelligence} />

          {report.workflow_slug === 'cmg-data-throughput' ? (
            <CmgThroughputInsight summary={summary} calculated={calculated} />
          ) : (
            // Older reports (and any run where the intelligence layer was skipped)
            // still carry the workflow's own template narrative.
            legacyNarrative && (
              <div className="card border-l-2 border-l-noc-accent p-6">
                <p className="eyebrow mb-2.5">Summary</p>
                <p className="max-w-[68ch] font-display text-[17px] font-medium leading-[1.6] tracking-tight text-noc-text">
                  {legacyNarrative}
                </p>
              </div>
            )
          )}

          {summary.anomalies?.length > 0 && (
            <div className="card border-noc-warning/30 p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-noc-warning"
                  strokeWidth={ICON_STROKE}
                />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-warning">
                  Anomaly highlights
                </h2>
              </div>
              <ul className="mt-3 space-y-2 border-t border-noc-border pt-3">
                {summary.anomalies.map((a, i) => (
                  <li
                    key={i}
                    className="tabular flex gap-3 text-sm leading-relaxed text-noc-textDim"
                  >
                    <span className="mt-[9px] h-px w-4 shrink-0 bg-noc-warning" aria-hidden />
                    <span className="max-w-[76ch]">{a.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.highlights?.length > 0 && (
            <Section
              title="Key figures"
              eyebrow="At a glance"
              meta={metrics?.unit ? `Unit · ${metrics.unit}` : undefined}
            >
              <HighlightStrip highlights={summary.highlights} />
            </Section>
          )}

          {timeSeries && (
            <Section title="Explore the series" eyebrow="Evidence">
              {report.workflow_slug === 'telecom-metric' ? (
                <MetricExplorer
                  timeSeries={timeSeries}
                  kpiName={report.kpi_name || summary.kpiName}
                  valueType={calculated.valueType || calculated.metrics?.valueType}
                />
              ) : report.workflow_slug === 'cmg-data-throughput' ? (
                <CmgThroughputExplorer
                  timeSeries={timeSeries}
                  summary={summary}
                  calculated={calculated}
                />
              ) : (
                <TrafficVolumeExplorer timeSeries={timeSeries} />
              )}
            </Section>
          )}

          {visibleCharts?.length > 0 && (
            <Section
              title="Supporting charts"
              variant="quiet"
              meta={`${visibleCharts.length} chart${visibleCharts.length === 1 ? '' : 's'}`}
            >
              <div className="grid gap-5 lg:grid-cols-2">
                {visibleCharts.map((chart) => (
                  <ChartCard
                    key={chart.id}
                    title={chart.title}
                    type={chart.chart_type}
                    data={chart.parsedConfig?.data}
                    height={chart.parsedConfig?.id === 'technology-pie' ? 300 : 280}
                    onDownloadPng={() => handleChartDownload(chart.id, chart.title)}
                    onExpandPng={() => openPngFullscreen(chart.id, chart.title)}
                  />
                ))}
              </div>
            </Section>
          )}

          {report.workflow_slug === 'traffic-volume' &&
            reportData.tables?.timeSeries?.series?.primary && (
              <Section
                title="Time series data"
                variant="quiet"
                meta={reportData.tables.timeSeries.detected?.label}
              >
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="tabular w-full text-sm">
                      <thead>
                        <tr className="border-b border-noc-border bg-noc-bg/40 text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                          <th className="px-5 py-3 font-medium">Period</th>
                          <th className="px-5 py-3 font-medium">2G+3G</th>
                          <th className="px-5 py-3 font-medium">4G</th>
                          <th className="px-5 py-3 font-medium">Total</th>
                          <th className="px-5 py-3 font-medium">4G share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.tables.timeSeries.series.primary.map((row) => (
                          <tr
                            key={row.timestamp}
                            className="border-b border-noc-border/40 transition-colors last:border-0 hover:bg-noc-accent/[0.04]"
                          >
                            <td className="px-5 py-2.5 font-medium text-noc-text">{row.label}</td>
                            <td className="px-5 py-2.5 font-mono text-xs text-noc-textDim">
                              {row.volume2g3g?.toLocaleString()}
                            </td>
                            <td className="px-5 py-2.5 font-mono text-xs text-noc-textDim">
                              {row.volume4g?.toLocaleString()}
                            </td>
                            <td className="px-5 py-2.5 font-mono text-xs font-semibold text-noc-text">
                              {row.total?.toLocaleString()}
                            </td>
                            <td className="px-5 py-2.5 font-mono text-xs text-noc-accent">
                              {row.contribution4gPct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            )}

          {report.workflow_slug === 'cmg-data-throughput' && timeSeries && (
            <CmgThroughputDataTable
              timeSeries={timeSeries}
              filePrefix={`${(report.kpi_name || summary.kpiName || 'cmg-throughput').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${id}`}
            />
          )}

          <Section title="Distribution" variant="quiet">
            <div className="card p-5 sm:p-6">
              <h3 className="text-sm font-semibold tracking-tight text-noc-text">
                Send to Microsoft Teams
              </h3>
              <p className="mt-1 text-xs text-noc-muted">
                Leave the field empty to use the webhook configured on the server.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  aria-label="Teams webhook URL"
                  placeholder="Teams webhook URL (optional)"
                  value={teamsUrl}
                  onChange={(e) => setTeamsUrl(e.target.value)}
                  className="input-field flex-1"
                />
                <button
                  onClick={() => teamsMutation.mutate()}
                  disabled={teamsMutation.isPending}
                  className="btn-primary shrink-0"
                >
                  <Send className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  {teamsMutation.isPending ? 'Sending…' : 'Send to Teams'}
                </button>
              </div>

              {teamsMessage && (
                <p
                  aria-live="polite"
                  className={clsx(
                    'mt-3 text-xs font-medium',
                    teamsOk ? 'text-noc-success' : 'text-noc-danger'
                  )}
                >
                  {teamsMessage}
                </p>
              )}

              {report.teamsDeliveries?.length > 0 && (
                <div className="mt-5 border-t border-noc-border pt-4">
                  <p className="eyebrow mb-3">Delivery history</p>
                  <ul className="space-y-2">
                    {report.teamsDeliveries.map((d) => (
                      <li key={d.id} className="tabular flex items-center gap-2.5 text-xs">
                        <StatusBadge status={d.status === 'sent' ? 'completed' : d.status} />
                        <span className="text-noc-muted">
                          {d.sent_at ? new Date(d.sent_at).toLocaleString() : 'Pending'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>

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
