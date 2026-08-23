import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileJson,
  ClipboardCheck,
  Copy,
  Download,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { workflowDefinitionApi } from '../api';
import { downloadBlob } from '../utils/downloadBlob';

const ICON_STROKE = 1.75;
const EXAMPLE_NAME = 'traffic-volume';

/**
 * The prompt a user pastes into any AI chat to get a definition back. It mirrors
 * backend/src/kpi-definitions/validator.js key for key and enum for enum — the
 * validator rejects unknown fields outright, so a prompt that invents a convenient
 * field would produce JSON that is guaranteed to fail import.
 */
const AI_PROMPT = `Write one Core Insight KPI workflow definition as a single JSON object. No commentary, no markdown fence, no comments inside the JSON. Unknown fields are rejected, so use only the keys below.

Top level: schemaVersion (must be "1.0"), slug (lowercase letters, digits and hyphens, 2-63 chars, must not clash with an existing workflow), name, description?, version? ("1.0.0" form), metadata? { category, technology[], reportType, icon, unit }, source, transform, series, metrics, charts?, presentation?, anomalies?, target?.

source: { sheet?: { namePatterns[], headerRowIndex, dataStartRowIndex }, headerMatch?: { mode: "exact"|"contains"|"loose", stripParentheses, normalizeWhitespace }, skipFieldCodeRows?, columns: [ { key, label, type: "date"|"number"|"string", required?, aliases[] } ] }. An alias is a spreadsheet header as it really appears in the export. A key starts with a letter and holds letters, digits and underscores.

transform: { timestampField (a source column of type date), entityField?, fields?: [ { name, from (source column key), type: "number"|"string"|"date", default?, dropRowIfNull? } ], derived?: [...] }.
derived ops, each with a fixed argument set: sum { fields[], scale?, divisor? }, difference { fields[2] }, product { fields[], scale?, divisor? }, ratio { numerator, denominator, asPercent?, scale? }, scale { field, factor?, divisor? }, constant { value }, coalesce { fields[], treatZeroAsMissing?, fallback? }, classify { field, rules: [ { match: "contains"|"equals"|"startsWith"|"endsWith", text, value } ], default?, caseInsensitive?, dropRowIfNull? }, datePart { field, part: "year"|"month"|"day"|"hour"|"weekday"|"dateKey"|"isoString" }. Every entry carries name and op, and may only reference fields declared before it.

series: { valueField?, aggregate?: "sum"|"avg"|"max"|"min", totalMode?: "valueField"|"streams", granularity?: "auto"|"native"|"hourly"|"daily"|"weekly"|"monthly", granularityLabels?, spanFormat?: "short"|"numeric", includeDailyPeaks?, splitOutputKey?, totalColor?, totalFill?, streams?: [ { key, label, from: { field, equals? }, color?, fill?, sharePctField? } ] }. Give either valueField or at least one stream. Colours are "#rrggbb"; fills are "#rrggbb" or "rgba(r, g, b, a)".

metrics (1 to 60): [ { key, label?, op, over?: "series"|"records", round?, format?, unit?, plus the arguments the op needs } ]. op is one of sum, avg, min, max, count, countDistinct, first, last, sharePct, peakLabel, peakValue, minLabel, minValue, latestLabel, latestValue, constant, builtin. constant takes value; builtin takes ref from granularityKey, granularityLabel, periodLabel, spanLabel, spanStart, spanEnd, pointCount, dayCount, recordCount, streamCount; sharePct takes field and ofField?; the rest take field (sum also accepts fields[]). format is one of number, integer, percent, text, throughput, bytes, compact. Over "series" the readable fields are total, value, every stream key and every stream's <key>SharePct; over "records" they are the transform fields.

charts (up to 12): [ { id (lowercase and hyphens), type: "line"|"area"|"bar"|"doughnut"|"pie", title, description?, source?: "series"|"split", series: [ { field, label?, color?, fill?, stack?, fillArea? } ], stacked?, tension?, appendGranularity? } ]. With source "split" omit the series list — the chart draws the stream totals.

presentation: { title?, kpiName?, subtitle?, highlights?: [ { label, metric, format?, unit?, trend?: "up"|"down"|"neutral" } ], narrativeTemplate?, narrativeLongTemplate?, teams?: { themeColor ("rrggbb", no hash), activityTitle, facts: [ { name, metric, format?, unit? } ] } }. Templates interpolate {metricKey} tokens and may only name declared metrics.

anomalies: { method: "stddev", sigma?, direction?: "above"|"below"|"both", minPoints?, field?, type?, format?, messageTemplate? }. target: { value, unit?, direction?: "max"|"min", label? }.

No regular expressions, no formula or expression strings, no fields outside this list. Never use constructor, prototype, toString, valueOf or hasOwnProperty as an identifier. The KPI to build is: `;

