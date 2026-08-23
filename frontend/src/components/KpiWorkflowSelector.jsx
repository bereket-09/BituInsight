import clsx from 'clsx';
import {
  Activity,
  BarChart3,
  Check,
  Gauge,
  LineChart,
  Radio,
  Zap,
  ChevronRight,
} from 'lucide-react';

const WORKFLOW_STYLES = {
  'traffic-volume': {
    icon: BarChart3,
    gradient: 'from-[#3B9EFF]/20 via-[#3B9EFF]/5 to-transparent',
    ring: 'ring-[#3B9EFF]/50',
    accent: '#3B9EFF',
    category: 'Traffic',
    tagline: '2G/3G vs 4G volume trends',
  },
  'cmg-data-throughput': {
    icon: Zap,
    gradient: 'from-[#4ADE80]/20 via-[#4ADE80]/5 to-transparent',
    ring: 'ring-[#4ADE80]/50',
    accent: '#4ADE80',
    category: 'Throughput',
    tagline: 'MDC1 & MDC2 Gbps capacity',
  },
  'telecom-metric': {
    icon: Gauge,
    gradient: 'from-[#00D4AA]/20 via-[#00D4AA]/5 to-transparent',
    ring: 'ring-[#00D4AA]/50',
    accent: '#00D4AA',
    category: 'CMM',
    tagline: 'Generic success-rate KPIs',
  },
};

function getWorkflowStyle(slug) {
  return (
    WORKFLOW_STYLES[slug] || {
      icon: Activity,
      gradient: 'from-noc-accent/20 via-noc-accent/5 to-transparent',
      ring: 'ring-noc-accent/50',
      accent: '#00B140',
      category: 'KPI',
      tagline: 'Telecom analytics',
    }
  );
}

export default function KpiWorkflowSelector({ workflows = [], value, onChange, disabled }) {
  if (!workflows.length) {
    return (
      <div className="rounded-xl border border-dashed border-noc-border px-6 py-10 text-center text-sm text-noc-muted">
        No KPI workflows available. Check backend registration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-noc-text">Choose your KPI workflow</h3>
          <p className="mt-0.5 text-xs text-noc-muted">
            Each workflow defines how your Excel sheet is parsed, calculated, and charted
          </p>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-xs text-noc-muted underline-offset-2 hover:text-noc-accent hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workflows.map((wf) => {
          const style = getWorkflowStyle(wf.slug);
          const Icon = style.icon;
          const selected = value === wf.slug;
          const meta = typeof wf.metadata === 'object' ? wf.metadata : {};
          const unit = meta.unit;
          const chartCount = wf.chartDefinitions?.length ?? 0;
          const colCount = wf.requiredColumns?.length ?? 0;

          return (
            <button
              key={wf.slug}
              type="button"
              disabled={disabled}
              onClick={() => onChange(wf.slug)}
              className={clsx(
                'group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-noc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-noc-card',
                disabled && 'cursor-not-allowed opacity-60',
                selected
                  ? clsx('border-transparent bg-noc-card shadow-glow ring-2', style.ring)
                  : 'border-noc-border bg-noc-surface/40 hover:border-noc-accent/30 hover:bg-noc-card hover:shadow-card'
              )}
            >
              <div
                className={clsx(
                  'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80',
                  style.gradient
                )}
              />

              <div className="relative flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 shadow-sm"
                    style={{ backgroundColor: `${style.accent}22` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: style.accent }} />
                  </div>
                  {selected && (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: style.accent }}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                </div>

                <h4 className="mt-3 text-sm font-semibold text-noc-text">{wf.name}</h4>
                <p className="mt-0.5 text-[11px] font-medium" style={{ color: style.accent }}>
                  {style.tagline}
                </p>
                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-noc-muted">
                  {wf.description}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${style.accent}18`, color: style.accent }}
                  >
                    {meta.category || style.category}
                  </span>
                  {unit && (
                    <span className="rounded-full bg-noc-surface px-2 py-0.5 text-[10px] text-noc-muted">
                      {unit}
                    </span>
                  )}
                  {chartCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-noc-surface px-2 py-0.5 text-[10px] text-noc-muted">
                      <LineChart className="h-3 w-3" />
                      {chartCount} charts
                    </span>
                  )}
                  {colCount > 0 && (
                    <span className="rounded-full bg-noc-surface px-2 py-0.5 text-[10px] text-noc-muted">
                      {colCount} columns
                    </span>
                  )}
                </div>

                <span
                  className={clsx(
                    'mt-3 inline-flex items-center gap-1 text-[11px] font-medium transition-opacity',
                    selected ? 'text-noc-accent opacity-100' : 'text-noc-muted opacity-0 group-hover:opacity-100'
                  )}
                >
                  {selected ? 'Selected' : 'Select workflow'}
                  <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {value && (
        <div className="flex items-start gap-3 rounded-xl border border-noc-accent/25 bg-noc-accent/5 px-4 py-3">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-noc-accent" />
          <div className="min-w-0 text-xs text-noc-muted">
            <span className="font-medium text-noc-text">
              {workflows.find((w) => w.slug === value)?.name}
            </span>{' '}
            — upload an Excel file that matches this workflow&apos;s column layout. You can map
            sheets and header rows in the next step.
          </div>
        </div>
      )}
    </div>
  );
}
