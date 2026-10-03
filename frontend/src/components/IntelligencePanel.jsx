import { useState } from 'react';
import clsx from 'clsx';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Check,
  ChevronDown,
} from 'lucide-react';

const ICON_STROKE = 1.75;

/*
 * Severity is carried by four signals at once — rank order in the list, the
 * number of filled marks, type weight, and colour last — so it survives
 * greyscale printing and colour-blind readers.
 */
const SEVERITY = {
  critical: {
    rank: 0,
    marks: 3,
    label: 'Urgent',
    text: 'text-noc-danger',
    rail: 'bg-noc-danger',
    chip: 'bg-noc-danger/10 text-noc-danger',
    title: 'text-[15px] font-semibold',
  },
  major: {
    rank: 1,
    marks: 2,
    label: 'Important',
    text: 'text-noc-warning',
    rail: 'bg-noc-warning',
    chip: 'bg-noc-warning/10 text-noc-warning',
    title: 'text-[15px] font-semibold',
  },
  minor: {
    rank: 2,
    marks: 1,
    label: 'Small',
    text: 'text-noc-info',
    rail: 'bg-noc-info',
    chip: 'bg-noc-info/10 text-noc-info',
    title: 'text-sm font-medium',
  },
  info: {
    rank: 3,
    marks: 0,
    label: 'Note',
    text: 'text-noc-muted',
    rail: 'bg-noc-border',
    chip: 'bg-noc-muted/10 text-noc-muted',
    title: 'text-sm font-medium',
  },
};

const severityOf = (severity) => SEVERITY[severity] || SEVERITY.info;

/** Only the few findings that matter most; the rest is noise for a skim. */
const MAX_FINDINGS = 3;

/*
 * The narrative layer is provider-agnostic: `source` says whether a model wrote
 * it at all, `provider` says which one. Never hardcode a vendor name here — a
 * wrong attribution is worse than a generic one.
 */
const PROVIDER_LABELS = {
  groq: 'Groq',
  openai: 'OpenAI',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
  azure: 'Azure',
  mistral: 'Mistral',
  together: 'Together',
};

function narrativeAttribution(narrative) {
  const modelAuthored = narrative?.source === 'model' || narrative?.source === 'claude';
  if (!modelAuthored) return { label: 'Computed', title: 'Derived from the data, no model used' };

  const provider = narrative?.provider?.trim();
  const label =
    (provider && (PROVIDER_LABELS[provider.toLowerCase()] || provider.replace(/^./, (c) => c.toUpperCase()))) ||
    'Model';

  return { label, title: narrative?.model ? `Written by ${narrative.model}` : undefined };
}

const QUALITY_STYLES = {
  good: 'text-noc-success',
  acceptable: 'text-noc-accent',
  degraded: 'text-noc-warning',
  unreliable: 'text-noc-danger',
  unusable: 'text-noc-danger',
};

function TrendIcon({ direction }) {
  if (direction === 'rising')
    return <TrendingUp className="h-4 w-4 text-noc-warning" strokeWidth={ICON_STROKE} />;
  if (direction === 'falling')
    return <TrendingDown className="h-4 w-4 text-noc-info" strokeWidth={ICON_STROKE} />;
  return <Minus className="h-4 w-4 text-noc-muted" strokeWidth={ICON_STROKE} />;
}

/** Three ticks, filled to match severity — legible without colour. */
function SeverityMarks({ style }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={clsx(
            'h-2.5 w-[3px] rounded-full',
            i < style.marks ? style.rail : 'bg-noc-border'
          )}
        />
      ))}
    </span>
  );
}

function Vital({ icon: Icon, label, value, sub, valueClass = 'text-noc-text', index }) {
  return (
    <div
      className={clsx(
        'px-5 py-4',
        index > 0 && 'border-t border-noc-border sm:border-l sm:border-t-0'
      )}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />}
        {label}
      </dt>
      <dd className={clsx('tabular mt-2 font-display text-2xl font-semibold', valueClass)}>
        {value}
      </dd>
      {sub && <p className="tabular mt-1 text-xs text-noc-muted">{sub}</p>}
    </div>
  );
}

function Finding({ finding }) {
  const style = severityOf(finding.severity);
  // The two loudest tiers open by default: a critical finding should never
  // require a click to be read.
  const [open, setOpen] = useState(style.rank <= 1);

  return (
    <li className="relative">
      <span
        className={clsx('absolute inset-y-0 left-0 w-[3px]', style.rail)}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-4 pl-5 pr-4 text-left transition-colors duration-200 hover:bg-noc-accent/[0.04]"
      >
        <span className="mt-1 shrink-0">
          <SeverityMarks style={style} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              'block text-[10px] font-semibold uppercase tracking-[0.16em]',
              style.text
            )}
          >
            {style.label}
          </span>
          <span className={clsx('mt-1 block text-noc-text', style.title)}>{finding.title}</span>
          {open && finding.detail && (
            <span className="mt-2 block text-sm leading-relaxed text-noc-textDim">
              {finding.detail}
            </span>
          )}
        </span>
        <ChevronDown
          className={clsx(
            'mt-0.5 h-4 w-4 shrink-0 text-noc-muted transition-transform duration-200',
            open && 'rotate-180'
          )}
          strokeWidth={ICON_STROKE}
        />
      </button>
    </li>
  );
}

