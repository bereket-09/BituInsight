import { useEffect, useMemo, useState } from 'react';
import { Presentation, CheckSquare, Square, X, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';
import { workbookApi } from '../api';
import { downloadBlob } from '../utils/downloadBlob';
import { parseTarget } from '../utils/parseTarget';

const PPT_THEME_KEY = 'coreinsight_ppt_theme';

function buildInitialState(completedKpis, defaultThreshold) {
  const selected = new Set(completedKpis.map((k) => k.reportId));
  const thresholds = {};
  for (const kpi of completedKpis) {
    thresholds[kpi.reportId] = kpi.threshold ?? defaultThreshold;
  }
  return { selected, thresholds };
}

export default function PptExportPanel({ workbookId, workbook, sortedKpis }) {
  const defaultThreshold = workbook?.defaultThreshold ?? 99;
  const completedKpis = useMemo(
    () => sortedKpis.filter((k) => k.status === 'completed'),
    [sortedKpis]
  );

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [thresholds, setThresholds] = useState({});
  const [deckDefault, setDeckDefault] = useState(defaultThreshold);
  const [pptTheme, setPptTheme] = useState(() => {
    const saved = localStorage.getItem(PPT_THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const resetConfigurator = () => {
    const init = buildInitialState(completedKpis, defaultThreshold);
    setSelected(init.selected);
    setThresholds(init.thresholds);
    setDeckDefault(defaultThreshold);
    setError('');
  };

  const handleOpen = () => {
    resetConfigurator();
    setOpen(true);
  };

  const handleClose = () => {
    if (downloading) return;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !downloading) setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, downloading]);

  const allSelected =
    completedKpis.length > 0 && selected.size === completedKpis.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(completedKpis.map((k) => k.reportId)));
    }
  };

  const toggleKpi = (reportId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  const setKpiThreshold = (reportId, value) => {
    setThresholds((prev) => ({
      ...prev,
      [reportId]: parseTarget(value, defaultThreshold),
    }));
  };

  const applyDefaultToSelected = () => {
    setThresholds((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        next[id] = deckDefault;
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0) {
      setError('Select at least one KPI');
      return;
    }
    setError('');
    setDownloading(true);
    try {
      const reportIds = [...selected];
      const thresholdPayload = {};
      for (const id of reportIds) {
        thresholdPayload[id] = thresholds[id] ?? deckDefault;
      }
      localStorage.setItem(PPT_THEME_KEY, pptTheme);
      const res = await workbookApi.downloadPresentation(workbookId, {
        reportIds,
        thresholds: thresholdPayload,
        defaultThreshold: deckDefault,
        theme: pptTheme,
      });
      const disposition = res.headers['content-disposition'];
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `Core Insight_KPI_Report_${workbookId}.pptx`;
      downloadBlob(res.data, filename);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate presentation');
    } finally {
      setDownloading(false);
    }
  };

  const canExport = completedKpis.length > 0;

  return (
    <>
      <div className="card flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-noc-accent bg-gradient-to-r from-noc-accent/5 to-transparent">
        <div>
          <p className="text-sm font-semibold">Management executive deck</p>
          <p className="mt-1 text-xs text-noc-muted">
            Weekly PowerPoint for leadership — one chart slide per KPI, no data tables.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={!canExport}
          onClick={handleOpen}
        >
          <Presentation className="h-4 w-4" />
          Download PPTX
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ppt-export-title"
          onClick={handleClose}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-noc-border bg-noc-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-noc-border px-5 py-4">
              <div>
                <h2 id="ppt-export-title" className="text-base font-semibold">
                  Configure PowerPoint export
                </h2>
                <p className="mt-1 text-xs text-noc-muted">
                  Select KPIs and set thresholds. Charts regenerate when the target differs from
                  the saved report.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={downloading}
                className="rounded-lg p-2 text-noc-muted transition-colors hover:bg-noc-surface hover:text-noc-text disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-noc-border/80 bg-noc-surface/50 p-4">
                <p className="mb-3 text-xs font-medium text-noc-muted">Presentation theme</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPptTheme('dark')}
                    className={clsx(
                      'relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all',
                      pptTheme === 'dark'
                        ? 'border-noc-accent shadow-glow'
                        : 'border-noc-border hover:border-noc-accent/40'
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Moon className="h-4 w-4 text-violet-400" />
                      <span className="text-sm font-semibold">Dark executive</span>
                    </div>
                    <div className="space-y-1 rounded-lg bg-[#0D1117] p-2">
                      <div className="h-1.5 w-3/4 rounded bg-[#00B140]" />
                      <div className="h-8 rounded bg-[#161B22]" />
                      <div className="flex gap-1">
                        <div className="h-2 flex-1 rounded bg-[#3B9EFF]/40" />
                        <div className="h-2 flex-1 rounded bg-[#3FB950]/40" />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-noc-muted">Best for projectors & dim rooms</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPptTheme('light')}
                    className={clsx(
                      'relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all',
                      pptTheme === 'light'
                        ? 'border-noc-accent shadow-glow'
                        : 'border-noc-border hover:border-noc-accent/40'
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Sun className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-semibold">Light boardroom</span>
                    </div>
                    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                      <div className="h-1.5 w-3/4 rounded bg-[#00B140]" />
                      <div className="h-8 rounded bg-slate-50" />
                      <div className="flex gap-1">
                        <div className="h-2 flex-1 rounded bg-blue-100" />
                        <div className="h-2 flex-1 rounded bg-green-100" />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-noc-muted">Crisp on email & printed packs</p>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-4 rounded-lg border border-noc-border/80 bg-noc-surface/50 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-noc-muted">
                    Deck default threshold (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={deckDefault}
                    onChange={(e) =>
                      setDeckDefault(parseTarget(e.target.value, defaultThreshold))
                    }
                    className="input-field w-28"
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={applyDefaultToSelected}
                >
                  Apply default to selected
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-xs font-medium text-noc-accent hover:underline"
                  onClick={toggleAll}
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className={clsx('h-4 w-4', someSelected && 'opacity-60')} />
                  )}
                  {allSelected ? 'Deselect all' : 'Select all'} ({completedKpis.length})
                </button>
                <span className="text-xs text-noc-muted">{selected.size} selected</span>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-noc-border/60 p-2">
                {completedKpis.map((kpi) => {
                  const isOn = selected.has(kpi.reportId);
                  return (
                    <div
                      key={kpi.reportId}
                      className={clsx(
                        'flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                        isOn ? 'bg-noc-accent/10' : 'hover:bg-noc-surface/80'
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => toggleKpi(kpi.reportId)}
                      >
                        {isOn ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-noc-accent" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-noc-muted" />
                        )}
                        <span className="truncate text-sm font-medium">
                          {kpi.kpiName || kpi.sheetName}
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-noc-muted">
                          Target %
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          disabled={!isOn}
                          value={thresholds[kpi.reportId] ?? kpi.threshold ?? defaultThreshold}
                          onChange={(e) => setKpiThreshold(kpi.reportId, e.target.value)}
                          className="input-field w-20 py-1.5 text-xs disabled:opacity-40"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-noc-border px-5 py-4">
              <button
                type="button"
                className="btn-secondary"
                disabled={downloading}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selected.size === 0 || downloading}
                onClick={handleGenerate}
              >
                {downloading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Building deck...
                  </>
                ) : (
                  <>
                    <Presentation className="h-4 w-4" />
                    Generate ({selected.size} KPI{selected.size !== 1 ? 's' : ''})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