function Fact({ label, value }) {
  return (
    <div className="rounded-xl border border-noc-border bg-noc-bg/40 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-noc-text">{value}</p>
    </div>
  );
}

function Chips({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.key}
            className="rounded-md border border-noc-border bg-noc-bg px-2 py-0.5 font-mono text-[10px] text-noc-textDim"
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Field path first, then the plain-language message — never a raw JSON dump. */
function ErrorList({ errors }) {
  return (
    <ol className="space-y-2">
      {errors.map((err, i) => (
        <li
          key={`${err.path}-${i}`}
          className="rounded-xl border border-noc-danger/30 bg-noc-danger/5 px-3.5 py-2.5"
        >
          <p className="break-all font-mono text-[11px] font-medium text-noc-danger">
            {err.path || 'document root'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-noc-text">{err.message}</p>
          {err.expected && (
            <p className="mt-0.5 text-xs leading-relaxed text-noc-textDim">
              Expected {err.expected}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function WorkflowDefinitionImport({ onImported }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState(null);
  const [imported, setImported] = useState(null);
  const [failure, setFailure] = useState(null);
  const [copied, setCopied] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  /* Any edit invalidates the previous dry run, so Import can never act on a stale
     verdict for text that has since changed. */
  const updateText = (value) => {
    setText(value);
    setResult(null);
    setImported(null);
    setFailure(null);
  };

  const readFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setFailure({ errors: [{ path: file.name, message: 'Only .json files can be imported' }] });
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    updateText(content);
  };

  const validateMutation = useMutation({
    mutationFn: () => workflowDefinitionApi.validate(text).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      setFailure(null);
    },
    onError: (err) =>
      setFailure({
        errors: [{ path: '', message: err.response?.data?.error || 'The check could not be completed' }],
      }),
  });

  const importMutation = useMutation({
    mutationFn: () => workflowDefinitionApi.import(text).then((r) => r.data),
    onSuccess: (data) => {
      setImported(data.definition);
      setResult(null);
      setText('');
      setFileName('');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
      onImported?.(data.definition);
    },
    onError: (err) => {
      const data = err.response?.data;
      setFailure({
        errors: data?.errors?.length
          ? data.errors
          : [{ path: '', message: data?.error || 'The definition could not be imported' }],
      });
    },
  });

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setPromptOpen(true);
    }
  };

  const downloadExample = async () => {
    const res = await workflowDefinitionApi.example(EXAMPLE_NAME);
    downloadBlob(res.data, `${EXAMPLE_NAME}.definition.json`);
  };

  const busy = validateMutation.isPending || importMutation.isPending;
  const errors = failure?.errors || (result && !result.valid ? result.errors : null);
  const preview = result?.valid ? result.preview : null;

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Import</p>
          <h2 className="mt-2 text-base font-semibold text-noc-text">
            Add a workflow from a JSON definition
          </h2>
          <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-noc-textDim">
            An AI chat writes the definition, you import it here. Nothing is stored until it
            passes the platform validator, and an import can only add a new workflow — the
            built-in ones cannot be replaced.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={downloadExample}>
            <Download className="h-4 w-4" strokeWidth={ICON_STROKE} />
            Download example
          </button>
          <button type="button" className="btn-secondary" onClick={copyPrompt}>
            {copied ? (
              <ClipboardCheck className="h-4 w-4 text-noc-success" strokeWidth={ICON_STROKE} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={ICON_STROKE} />
            )}
            {copied ? 'Prompt copied' : 'Copy AI prompt'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-noc-border bg-noc-bg/40 px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left text-sm font-medium text-noc-text"
          onClick={() => setPromptOpen((open) => !open)}
        >
          <Sparkles className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          {promptOpen ? 'Hide the prompt' : 'Show the prompt to paste into an AI chat'}
        </button>
        {promptOpen && (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-noc-border bg-noc-surface p-3 font-mono text-[11px] leading-relaxed text-noc-textDim">
            {AI_PROMPT}
          </pre>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div
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
          readFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          'rounded-2xl border-2 border-dashed p-4 transition-all duration-200',
          dragActive ? 'border-noc-accent bg-noc-accent/[0.07]' : 'border-noc-border bg-noc-bg/30'
        )}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-noc-textDim">
            <FileJson className="h-4 w-4 shrink-0 text-noc-accent" strokeWidth={ICON_STROKE} />
            <span className="truncate">
              {fileName || 'Paste the definition, or drop a .json file here'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent active:translate-y-px"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse files
            </button>
            {text && (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-danger active:translate-y-px"
                onClick={() => {
                  setFileName('');
                  updateText('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <label htmlFor="definition-json" className="sr-only">
          Workflow definition JSON
        </label>
        <textarea
          id="definition-json"
          className="input-field h-64 resize-y font-mono text-xs leading-relaxed"
          spellCheck={false}
          placeholder='{ "schemaVersion": "1.0", "slug": "my-kpi", … }'
          value={text}
          onChange={(e) => {
            setFileName('');
            updateText(e.target.value);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!text.trim() || busy}
          onClick={() => validateMutation.mutate()}
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={ICON_STROKE} />
          {validateMutation.isPending ? 'Checking' : 'Validate'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!preview || busy}
          onClick={() => importMutation.mutate()}
        >
          <Check className="h-4 w-4" strokeWidth={ICON_STROKE} />
          {importMutation.isPending ? 'Importing' : 'Import workflow'}
        </button>
        {!preview && text.trim() && !errors && (
          <p className="text-xs text-noc-muted">Validate first — import needs a clean check.</p>
        )}
      </div>

      {imported && (
        <div className="rounded-xl border border-noc-success/30 bg-noc-success/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-noc-text">
            <Check className="h-4 w-4 text-noc-success" strokeWidth={ICON_STROKE} />
            {imported.name} was imported
          </p>
          <p className="mt-1 text-sm leading-relaxed text-noc-textDim">
            It is listed below as{' '}
            <span className="font-mono text-xs text-noc-accent">{imported.slug}</span> and can be
            selected on the upload screen straight away.
          </p>
        </div>
      )}

      {errors && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-noc-text">
            <AlertTriangle className="h-4 w-4 text-noc-danger" strokeWidth={ICON_STROKE} />
            {errors.length} {errors.length === 1 ? 'problem' : 'problems'} to fix
          </p>
          <p className="text-sm leading-relaxed text-noc-textDim">
            Each line names the field path in your JSON. Paste this list back into the AI chat and
            ask it to correct the definition.
          </p>
          <ErrorList errors={errors} />
        </div>
      )}

      {preview && (
        <div className="space-y-4 rounded-2xl border border-noc-accent/30 bg-noc-accent/[0.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-noc-text">
              <ShieldCheck className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              The definition is valid. This is what will be created.
            </p>
            {result.replaces && (
              <span className="badge badge-warning normal-case tracking-normal">
                Replaces the imported version {result.replaces.version}
              </span>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Slug" value={preview.slug} />
            <Fact label="Name" value={preview.name} />
            <Fact label="Version" value={preview.version} />
            <Fact label="Measures" value={preview.valueField || `${preview.streams.length} streams`} />
          </div>

          {preview.description && (
            <p className="text-sm leading-relaxed text-noc-textDim">{preview.description}</p>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Chips
              title={`Required columns (${preview.requiredColumns.length})`}
              items={preview.requiredColumns.map((c) => ({ key: c.key, label: c.label }))}
            />
            <Chips
              title={`Metrics (${preview.metrics.length})`}
              items={preview.metrics.map((m) => ({ key: m.key, label: m.label }))}
            />
            <Chips
              title={`Charts (${preview.charts.length})`}
              items={preview.charts.map((c) => ({ key: c.id, label: c.title }))}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export function ImportPanelToggle({ open, onToggle }) {
  return (
    <button type="button" className="btn-primary" onClick={onToggle}>
      {open ? (
        <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
      ) : (
        <FileJson className="h-4 w-4" strokeWidth={ICON_STROKE} />
      )}
      {open ? 'Close importer' : 'Import definition'}
    </button>
  );
}