/**
 * Renders the analytics + narrative layer attached to a processed report.
 * Silently renders nothing when a report predates the intelligence layer.
 */
export default function IntelligencePanel({ intelligence }) {
  if (!intelligence?.available) return null;

  const { narrative, findings = [], dataQuality, trend, dailyShape, scope } =
    intelligence;

  const attribution = narrativeAttribution(narrative);
  const qualityClass = QUALITY_STYLES[dataQuality?.grade] || 'text-noc-text';
  const ranked = [...findings].sort(
    (a, b) => severityOf(a.severity).rank - severityOf(b.severity).rank
  );
  const topSeverity = ranked.length ? severityOf(ranked[0].severity) : null;

  const QUALITY_WORDS = {
    good: 'Good',
    acceptable: 'OK',
    degraded: 'Patchy',
    unreliable: 'Poor',
    unusable: 'Poor',
  };
  const DIRECTION_WORDS = { rising: 'Going up', falling: 'Going down' };

  const vitals = [
    {
      icon: ShieldCheck,
      label: 'Data',
      value: QUALITY_WORDS[dataQuality?.grade] ?? '—',
      sub: dataQuality?.coveragePct != null ? `${dataQuality.coveragePct}% received` : undefined,
      valueClass: qualityClass,
    },
    {
      icon: Activity,
      label: 'Direction',
      value: (trend?.available && DIRECTION_WORDS[trend.direction]) || 'Steady',
      sub:
        trend?.available && trend.direction !== 'flat' && trend.totalChangePct != null
          ? `${trend.totalChangePct > 0 ? '+' : ''}${trend.totalChangePct}% overall`
          : undefined,
    },
    {
      icon: dailyShape ? Activity : Minus,
      label: 'Busiest time',
      value: dailyShape?.busiest?.label ?? '—',
      sub: dailyShape ? `quietest ${dailyShape.quietest.label}` : undefined,
    },
  ];

  const shown = ranked.slice(0, MAX_FINDINGS);

  return (
    <div className="space-y-5">
      {/* ——— The lede: everything else on the page supports this paragraph ——— */}
      {narrative?.summary && (
        <article className="card overflow-hidden p-0">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-noc-border/70 px-6 py-3.5">
            <span className="eyebrow">Executive summary</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {narrative.riskLevel && narrative.riskLevel !== 'none' && (
                <span className="badge badge-warning">{narrative.riskLevel} risk</span>
              )}
              <span className="badge badge-neutral" title={attribution.title}>
                {attribution.label}
              </span>
            </span>
          </header>

          <div className="px-6 py-6">
            <p className="max-w-[68ch] font-display text-[17px] font-medium leading-[1.6] tracking-tight text-noc-text sm:text-lg">
              {narrative.summary}
            </p>

            {narrative.keyPoints?.length > 0 && (
              <ul className="mt-6 space-y-3 border-t border-noc-border pt-5">
                {narrative.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-noc-textDim">
                    <span className="mt-[9px] h-px w-4 shrink-0 bg-noc-accent" aria-hidden />
                    <span className="max-w-[76ch]">{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {narrative.recommendations?.length > 0 && (
            <div className="border-t border-noc-border bg-noc-accent/[0.04] px-6 py-5">
              <p className="eyebrow mb-3">Recommended next steps</p>
              <ol className="space-y-2.5">
                {narrative.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-noc-text">
                    <span className="tabular mt-px font-mono text-xs font-semibold text-noc-accent">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="max-w-[76ch]">{rec}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </article>
      )}

      {/* ——— Analytical vitals ——— */}
      <div className="card p-0">
        <dl className="grid grid-cols-1 sm:grid-cols-3">
          {vitals.map((vital, i) => (
            <Vital key={vital.label} index={i} {...vital} />
          ))}
        </dl>
      </div>

      {/* ——— Findings, ranked ——— */}
      <section className="card overflow-hidden p-0">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-noc-border/70 px-6 py-3.5">
          <TrendIcon direction={trend?.direction} />
          <h3 className="text-sm font-semibold tracking-tight text-noc-text">What we found</h3>
          {ranked.length > 0 && topSeverity && (
            <span className={clsx('badge', topSeverity.chip)}>
              {shown.length} to look at
            </span>
          )}
          {scope?.spanLabel && (
            <span className="tabular ml-auto text-xs text-noc-muted">{scope.spanLabel}</span>
          )}
        </header>

        {ranked.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-noc-accent/10 text-noc-accent ring-1 ring-inset ring-noc-accent/25">
              <Check className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-noc-text">
                All good
              </p>
              <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-noc-textDim">
                Nothing unusual. No action needed.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-noc-border">
            {shown.map((f) => (
              <Finding key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
