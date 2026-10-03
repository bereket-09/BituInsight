import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  X,
  Layers,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { workflowApi, reportApi, workbookApi } from '../api';
import ExcelPreview from '../components/ExcelPreview';
import KpiWorkflowSelector from '../components/KpiWorkflowSelector';
import UploadWizardSteps from '../components/UploadWizardSteps';

const ICON_STROKE = 1.75;
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];

const SINGLE_STEPS = [
  { id: 'workflow', label: 'KPI workflow', hint: 'Choose parser' },
  { id: 'file', label: 'Upload file', hint: 'Excel export' },
  { id: 'configure', label: 'Map & validate', hint: 'Preview rows' },
];

const WORKBOOK_STEPS = [
  { id: 'file', label: 'Upload workbook', hint: 'CMM .xlsx' },
  { id: 'review', label: 'Review KPIs', hint: 'Thresholds' },
];

function StatTile({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-noc-text',
    success: 'text-noc-success',
    danger: 'text-noc-danger',
    muted: 'text-noc-muted',
  };
  return (
    <div className="rounded-xl border border-noc-border bg-noc-bg/40 px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">{label}</p>
      <p className={clsx('tabular mt-1.5 font-display text-2xl font-semibold', tones[tone])}>
        {value}
      </p>
    </div>
  );
}

