import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

/*
 * The figure is the card. Label sits above in a quiet eyebrow, the trend is a
 * small chip pinned to the baseline of the number — no coloured icon tile in the
 * corner, which is the one thing every generic stat card does.
 */
const TREND = {
  up: { Icon: TrendingUp, chip: 'bg-noc-success/10 text-noc-success', label: 'Trending up' },
  down: { Icon: TrendingDown, chip: 'bg-noc-warning/10 text-noc-warning', label: 'Trending down' },
};

export default function SummaryCard({ label, value, trend = 'neutral', icon: Icon }) {
  const meta = TREND[trend];
  const TrendIcon = meta?.Icon;

  return (
    <div className="card stat-glow">
      <div className="flex items-center gap-1.5 text-noc-muted">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
        <p className="text-[11px] font-medium uppercase tracking-[0.12em]">{label}</p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="tabular text-2xl font-semibold leading-none tracking-tight text-noc-text sm:text-[1.75rem]">
          {value}
        </p>
        {meta && (
          <span
            className={clsx(
              'inline-flex shrink-0 items-center rounded-md px-1.5 py-1',
              meta.chip
            )}
            title={meta.label}
          >
            <TrendIcon className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="sr-only">{meta.label}</span>
          </span>
        )}
      </div>
    </div>
  );
}
