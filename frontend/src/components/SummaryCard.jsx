import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
};

const trendColors = {
  up: 'text-green-400',
  down: 'text-orange-400',
  neutral: 'text-noc-muted',
};

export default function SummaryCard({ label, value, trend = 'neutral', icon: Icon }) {
  const TrendIcon = trendIcons[trend] || Minus;

  return (
    <div className="card group transition-all hover:border-noc-accent/30 hover:shadow-glow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-noc-muted">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-noc-text">{value}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon && (
            <div className="rounded-lg bg-noc-accent/10 p-2 text-noc-accent">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <TrendIcon className={clsx('h-4 w-4', trendColors[trend])} />
        </div>
      </div>
    </div>
  );
}