export default function Upload() {
  const [mode, setMode] = useState('workbook');
  const [wizardStep, setWizardStep] = useState(0);
  const [workflowSlug, setWorkflowSlug] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [workbookPreview, setWorkbookPreview] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(null);
  const [dataStartRowIndex, setDataStartRowIndex] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [defaultThreshold, setDefaultThreshold] = useState(99);
  const [kpiThresholds, setKpiThresholds] = useState({});
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  // A built-in workflow made for this exact export (e.g. Peak Attached Users),
  // which reads it better than either generic mode.
  const [suggestedWorkflow, setSuggestedWorkflow] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const isWorkbook = mode === 'workbook';
  const steps = isWorkbook ? WORKBOOK_STEPS : SINGLE_STEPS;

  const parseOptions = () => {
    const sheet = preview?.sheets?.find((s) => s.index === sheetIndex);
    return {
      sheetName: sheet?.name,
      sheetIndex,
      headerRowIndex: headerRowIndex ?? sheet?.suggestedHeaderRow ?? 0,
      dataStartRowIndex: dataStartRowIndex ?? sheet?.suggestedDataStartRow ?? 1,
      autoDetect: false,
    };
  };

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list().then((r) => r.data.workflows),
  });

  const previewMutation = useMutation({
    mutationFn: async (uploadFile) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('workflowSlug', workflowSlug);
      return reportApi.preview(formData);
    },
    onSuccess: (res) => {
      const data = res.data;
      setPreview(data);
      if (data.suggestedWorkflow) setSuggestedWorkflow(data.suggestedWorkflow);
      const rec = data.sheets?.find((s) => s.isRecommended) || data.sheets?.[0];
      if (rec) {
        setSheetIndex(rec.index);
        setHeaderRowIndex(rec.suggestedHeaderRow);
        setDataStartRowIndex(rec.suggestedDataStartRow);
      }
      if (!isWorkbook) setWizardStep(2);
    },
  });

  const workbookPreviewMutation = useMutation({
    mutationFn: async (uploadFile) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      return workbookApi.preview(formData);
    },
    onSuccess: (res) => {
      const data = res.data;
      setWorkbookPreview(data);
      setSuggestedWorkflow(data.suggestedWorkflow || null);
      const initial = {};
      data.kpis?.forEach((kpi) => {
        if (kpi.valid) initial[kpi.kpiName] = 99;
      });
      setKpiThresholds(initial);
      setDefaultThreshold(99);
      setWizardStep(1);
    },
  });

  useEffect(() => {
    if (!file) return;
    setValidationResult(null);

    if (mode === 'workbook') {
      setWorkbookPreview(null);
      workbookPreviewMutation.mutate(file);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    workbookApi
      .preview(formData)
      .then((res) => {
        const data = res.data;
        setSuggestedWorkflow(data.suggestedWorkflow || null);
        if (data.suggestWorkbookMode && data.dataSheetCount >= 2) {
          setMode('workbook');
          setWorkbookPreview(data);
          setPreview(null);
          setWizardStep(1);
          return;
        }
        if (workflowSlug) {
          setPreview(null);
          previewMutation.mutate(file);
        }
      })
      .catch(() => {
        if (workflowSlug) previewMutation.mutate(file);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, workflowSlug, mode]);

  const validateMutation = useMutation({
    mutationFn: () => reportApi.validate(file, workflowSlug, parseOptions()),
    onSuccess: (res) => setValidationResult(res.data),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = reportApi.buildUploadFormData(file, workflowSlug, parseOptions());
      return reportApi.upload(formData, (e) => {
        if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
      });
    },
    onSuccess: (res) => navigate(`/reports/${res.data.reportId}`),
  });

  const workbookUploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('defaultThreshold', String(defaultThreshold));
      formData.append('kpiThresholds', JSON.stringify(kpiThresholds));
      return workbookApi.upload(formData, (e) => {
        if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
      });
    },
    onSuccess: (res) => {
      setUploadError('');
      navigate(`/workbooks/${res.data.workbookId}`);
    },
    onError: (err) => {
      setUploadError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Workbook upload failed'
      );
    },
  });

  const handleSheetChange = (idx) => {
    setSheetIndex(idx);
    const sheet = preview?.sheets?.find((s) => s.index === idx);
    if (sheet) {
      setHeaderRowIndex(sheet.suggestedHeaderRow);
      setDataStartRowIndex(sheet.suggestedDataStartRow);
    }
    setValidationResult(null);
  };

  /** Move the current file over to the workflow built for it, keeping the file. */
  const applySuggestedWorkflow = () => {
    if (!suggestedWorkflow) return;
    setMode('single');
    setWorkflowSlug(suggestedWorkflow.slug);
    setWorkbookPreview(null);
    setPreview(null);
    setValidationResult(null);
    setUploadError('');
    setWizardStep(1);
  };

  const resetFile = () => {
    setSuggestedWorkflow(null);
    setFile(null);
    setPreview(null);
    setWorkbookPreview(null);
    setValidationResult(null);
    setWizardStep(isWorkbook ? 0 : workflowSlug ? 1 : 0);
  };

  /** One path for browse and drop, so both validate the same way. */
  const handleFileSelected = (nextFile) => {
    setSuggestedWorkflow(null);
    setValidationResult(null);
    setPreview(null);
    setWorkbookPreview(null);
    setUploadError('');
    if (!nextFile) {
      setFile(null);
      return;
    }
    const name = nextFile.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      setFile(null);
      setUploadError(
        `“${nextFile.name}” is not an Excel workbook. Upload a .xlsx or .xls export instead.`
      );
      return;
    }
    setFile(nextFile);
    if (isWorkbook) setWizardStep(0);
    else if (workflowSlug) setWizardStep(1);
  };

  const switchMode = (nextMode) => {
    setSuggestedWorkflow(null);
    setMode(nextMode);
    setWizardStep(0);
    setFile(null);
    setPreview(null);
    setWorkbookPreview(null);
    setValidationResult(null);
    setWorkflowSlug('');
    setUploadError('');
  };

  // Set when a workflow that reads the whole workbook has already looked at the
  // file and found nothing it can use; uploading it would only produce a failure.
  const fileRejected = preview?.fileCheck ? !preview.fileCheck.valid : false;

  const selectedWorkflow = useMemo(
    () => workflows?.find((w) => w.slug === workflowSlug),
    [workflows, workflowSlug]
  );

  const canGoNext = () => {
    if (isWorkbook) {
      if (wizardStep === 0) return !!workbookPreview && !workbookPreviewMutation.isPending;
      return false;
    }
    if (wizardStep === 0) return !!workflowSlug;
    if (wizardStep === 1) return !!file && !!preview && !previewMutation.isPending;
    return false;
  };

  const goNext = () => {
    if (!canGoNext()) return;
    if (!isWorkbook && wizardStep === 0) setWizardStep(1);
    if (!isWorkbook && wizardStep === 1 && preview) setWizardStep(2);
    if (isWorkbook && wizardStep === 0 && workbookPreview) setWizardStep(1);
  };

  const goBack = () => {
    setUploadError('');
    if (wizardStep > 0) setWizardStep(wizardStep - 1);
  };

  const handleWorkflowSelect = (slug) => {
    setWorkflowSlug(slug);
    setValidationResult(null);
    setPreview(null);
    if (slug) setWizardStep(1);
  };

  const previewPending = isWorkbook ? workbookPreviewMutation.isPending : previewMutation.isPending;
  const previewError = isWorkbook ? workbookPreviewMutation.error : previewMutation.error;

  /*
   * A preview can fail for reasons that have nothing to do with the file — a
   * deploy rolling over mid-request, or an edge response that never reached the
   * API. Those are worth retrying rather than starting again, so the panel below
   * offers it, and surfaces the platform's request id when there is one so a
   * failure that recurs can actually be traced.
   */
  const retryPreview = () => {
    if (!file) return;
    if (isWorkbook) workbookPreviewMutation.mutate(file);
    else if (workflowSlug) previewMutation.mutate(file);
  };
  const failedResponse = (uploadError || previewError)?.response;
  const requestId =
    failedResponse?.headers?.['x-vercel-id'] || failedResponse?.headers?.['x-request-id'] || null;
  const failedStatus = failedResponse?.status;
  const errorText =
    uploadError ||
    (previewError
      ? `Preview failed — ${previewError?.response?.data?.error || previewError.message}`
      : '');

  const modes = [
    {
      id: 'workbook',
      icon: Layers,
      label: 'CMM workbook',
      hint: 'Every Data sheet',
    },
    {
      id: 'single',
      icon: GitBranch,
      label: 'Single KPI',
      hint: 'One workflow',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="dashboard-hero">
        <p className="eyebrow">New report</p>
        <h1 className="mt-3 text-display-lg text-noc-text">Create a KPI insight</h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-noc-textDim">
          Process a full CMM workbook — one report per Data sheet — or run a single KPI workflow
          against a one-off Excel export.
        </p>
      </header>

      {/* Mode */}
      <div
        role="group"
        aria-label="Upload mode"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-noc-border bg-noc-surface/60 p-1.5"
      >
        {modes.map((m) => {
          const active = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => switchMode(m.id)}
              className={clsx(
                'flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm transition-all duration-200 active:translate-y-px',
                active
                  ? 'bg-noc-card text-noc-text shadow-card ring-1 ring-noc-accent/30'
                  : 'text-noc-muted hover:bg-noc-card/60 hover:text-noc-text'
              )}
            >
              <Icon
                className={clsx('h-4 w-4', active ? 'text-noc-accent' : 'text-noc-muted')}
                strokeWidth={ICON_STROKE}
              />
              <span className="font-semibold tracking-tight">{m.label}</span>
              <span className="hidden text-[11px] font-normal text-noc-muted sm:inline">
                · {m.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress */}
      <div className="card px-5 py-5 sm:px-6">
        <UploadWizardSteps
          steps={steps}
          currentIndex={wizardStep}
          onStepClick={(idx) => setWizardStep(idx)}
        />
      </div>

      <div className="card space-y-6 p-5 sm:p-6">
        {/* ——— Single KPI: workflow step ——— */}
        {!isWorkbook && wizardStep === 0 && (
          isLoading ? (
            <div className="space-y-4">
              <div className="skeleton h-5 w-48" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-[13.5rem] rounded-2xl" />
                ))}
              </div>
            </div>
          ) : (
            <KpiWorkflowSelector
              workflows={workflows}
              value={workflowSlug}
              onChange={handleWorkflowSelect}
            />
          )
        )}

        {/* ——— File upload step ——— */}
        {((isWorkbook && wizardStep === 0) || (!isWorkbook && wizardStep === 1)) && (
          <div className="space-y-4">
            {!isWorkbook && selectedWorkflow && (
              <div className="flex items-center gap-3 rounded-xl border border-noc-border bg-noc-bg/40 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-noc-accent/10 text-noc-accent">
                  <GitBranch className="h-4 w-4" strokeWidth={ICON_STROKE} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                    Selected workflow
                  </p>
                  <p className="truncate text-sm font-semibold tracking-tight text-noc-text">
                    {selectedWorkflow.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent active:translate-y-px"
                  onClick={() => setWizardStep(0)}
                >
                  Change
                </button>
              </div>
            )}

            {isWorkbook && (
              <div className="rounded-xl border border-noc-border bg-noc-bg/40 p-4">
                <p className="eyebrow mb-1.5">CMM workbook mode</p>
                <p className="max-w-[68ch] text-sm leading-relaxed text-noc-textDim">
                  Only sheets named <span className="font-mono text-noc-text">Data…</span> are
                  processed. Each valid sheet becomes its own KPI report with charts and workbook
                  tabs.
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                handleFileSelected(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />

            <div
              role="button"
              tabIndex={0}
              aria-label="Choose an Excel file to upload"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragActive) setDragActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleFileSelected(e.dataTransfer.files?.[0] || null);
              }}
              className={clsx(
                'group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200',
                dragActive
                  ? 'border-noc-accent bg-noc-accent/[0.07] shadow-glow'
                  : 'border-noc-border bg-noc-bg/30 hover:border-noc-accent/50 hover:bg-noc-accent/[0.04]'
              )}
            >
              {file ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:text-left">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-noc-accent/10 text-noc-accent">
                    <FileSpreadsheet className="h-6 w-6" strokeWidth={ICON_STROKE} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight text-noc-text">
                      {file.name}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-noc-muted">
                      {(file.size / 1024).toFixed(1)} KB · ready to process
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetFile();
                    }}
                    className="rounded-lg border border-noc-border p-2 text-noc-muted transition-colors hover:border-noc-danger/40 hover:text-noc-danger active:translate-y-px"
                  >
                    <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={clsx(
                      'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-noc-accent/10 text-noc-accent transition-transform duration-300',
                      dragActive ? 'scale-110' : 'group-hover:scale-105'
                    )}
                  >
                    <UploadIcon className="h-6 w-6" strokeWidth={ICON_STROKE} />
                  </span>
                  <p className="mt-5 text-[15px] font-semibold tracking-tight text-noc-text">
                    {dragActive ? 'Release to add the workbook' : 'Drop your Excel file here'}
                  </p>
                  <p className="mt-1.5 text-xs text-noc-muted">
                    or click to browse · .xlsx and .xls, up to one file
                  </p>
                </>
              )}
            </div>

            {previewPending && (
              <div className="space-y-3 rounded-xl border border-noc-border bg-noc-bg/40 p-4">
                <p className="text-xs font-medium text-noc-textDim">
                  {isWorkbook ? 'Scanning Data sheets' : 'Reading workbook structure'}
                </p>
                <div className="skeleton h-3 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-3 w-5/6" />
              </div>
            )}
          </div>
        )}

        {file && suggestedWorkflow && workflowSlug !== suggestedWorkflow.slug && (
          <div className="rounded-xl border border-noc-accent/30 bg-noc-accent/[0.07] p-4">
            <p className="tabular text-sm font-semibold tracking-tight text-noc-text">
              This is a {suggestedWorkflow.name} export
            </p>
            <p className="tabular mt-1 text-xs leading-relaxed text-noc-textDim">
              {isWorkbook
                ? 'CMM workbook mode expects PLMN-level success-rate sheets, so it cannot read this file. '
                : ''}
              The {suggestedWorkflow.name} workflow is built for this export and reads it as
              intended. Your file is kept — no need to upload it again.
            </p>
            <button type="button" className="btn-primary mt-3" onClick={applySuggestedWorkflow}>
              Use {suggestedWorkflow.name}
            </button>
          </div>
        )}

        {/* ——— Workbook review ——— */}
        {isWorkbook && wizardStep === 1 && workbookPreview && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-noc-border bg-noc-bg/40 p-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
                  Default target threshold (%)
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.1}
                  value={defaultThreshold}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 99;
                    setDefaultThreshold(v);
                    setKpiThresholds((prev) => {
                      const next = { ...prev };
                      workbookPreview.kpis?.forEach((kpi) => {
                        if (kpi.valid && next[kpi.kpiName] === undefined) {
                          next[kpi.kpiName] = v;
                        }
                      });
                      return next;
                    });
                  }}
                  className="input-field tabular w-28"
                />
              </label>
              <p className="pb-2.5 text-xs text-noc-muted">
                Override the threshold per KPI in the table below
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile label="Data sheets" value={workbookPreview.dataSheetCount} />
              <StatTile label="Valid" value={workbookPreview.validCount} tone="success" />
              <StatTile
                label="Invalid"
                value={workbookPreview.invalidCount}
                tone={workbookPreview.invalidCount > 0 ? 'danger' : 'muted'}
              />
              <StatTile
                label="Ignored"
                value={workbookPreview.ignoredSheetCount}
                tone="muted"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-noc-border">
              <div className="overflow-x-auto">
                <table className="tabular w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-bg/50 text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                      <th className="px-4 py-3 font-medium">KPI</th>
                      <th className="px-4 py-3 font-medium">Sheet</th>
                      <th className="px-4 py-3 font-medium">Rows</th>
                      <th className="px-4 py-3 font-medium">Granularity</th>
                      <th className="px-4 py-3 font-medium">Threshold %</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workbookPreview.kpis?.map((kpi) => (
                      <tr
                        key={kpi.sheetName}
                        className="border-b border-noc-border/40 transition-colors last:border-0 hover:bg-noc-accent/[0.04]"
                      >
                        <td className="px-4 py-3 font-medium text-noc-text">{kpi.kpiName}</td>
                        <td className="px-4 py-3 text-xs text-noc-muted">{kpi.sheetName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-noc-textDim">
                          {kpi.rowCount}
                        </td>
                        <td className="px-4 py-3 text-noc-textDim">{kpi.granularity}</td>
                        <td className="px-4 py-3">
                          {kpi.valid ? (
                            <input
                              type="number"
                              min={1}
                              max={100}
                              step={0.1}
                              aria-label={`Threshold for ${kpi.kpiName}`}
                              value={kpiThresholds[kpi.kpiName] ?? defaultThreshold}
                              onChange={(e) =>
                                setKpiThresholds((prev) => ({
                                  ...prev,
                                  [kpi.kpiName]: Number(e.target.value) || defaultThreshold,
                                }))
                              }
                              className="input-field tabular w-20 px-2 py-1 text-xs"
                            />
                          ) : (
                            <span className="text-noc-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {kpi.valid ? (
                            <span className="badge badge-success">Ready</span>
                          ) : (
                            <span
                              className="badge badge-danger"
                              title={kpi.errors?.[0]?.message}
                            >
                              Invalid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {workbookPreview.invalidCount > 0 && (
              <p className="text-xs text-noc-muted">
                Invalid sheets are skipped. Hover the status chip to see why a sheet failed.
              </p>
            )}
          </div>
        )}

        {/* ——— Single KPI configure ——— */}
        {!isWorkbook && wizardStep === 2 && preview && workflowSlug && (
          <div className="space-y-4">
            {fileRejected && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-noc-danger/30 bg-noc-danger/[0.07] p-4"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-noc-danger" strokeWidth={2.25} />
                <div>
                  <p className="tabular text-sm font-semibold tracking-tight text-noc-text">
                    This file does not fit {selectedWorkflow?.name || 'this workflow'}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {preview.fileCheck.errors.map((err, i) => (
                      <li key={i} className="text-xs leading-relaxed text-noc-textDim">
                        {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <ExcelPreview
              preview={preview}
              workflowSlug={workflowSlug}
              selectedSheetIndex={sheetIndex}
              onSheetChange={handleSheetChange}
              headerRowIndex={headerRowIndex}
              dataStartRowIndex={dataStartRowIndex}
              onHeaderRowChange={(v) => {
                setHeaderRowIndex(v);
                setValidationResult(null);
              }}
              onDataStartRowChange={(v) => {
                setDataStartRowIndex(v);
                setValidationResult(null);
              }}
            />

            {validationResult && (
              <div
                aria-live="polite"
                className={clsx(
                  'flex items-start gap-3 rounded-xl border p-4',
                  validationResult.valid
                    ? 'border-noc-success/30 bg-noc-success/[0.07]'
                    : 'border-noc-danger/30 bg-noc-danger/[0.07]'
                )}
              >
                <span
                  className={clsx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    validationResult.valid
                      ? 'bg-noc-success/15 text-noc-success'
                      : 'bg-noc-danger/15 text-noc-danger'
                  )}
                >
                  {validationResult.valid ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
                  )}
                </span>
                <div>
                  <p className="tabular text-sm font-semibold tracking-tight text-noc-text">
                    {validationResult.valid
                      ? `Validation passed — ${validationResult.rowCount} rows ready`
                      : 'Validation failed'}
                  </p>
                  {!validationResult.valid &&
                    (validationResult.errors?.length ? (
                      <ul className="mt-1.5 space-y-1">
                        {validationResult.errors.map((err, i) => (
                          <li key={i} className="text-xs leading-relaxed text-noc-textDim">
                            {err.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs leading-relaxed text-noc-textDim">
                        Adjust the header or data start row above, then validate again.
                      </p>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {file && workbookPreview?.suggestWorkbookMode && mode !== 'workbook' && (
          <div className="rounded-xl border border-noc-accent/30 bg-noc-accent/[0.07] p-4">
            <p className="tabular text-sm font-semibold tracking-tight text-noc-text">
              This file looks like a CMM workbook
            </p>
            <p className="tabular mt-1 text-xs text-noc-textDim">
              {workbookPreview.dataSheetCount} Data sheets were detected. Workbook mode produces
              one report per sheet.
            </p>
            <button type="button" className="btn-primary mt-3" onClick={() => switchMode('workbook')}>
              Switch to workbook mode
            </button>
          </div>
        )}

        {errorText && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-3 rounded-xl border border-noc-danger/30 bg-noc-danger/[0.07] p-4"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-noc-danger"
              strokeWidth={ICON_STROKE}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight text-noc-text">
                {uploadError ? 'Upload could not continue' : 'Preview could not be generated'}
              </p>
              <p className="mt-1 break-words text-xs leading-relaxed text-noc-textDim">
                {errorText}
              </p>
              {!uploadError && (
                <p className="mt-1.5 text-xs leading-relaxed text-noc-muted">
                  You can still continue — the preview only chooses the sheet for you.
                </p>
              )}
              {(requestId || failedStatus) && (
                <p className="tabular mt-2 font-mono text-[11px] text-noc-muted">
                  {failedStatus ? `status ${failedStatus}` : null}
                  {failedStatus && requestId ? '  ·  ' : null}
                  {requestId ? `request ${requestId}` : null}
                </p>
              )}
              {!uploadError && file && (
                <button
                  type="button"
                  onClick={retryPreview}
                  disabled={previewPending}
                  className="btn-secondary mt-3 px-3 py-1.5 text-xs"
                >
                  <RefreshCw
                    className={clsx('h-3.5 w-3.5', previewPending && 'animate-spin')}
                    strokeWidth={ICON_STROKE}
                  />
                  {previewPending ? 'Retrying…' : 'Try again'}
                </button>
              )}
            </div>
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="space-y-2">
            <div className="tabular flex justify-between text-[11px] font-medium text-noc-muted">
              <span className="uppercase tracking-[0.12em]">Uploading</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-noc-border/60">
              <div
                className="h-full rounded-full bg-noc-accent transition-[width] duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-noc-border pt-5">
          {wizardStep > 0 && (
            <button type="button" onClick={goBack} className="btn-secondary">
              <ChevronLeft className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Back
            </button>
          )}

          <div className="flex flex-1 flex-wrap justify-end gap-3">
            {!isWorkbook && wizardStep < 2 && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext()}
                className="btn-secondary"
              >
                Continue
                <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} />
              </button>
            )}

            {!isWorkbook && wizardStep === 2 && (
              <button
                type="button"
                onClick={() => validateMutation.mutate()}
                disabled={!file || !workflowSlug || !preview || validateMutation.isPending}
                className="btn-secondary"
              >
                {validateMutation.isPending ? 'Validating…' : 'Validate'}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                isWorkbook ? workbookUploadMutation.mutate() : uploadMutation.mutate()
              }
              disabled={
                !file ||
                (isWorkbook
                  ? wizardStep < 1 ||
                    !workbookPreview ||
                    workbookPreview.validCount === 0 ||
                    workbookUploadMutation.isPending
                  : wizardStep < 2 ||
                    !workflowSlug ||
                    !preview ||
                    uploadMutation.isPending ||
                    fileRejected ||
                    (validationResult && !validationResult.valid))
              }
              className="btn-primary min-w-[168px]"
            >
              {isWorkbook
                ? workbookUploadMutation.isPending
                  ? 'Processing…'
                  : `Process ${workbookPreview?.validCount || 0} KPIs`
                : uploadMutation.isPending
                  ? 'Uploading…'
                  : 'Upload and process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
