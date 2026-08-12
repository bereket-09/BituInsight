import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Eye,
  Layers,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { workflowApi, reportApi, workbookApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import ExcelPreview from '../components/ExcelPreview';
import KpiWorkflowSelector from '../components/KpiWorkflowSelector';
import UploadWizardSteps from '../components/UploadWizardSteps';

const SINGLE_STEPS = [
  { id: 'workflow', label: 'KPI workflow', hint: 'Choose parser' },
  { id: 'file', label: 'Upload file', hint: 'Excel export' },
  { id: 'configure', label: 'Map & validate', hint: 'Preview rows' },
];

const WORKBOOK_STEPS = [
  { id: 'file', label: 'Upload workbook', hint: 'CMM .xlsx' },
  { id: 'review', label: 'Review KPIs', hint: 'Thresholds' },
];

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

  const resetFile = () => {
    setFile(null);
    setPreview(null);
    setWorkbookPreview(null);
    setValidationResult(null);
    setWizardStep(isWorkbook ? 0 : workflowSlug ? 1 : 0);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setWizardStep(0);
    setFile(null);
    setPreview(null);
    setWorkbookPreview(null);
    setValidationResult(null);
    setWorkflowSlug('');
    setUploadError('');
  };

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

  if (isLoading) return <LoadingSpinner label="Loading workflows..." />;

  const previewPending = isWorkbook ? workbookPreviewMutation.isPending : previewMutation.isPending;
  const previewError = isWorkbook ? workbookPreviewMutation.error : previewMutation.error;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-noc-border bg-gradient-to-br from-noc-card via-noc-card to-noc-accent/10 px-6 py-8 md:px-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-noc-accent/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-noc-accent/30 bg-noc-accent/10 px-3 py-1 text-xs font-medium text-noc-accent">
            <Sparkles className="h-3.5 w-3.5" />
            New report wizard
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create KPI insight</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-noc-muted">
            Upload a full CMM workbook to process every Data sheet, or pick a single KPI workflow
            for one-off Excel exports.
          </p>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl border border-noc-border bg-noc-surface/50 p-1">
        <button
          type="button"
          onClick={() => switchMode('workbook')}
          className={clsx(
            'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all',
            isWorkbook
              ? 'bg-noc-card text-noc-accent shadow-card ring-1 ring-noc-accent/20'
              : 'text-noc-muted hover:text-noc-text'
          )}
        >
          <Layers className="h-4 w-4" />
          CMM Workbook
          <span className="hidden text-[10px] font-normal text-noc-muted sm:inline">
            Multi-KPI
          </span>
        </button>
        <button
          type="button"
          onClick={() => switchMode('single')}
          className={clsx(
            'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all',
            !isWorkbook
              ? 'bg-noc-card text-noc-accent shadow-card ring-1 ring-noc-accent/20'
              : 'text-noc-muted hover:text-noc-text'
          )}
        >
          <GitBranch className="h-4 w-4" />
          Single KPI
          <span className="hidden text-[10px] font-normal text-noc-muted sm:inline">
            One workflow
          </span>
        </button>
      </div>

      <div className="card border-noc-accent/15 bg-noc-card/80 px-4 py-5 sm:px-6">
        <UploadWizardSteps
          steps={steps}
          currentIndex={wizardStep}
          onStepClick={(idx) => setWizardStep(idx)}
        />
      </div>

      <div className="card space-y-6">
        {/* ——— Single KPI: workflow step ——— */}
        {!isWorkbook && wizardStep === 0 && (
          <KpiWorkflowSelector
            workflows={workflows}
            value={workflowSlug}
            onChange={handleWorkflowSelect}
          />
        )}

        {/* ——— File upload step ——— */}
        {((isWorkbook && wizardStep === 0) || (!isWorkbook && wizardStep === 1)) && (
          <div className="space-y-4">
            {!isWorkbook && selectedWorkflow && (
              <div className="flex items-center gap-3 rounded-xl border border-noc-border bg-noc-surface/50 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-noc-accent/15">
                  <GitBranch className="h-4 w-4 text-noc-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-noc-muted">Selected workflow</p>
                  <p className="truncate text-sm font-semibold">{selectedWorkflow.name}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-noc-accent hover:underline"
                  onClick={() => setWizardStep(0)}
                >
                  Change
                </button>
              </div>
            )}

            {isWorkbook && (
              <div className="rounded-xl border border-noc-accent/20 bg-gradient-to-r from-noc-accent/10 to-transparent p-4 text-sm text-noc-muted">
                <p className="font-medium text-noc-text">CMM workbook mode</p>
                <p className="mt-1 leading-relaxed">
                  Only sheets named <strong className="text-noc-accent">Data…</strong> are processed.
                  Each valid sheet becomes its own KPI report with charts and workbook tabs.
                </p>
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-noc-border bg-noc-surface/30 p-12 text-center transition-all hover:border-noc-accent/50 hover:bg-noc-accent/5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files[0] || null;
                  setFile(f);
                  setValidationResult(null);
                  setPreview(null);
                  setWorkbookPreview(null);
                  setUploadError('');
                  if (!f) return;
                  if (isWorkbook) setWizardStep(0);
                  else if (workflowSlug) setWizardStep(1);
                }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-noc-accent/15">
                    <FileSpreadsheet className="h-7 w-7 text-noc-accent" />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-xs text-noc-muted">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetFile();
                    }}
                    className="rounded-lg border border-noc-border p-2 hover:bg-noc-card"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-noc-accent/10 transition-transform group-hover:scale-105">
                    <UploadIcon className="h-7 w-7 text-noc-accent" />
                  </div>
                  <p className="mt-4 text-sm font-medium">Drop Excel here or click to browse</p>
                  <p className="mt-1 text-xs text-noc-muted">.xlsx · .xls</p>
                </>
              )}
            </div>

            {previewPending && (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-noc-surface/80 py-4 text-sm text-noc-muted">
                <Eye className="h-4 w-4 animate-pulse text-noc-accent" />
                {isWorkbook ? 'Scanning Data sheets…' : 'Reading workbook structure…'}
              </div>
            )}
          </div>
        )}

        {/* ——— Workbook review ——— */}
        {isWorkbook && wizardStep === 1 && workbookPreview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-noc-border bg-noc-surface/50 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-noc-muted">
                  Default target threshold (%)
                </label>
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
                  className="input-field w-28"
                />
              </div>
              <p className="text-xs text-noc-muted">Override per KPI in the table below</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-noc-border bg-noc-surface/50 p-4">
                <p className="text-xs text-noc-muted">Data sheets</p>
                <p className="text-2xl font-bold">{workbookPreview.dataSheetCount}</p>
              </div>
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                <p className="text-xs text-noc-muted">Valid</p>
                <p className="text-2xl font-bold text-green-400">{workbookPreview.validCount}</p>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-xs text-noc-muted">Invalid</p>
                <p className="text-2xl font-bold text-red-400">{workbookPreview.invalidCount}</p>
              </div>
              <div className="rounded-xl border border-noc-border bg-noc-surface/50 p-4">
                <p className="text-xs text-noc-muted">Ignored</p>
                <p className="text-2xl font-bold">{workbookPreview.ignoredSheetCount}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-noc-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-noc-border bg-noc-surface/80 text-left text-xs text-noc-muted">
                    <th className="px-4 py-3">KPI</th>
                    <th className="px-4 py-3">Sheet</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Granularity</th>
                    <th className="px-4 py-3">Threshold %</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workbookPreview.kpis?.map((kpi) => (
                    <tr key={kpi.sheetName} className="border-b border-noc-border/40">
                      <td className="px-4 py-3 font-medium">{kpi.kpiName}</td>
                      <td className="px-4 py-3 text-xs text-noc-muted">{kpi.sheetName}</td>
                      <td className="px-4 py-3 font-mono">{kpi.rowCount}</td>
                      <td className="px-4 py-3">{kpi.granularity}</td>
                      <td className="px-4 py-3">
                        {kpi.valid ? (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={0.1}
                            value={kpiThresholds[kpi.kpiName] ?? defaultThreshold}
                            onChange={(e) =>
                              setKpiThresholds((prev) => ({
                                ...prev,
                                [kpi.kpiName]: Number(e.target.value) || defaultThreshold,
                              }))
                            }
                            className="input-field w-20 py-1 text-xs"
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {kpi.valid ? (
                          <span className="badge-success">Ready</span>
                        ) : (
                          <span className="text-red-400" title={kpi.errors?.[0]?.message}>
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
        )}

        {/* ——— Single KPI configure ——— */}
        {!isWorkbook && wizardStep === 2 && preview && workflowSlug && (
          <div className="space-y-4">
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
                className={clsx(
                  'rounded-xl border p-4',
                  validationResult.valid
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                )}
              >
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  )}
                  <span className="font-medium">
                    {validationResult.valid
                      ? `Validation passed — ${validationResult.rowCount} rows ready`
                      : 'Validation failed — fix mapping and try again'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {file && workbookPreview?.suggestWorkbookMode && mode !== 'workbook' && (
          <div className="rounded-xl border border-noc-accent/40 bg-noc-accent/10 p-4 text-sm">
            <p className="font-medium text-noc-accent">
              This file looks like a CMM workbook ({workbookPreview.dataSheetCount} Data sheets)
            </p>
            <button type="button" className="btn-primary mt-3" onClick={() => switchMode('workbook')}>
              Switch to CMM Workbook mode
            </button>
          </div>
        )}

        {(previewError || uploadError) && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {uploadError || `Preview failed: ${previewError?.response?.data?.error || previewError.message}`}
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-noc-muted">
              <span>Uploading</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-noc-surface">
              <div
                className="h-full rounded-full bg-noc-accent transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-noc-border pt-4">
          {wizardStep > 0 && (
            <button type="button" onClick={goBack} className="btn-secondary">
              <ChevronLeft className="h-4 w-4" />
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
                <ChevronRight className="h-4 w-4" />
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
                    (validationResult && !validationResult.valid))
              }
              className="btn-primary min-w-[160px]"
            >
              {isWorkbook
                ? workbookUploadMutation.isPending
                  ? 'Processing…'
                  : `Process ${workbookPreview?.validCount || 0} KPIs`
                : uploadMutation.isPending
                  ? 'Uploading…'
                  : 'Upload & Process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
