import { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Gauge,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const SEVERITY_STYLES = {
  critical: {
    chip: 'bg-red-500/15 text-red-400 border-red-500/30',
    bar: 'border-l-red-500',
    label: 'Critical',
  },
  major: {
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    bar: 'border-l-orange-500',
    label: 'Major',
  },
  minor: {
    chip: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    bar: 'border-l-yellow-500',
    label: 'Minor',
  },
  info: {
    chip: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    bar: 'border-l-sky-500',
    label: 'Info',
  },
};

const QUALITY_STYLES = {
  good: 'text-noc-success',
  acceptable: 'text-noc-accent',
  degraded: 'text-orange-400',
  unreliable: 'text-red-400',
  unusable: 'text-red-400',
};

function TrendIcon({ direction }) {
  if (direction === 'rising') return <TrendingUp className="h-4 w-4 text-orange-400" />;
  if (direction === 'falling') return <TrendingDown className="h-4 w-4 text-sky-400" />;
  return <Minus className="h-4 w-4 text-noc-muted" />;
}

function Stat({ icon: Icon, label, value, sub, valueClass = 'text-noc-text' }) {
  return (
    <div className="rounded-lg border border-noc-border bg-noc-bg/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-noc-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className={`mt-1.5 text-lg font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-noc-muted">{sub}</p>}
    </div>
  );
}

function Finding({ finding }) {
  const [open, setOpen] = useState(false);
  const style = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info;

  return (
    <div className={`border-l-4 ${style.bar} rounded-r-lg bg-noc-bg/40 px-4 py-3`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-noc-muted" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-noc-muted" />
        )}
        <span className="flex-1 text-sm font-medium text-noc-text">{finding.title}</span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}
        >
          {style.label}
        </span>
      </button>
      {open && (
        <p className="mt-2 pl-6 text-sm leading-relaxed text-noc-muted">{finding.detail}</p>
      )}
    </div>
  );
}

/**
 * Renders the analytics + narrative layer attached to a processed report.
 * Silently renders nothing when a report predates the intelligence layer.
 */
export default function IntelligencePanel({ intelligence }) {
  if (!intelligence?.available) return null;

  const { narrative, findings = [], dataQuality, trend, forecast, capacity, dailyShape, scope } =
    intelligence;

  const isClaude = narrative?.source === 'claude';
  const qualityClass = QUALITY_STYLES[dataQuality?.grade] || 'text-noc-text';

  return (
    <div className="space-y-4">
      {/* Executive narrative */}
      {narrative?.summary && (
        <div className="card border-l-4 border-l-noc-accent">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-noc-accent" />
            <h3 className="text-sm font-semibold text-noc-text">Executive summary</h3>
            <span className="rounded-full border border-noc-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-noc-muted">
              {isClaude ? 'Claude' : 'Computed'}
            </span>
            {narrative.riskLevel && narrative.riskLevel !== 'none' && (
              <span className="rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                {narrative.riskLevel} risk
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed text-noc-text">{narrative.summary}</p>

          {narrative.keyPoints?.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {narrative.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-noc-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-noc-accent" />
                  {point}
                </li>
              ))}
            </ul>
          )}

          {narrative.recommendations?.length > 0 && (
            <div className="mt-4 rounded-lg border border-noc-border bg-noc-bg/40 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-noc-muted">
                Recommended next steps
              </p>
              <ul className="space-y-1.5">
                {narrative.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-sm text-noc-text">
                    <span className="text-noc-accent">{i + 1}.</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Analytical vitals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={ShieldAlert}
          label="Data quality"
          value={`${dataQuality?.score ?? '—'}/100`}
          sub={`${dataQuality?.grade ?? 'unknown'} · ${dataQuality?.coveragePct ?? 0}% coverage`}
          valueClass={qualityClass}
        />
        <Stat
          icon={Activity}
          label="Trend"
          value={
            trend?.available && trend.direction !== 'flat'
              ? `${trend.slopePerDayPct > 0 ? '+' : ''}${trend.slopePerDayPct}%/day`
              : 'Flat'
          }
          sub={trend?.available ? `r² ${trend.r2} · ${trend.confidence} confidence` : 'not fitted'}
        />
        <Stat
          icon={Gauge}
          label="Busy-period peak"
          value={capacity?.planningPeak?.toLocaleString() ?? '—'}
          sub={
            capacity?.utilizationPct != null
              ? `${capacity.utilizationPct}% of threshold`
              : `${capacity?.peakToTypicalRatio ?? '—'}× typical`
          }
        />
        <Stat
          icon={dailyShape ? Activity : Minus}
          label="Busiest hour"
          value={dailyShape?.busiest?.label ?? '—'}
          sub={dailyShape ? `quietest ${dailyShape.quietest.label}` : 'needs sub-daily data'}
        />
      </div>

      {/* Findings */}
      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <TrendIcon direction={trend?.direction} />
          <h3 className="text-sm font-semibold text-noc-text">
            Findings {findings.length > 0 && `(${findings.length})`}
          </h3>
          <span className="ml-auto text-xs text-noc-muted">
            {scope?.pointCount} periods · {scope?.cadenceLabel} · {scope?.spanLabel}
          </span>
        </div>

        {findings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-noc-border bg-noc-bg/40 px-4 py-6 text-sm text-noc-muted">
            <CheckCircle2 className="h-4 w-4 text-noc-success" />
            No anomalies, trend breaks, or data-quality issues detected in this period.
          </div>
        ) : (
          <div className="space-y-2">
            {findings.map((f) => (
              <Finding key={f.id} finding={f} />
            ))}
          </div>
        )}
      </div>

      {/* Forecast */}
      {forecast?.available && (
        <div className="card">
          <h3 className="mb-3 text-sm font-semibold text-noc-text">
            Projection · next {forecast.horizon} {forecast.unitLabel}s
            <span className="ml-2 text-xs font-normal text-noc-muted">
              95% band, {forecast.confidence} confidence
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-xs uppercase tracking-wider text-noc-muted">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Projected</th>
                  <th className="pb-2 font-medium">Range</th>
                </tr>
              </thead>
              <tbody>
                {forecast.projections.map((p) => (
                  <tr key={p.step} className="border-b border-noc-border/50 last:border-0">
                    <td className="py-2 pr-4 text-noc-muted">{p.date}</td>
                    <td className="py-2 pr-4 font-medium text-noc-text">
                      {p.value.toLocaleString()}
                    </td>
                    <td className="py-2 text-noc-muted">
                      {p.low.toLocaleString()} – {p.high.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
