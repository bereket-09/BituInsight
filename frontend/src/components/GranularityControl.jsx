import clsx from 'clsx';
import { Clock } from 'lucide-react';

const ICON_STROKE = 1.75;

/**
 * Segmented control over the spans a report actually has data for.
 *
 * Each option carries its own point count, because "daily" means something very
 * different on a three-day file than on a three-month one. One option is not a
 * choice, so the control renders as a static caption instead of a dead button.
 */
export default function GranularityControl({
  options = [],
  value,
  onChange,
  label = 'Granularity',
  className,
  size = 'md',
}) {
  if (!options.length) return null;

  const compact = size === 'sm';
  const only = options.length === 1 ? options[0] : null;

  return (
    <div className={clsx('min-w-0', className)}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        <Clock className="h-3 w-3" strokeWidth={ICON_STROKE} />
        {label}
      </p>

      {only ? (
        <p className="tabular text-xs text-noc-textDim">
          {only.name} · {only.pointCount} point{only.pointCount === 1 ? '' : 's'}
          <span className="text-noc-muted"> · only span available</span>
        </p>
      ) : (
        <div
          role="group"
          aria-label={label}
          className="inline-flex flex-wrap gap-0.5 rounded-xl border border-noc-border bg-noc-surface p-0.5"
        >
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange?.(option.id)}
                title={[
                  `${option.pointCount} point${option.pointCount === 1 ? '' : 's'}`,
                  option.isAuto ? 'Recommended for this file' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                className={clsx(
                  'rounded-lg font-medium transition-colors',
                  compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
                  active
                    ? 'bg-noc-accent/15 text-noc-accent'
                    : 'text-noc-muted hover:text-noc-text'
                )}
              >
                {option.name}
                <span
                  className={clsx(
                    'tabular ml-1.5 text-[10px]',
                    active ? 'text-noc-accent/70' : 'text-noc-muted/70'
                  )}
                >
                  {option.pointCount}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
