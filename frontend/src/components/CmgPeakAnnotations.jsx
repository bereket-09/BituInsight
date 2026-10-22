import clsx from 'clsx';
import { CalendarClock, Search, TrendingUp } from 'lucide-react';
import { formatSeriesValue } from '../utils/seriesSpans';

const ICON_STROKE = 1.75;

/**
 * The detected throughput peaks and whatever each one coincides with.
 *
 * The wording is deliberate: a peak that overlaps a scheduled match "coincides
 * with" it and the match "may have contributed" — never "caused". A peak with
 * no overlapping event is flagged for investigation rather than left silent,
 * which is what the operator asked for while no fixture source is configured.
 *
 * Renders nothing for a report processed before peak annotation existed, or
 * for a series too short to detect peaks in.
 *
 * @param {Object} peaks  `calculated.peaks` from the CMG throughput workflow.
 */
export default function CmgPeakAnnotations({ peaks, className }) {
  if (!peaks?.available || !peaks.points?.length) return null;

  const { points, matchedCount = 0, unmatchedCount = 0, margins, basis, eventSource } = peaks;

  return (
    <div className={clsx('card overflow-hidden p-0', className)}>
      <div className="border-b border-noc-border px-5 py-4">
        <p className="eyebrow mb-2">Peak annotations</p>
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-noc-text">
          <TrendingUp className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          Peaks and what they coincide with
        </h3>
        <p className="tabular mt-1.5 max-w-[80ch] text-xs leading-relaxed text-noc-muted">
          {points.length} {points.length === 1 ? 'peak' : 'peaks'} ·{' '}
          {matchedCount} coinciding with a known event · {unmatchedCount} flagged for
          investigation.
          {basis?.baselineProfile
            ? ` Each day's highest point above the series' upper quartile, plus any point unusually high for its ${basis.baselineProfile} baseline.`
            : ''}
          {margins
            ? ` An event counts as coinciding when the peak falls between ${margins.preMatchMinutes} minutes before kickoff and ${margins.postMatchMinutes} minutes after the final whistle.`
            : ''}
        </p>
        {eventSource && !eventSource.configured && (
          <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-noc-textDim">
            No fixture list is configured for this deployment, so every peak below is reported
            unmatched. Supply a verified fixture list to have matches checked.
          </p>
        )}
      </div>

      <ul className="divide-y divide-noc-border/40">
        {points.map((peak) => (
          <li key={peak.timestamp} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular text-sm font-semibold text-noc-text">{peak.label}</span>
              <span className="tabular font-mono text-sm text-noc-text">
                {formatSeriesValue(peak.value, 'Gbps')}
              </span>
              {peak.expected != null && (
                <span className="tabular text-xs text-noc-muted">
                  against {formatSeriesValue(peak.expected, 'Gbps')} usual for {peak.comparedTo}
                  {peak.deviationPct != null && (
                    <>
                      {' '}
                      ({peak.deviationPct > 0 ? '+' : ''}
                      {peak.deviationPct}%)
                    </>
                  )}
                </span>
              )}
              <span className={clsx('badge', peak.matched ? 'badge-success' : 'badge-warning')}>
                {peak.matched ? (
                  <CalendarClock className="mr-1 h-3 w-3" strokeWidth={ICON_STROKE} />
                ) : (
                  <Search className="mr-1 h-3 w-3" strokeWidth={ICON_STROKE} />
                )}
                {peak.matched ? 'Event coincides' : 'Investigate'}
              </span>
              {peak.severity && <span className="badge badge-info">{peak.severity} spike</span>}
            </div>

            <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-noc-textDim">
              {peak.note}
            </p>
            {peak.detail && (
              <p className="mt-1 max-w-[80ch] text-[11px] leading-relaxed text-noc-muted">
                {peak.detail}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
