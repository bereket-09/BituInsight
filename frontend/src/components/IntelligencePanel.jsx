import { useState } from 'react';
import clsx from 'clsx';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Gauge,
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
    label: 'Critical',
    text: 'text-noc-danger',
    rail: 'bg-noc-danger',
    chip: 'bg-noc-danger/10 text-noc-danger',
    title: 'text-[15px] font-semibold',
  },
  major: {
    rank: 1,
    marks: 2,
    label: 'Major',
    text: 'text-noc-warning',
    rail: 'bg-noc-warning',
    chip: 'bg-noc-warning/10 text-noc-warning',
    title: 'text-[15px] font-semibold',
  },
  minor: {
    rank: 2,
    marks: 1,
    label: 'Minor',
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

function Vital({ icon: Icon, label, value, sub, note, valueClass = 'text-noc-text', index }) {
  return (
    <div
      className={clsx(
        'px-5 py-4',
        index % 2 === 1 && 'border-l border-noc-border',
        index === 2 && 'lg:border-l lg:border-noc-border',
        index >= 2 && 'border-t border-noc-border lg:border-t-0'
      )}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />}
        {label}
      </dt>
      <dd className={clsx('tabular mt-2 font-display text-2xl font-semibold', valueClass)}>
        {value}
      </dd>
      {sub && <p className="tabular mt-1 text-xs text-noc-textDim">{sub}</p>}
      {note && <p className="mt-1.5 text-[11px] leading-snug text-noc-muted">{note}</p>}
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

const QUALITY_NOTES = {
  good: 'Complete enough to trust the analysis below.',
  acceptable: 'A few readings are missing; the analysis still holds.',
  degraded: 'Enough is missing that peaks or dips may be hidden.',
  unreliable: 'Too much is missing — re-export before acting on it.',
  unusable: 'Too much is missing — re-export before acting on it.',
};

const CONSISTENCY_NOTES = {
  high: 'Consistent direction across the period — a real trend, not noise.',
  moderate: 'Fairly consistent, but daily swings are large. Worth watching.',
  low: 'Daily swings are larger than the change — treat as a hint.',
};

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

function makeFormatter(unit) {
  return (value) => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const abs = Math.abs(n);
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M${unit ? ` ${unit}` : ''}`;
    const text = n.toLocaleString('en-US', { maximumFractionDigits: abs >= 10 ? 0 : abs >= 1 ? 1 : 2 });
    return unit ? `${text} ${unit}` : text;
  };
}

/**
 * The trend tile says where the level started and where it ended, so the
 * percentage has a reference point. Reports processed before start/end levels
 * were stored fall back to the per-day rate.
 */
function trendVital(trend, fmt) {
  const base = { icon: Activity, label: 'Trend' };
  if (!trend?.available) return { ...base, value: '—', sub: 'not enough data to fit a trend' };
  if (trend.direction === 'flat') {
    return {
      ...base,
      value: 'No clear trend',
      sub: `level held steady over ${trend.spanDays} days`,
      note: 'Ups and downs, but no consistent rise or fall.',
    };
  }
  const change = trend.changeFromStartPct ?? trend.totalChangePct;
  return {
    ...base,
    value: `${change > 0 ? '+' : ''}${change}%`,
    valueClass: trend.direction === 'rising' ? 'text-noc-warning' : 'text-noc-info',
    sub:
      trend.startLevel != null
        ? `${fmt(trend.startLevel)} → ${fmt(trend.endLevel)} over ${trend.spanDays} days`
        : `${trend.slopePerDayPct > 0 ? '+' : ''}${trend.slopePerDayPct}% per day over ${trend.spanDays} days`,
    note: CONSISTENCY_NOTES[trend.confidence],
  };
}

/**
 * Renders the analytics + narrative layer attached to a processed report.
 * Silently renders nothing when a report predates the intelligence layer.
 */
export default function IntelligencePanel({ intelligence }) {
  if (!intelligence?.available) return null;

  const { narrative, findings = [], dataQuality, trend, forecast, capacity, dailyShape, scope } =
    intelligence;

  const attribution = narrativeAttribution(narrative);
  const qualityClass = QUALITY_STYLES[dataQuality?.grade] || 'text-noc-text';
  const ranked = [...findings].sort(
    (a, b) => severityOf(a.severity).rank - severityOf(b.severity).rank
  );
  const topSeverity = ranked.length ? severityOf(ranked[0].severity) : null;

  const fmt = makeFormatter(intelligence.unit);
  const vitals = [
    {
      icon: ShieldCheck,
      label: 'Data quality',
      value: `${dataQuality?.score ?? '—'}/100`,
      sub: `${capitalize(dataQuality?.grade ?? 'unknown')} · ${dataQuality?.coveragePct ?? 0}% of expected readings arrived`,
      note: QUALITY_NOTES[dataQuality?.grade],
      valueClass: qualityClass,
    },
    trendVital(trend, fmt),
    {
      icon: Gauge,
      label: 'Busiest periods',
      value: fmt(capacity?.planningPeak),
      sub:
        capacity?.utilizationPct != null
          ? `${capacity.utilizationPct}% of the ${fmt(capacity.threshold)} limit`
          : capacity?.peakToTypicalRatio != null
            ? `${Math.round(capacity.peakToTypicalRatio * 10) / 10}× the usual ${fmt(capacity.typical)}`
            : undefined,
      note: 'The level reached in the busiest 5% of readings — what capacity has to carry.',
    },
    {
      icon: dailyShape ? Activity : Minus,
      label: 'Busiest hour',
      value: dailyShape?.busiest?.label ?? '—',
      sub: dailyShape
        ? `usually ~${fmt(dailyShape.busiest.median)} · quietest ${dailyShape.quietest.label} (~${fmt(dailyShape.quietest.median)})`
        : 'needs hourly or finer data',
      note: dailyShape ? 'Typical level for each hour of the day across the report.' : undefined,
    },
  ];

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
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {vitals.map((vital, i) => (
            <Vital key={vital.label} index={i} {...vital} />
          ))}
        </dl>
      </div>

      {/* ——— Findings, ranked ——— */}
      <section className="card overflow-hidden p-0">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-noc-border/70 px-6 py-3.5">
          <TrendIcon direction={trend?.direction} />
          <h3 className="text-sm font-semibold tracking-tight text-noc-text">Findings</h3>
          {ranked.length > 0 && topSeverity && (
            <span className={clsx('badge', topSeverity.chip)}>
              {ranked.length} open · {topSeverity.label} highest
            </span>
          )}
          <span className="tabular ml-auto text-xs text-noc-muted">
            {scope?.pointCount} {scope?.cadenceLabel?.toLowerCase()} readings over {scope?.spanLabel}
          </span>
        </header>

        {ranked.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-noc-accent/10 text-noc-accent ring-1 ring-inset ring-noc-accent/25">
              <Check className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-noc-text">
                All checks clear
              </p>
              <p className="tabular mt-1 max-w-[62ch] text-sm leading-relaxed text-noc-textDim">
                Anomaly, trend-break and data-quality checks passed across{' '}
                {scope?.pointCount ?? 'all'} periods. Nothing needs attention in this window.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-noc-border">
            {ranked.map((f) => (
              <Finding key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </section>

      {/* ——— Forecast ——— */}
      {forecast?.available && (
        <section className="card overflow-hidden p-0">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-noc-border/70 px-6 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight text-noc-text">
              If the current trend continues · next {forecast.horizon} {forecast.unitLabel}s
            </h3>
            <p className="w-full text-xs leading-relaxed text-noc-muted">
              Extends the trend above forward. &ldquo;Expected&rdquo; is where the line points;
              the range is where the value should land 19 times out of 20, given how much
              it has swung so far.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-[11px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-6 py-2.5 font-medium">Date</th>
                  <th className="px-6 py-2.5 font-medium">Expected</th>
                  <th className="px-6 py-2.5 font-medium">Likely range</th>
                </tr>
              </thead>
              <tbody>
                {forecast.projections.map((p) => (
                  <tr
                    key={p.step}
                    className="border-b border-noc-border/50 transition-colors last:border-0 hover:bg-noc-accent/[0.04]"
                  >
                    <td className="px-6 py-2.5 text-noc-muted">{p.date}</td>
                    <td className="px-6 py-2.5 font-mono font-medium text-noc-text">
                      {fmt(p.value)}
                    </td>
                    <td className="px-6 py-2.5 font-mono text-xs text-noc-muted">
                      {fmt(p.low)} – {fmt(p.high)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
