import clsx from 'clsx';
import {
  Activity,
  BarChart3,
  Check,
  Gauge,
  LineChart,
  Users,
  Zap,
  ArrowRight,
} from 'lucide-react';

const ICON_STROKE = 1.75;

/*
 * One accent carries selection. Workflows differ by icon and wording, not by a
 * private colour each — a palette per card is what made this read as generic.
 */
const WORKFLOW_STYLES = {
  'traffic-volume': {
    icon: BarChart3,
    category: 'Traffic',
    tagline: '2G/3G against 4G volume trends',
  },
  'cmg-data-throughput': {
    icon: Zap,
    category: 'Throughput',
    tagline: 'MDC1 and MDC2 Gbps capacity',
  },
  'peak-attached-users': {
    icon: Users,
    category: 'Subscribers',
    tagline: '2G/3G/4G attached users, VLR and BHCA',
  },
  'telecom-metric': {
    icon: Gauge,
    category: 'CMM',
    tagline: 'Generic success-rate KPIs',
  },
};

function getWorkflowStyle(slug) {
  return (
    WORKFLOW_STYLES[slug] || {
      icon: Activity,
      category: 'KPI',
      tagline: 'Telecom analytics',
    }
  );
}

function Tag({ children, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-noc-border bg-noc-bg/60 px-2 py-0.5 text-[10px] font-medium text-noc-muted">
      {Icon && <Icon className="h-3 w-3" strokeWidth={ICON_STROKE} />}
      {children}
    </span>
  );
}

export default function KpiWorkflowSelector({ workflows = [], value, onChange, disabled }) {
  if (!workflows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-noc-border px-6 py-12 text-center">
        <p className="text-sm font-medium text-noc-text">No KPI workflows available</p>
        <p className="mt-1 text-xs text-noc-muted">
          Check that workflows are registered on the backend, then reload.
        </p>
      </div>
    );
  }

  const selectedWorkflow = workflows.find((w) => w.slug === value);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-noc-border pb-4">
        <div>
          <p className="eyebrow mb-1.5">Step one</p>
          <h3 className="text-display-md text-noc-text">Choose a KPI workflow</h3>
          <p className="mt-1.5 max-w-[62ch] text-sm text-noc-textDim">
            The workflow decides how your sheet is parsed, which figures are calculated, and
            which charts the report carries.
          </p>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-accent active:translate-y-px"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              aria-pressed={selected}
              onClick={() => onChange(wf.slug)}
              className={clsx(
                'group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200',
                'active:translate-y-px',
                disabled && 'cursor-not-allowed opacity-50',
                selected
                  ? 'border-noc-accent/50 bg-noc-card shadow-glow'
                  : 'border-noc-border bg-noc-surface/50 hover:-translate-y-0.5 hover:border-noc-accent/30 hover:bg-noc-card hover:shadow-lift'
              )}
            >
              {/* Selection reads as a marked page, not a tinted rectangle. */}
              <span
                className={clsx(
                  'absolute inset-y-0 left-0 w-[3px] bg-noc-accent transition-opacity duration-200',
                  selected ? 'opacity-100' : 'opacity-0'
                )}
                aria-hidden
              />
              {selected && (
                <span
                  className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-noc-accent/10 via-transparent to-transparent"
                  aria-hidden
                />
              )}

              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-200',
                    selected
                      ? 'border-noc-accent/30 bg-noc-accent/15 text-noc-accent'
                      : 'border-noc-border bg-noc-bg/60 text-noc-muted group-hover:text-noc-accent'
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </span>
                <span
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full bg-noc-accent text-white transition-all duration-200',
                    selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                  )}
                  aria-hidden
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              </div>

              <div className="relative mt-4 flex flex-1 flex-col">
                <h4 className="text-[15px] font-semibold tracking-tight text-noc-text">
                  {wf.name}
                </h4>
                <p
                  className={clsx(
                    'mt-0.5 text-[11px] font-medium',
                    selected ? 'text-noc-accent' : 'text-noc-muted'
                  )}
                >
                  {style.tagline}
                </p>
                <p className="mt-2.5 line-clamp-2 flex-1 text-xs leading-relaxed text-noc-textDim">
                  {wf.description}
                </p>

                <div className="tabular mt-4 flex flex-wrap items-center gap-1.5">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      selected
                        ? 'bg-noc-accent/10 text-noc-accent'
                        : 'bg-noc-muted/10 text-noc-muted'
                    )}
                  >
                    {meta.category || style.category}
                  </span>
                  {unit && <Tag>{unit}</Tag>}
                  {chartCount > 0 && <Tag icon={LineChart}>{chartCount} charts</Tag>}
                  {colCount > 0 && <Tag>{colCount} columns</Tag>}
                </div>

                <span
                  className={clsx(
                    'mt-4 inline-flex items-center gap-1.5 border-t border-noc-border pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200',
                    selected
                      ? 'text-noc-accent'
                      : 'text-noc-muted group-hover:text-noc-text'
                  )}
                >
                  {selected ? 'Selected' : 'Select'}
                  <ArrowRight
                    className={clsx(
                      'h-3 w-3 transition-transform duration-200',
                      !selected && 'group-hover:translate-x-0.5'
                    )}
                    strokeWidth={2.25}
                  />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedWorkflow && (
        <p className="flex flex-wrap items-baseline gap-x-1.5 rounded-xl border border-noc-accent/25 bg-noc-accent/[0.06] px-4 py-3 text-xs leading-relaxed text-noc-textDim">
          <span className="font-semibold text-noc-text">{selectedWorkflow.name}</span>
          <span>
            selected — upload an Excel file matching its column layout. Sheets and header rows
            are mapped in the next step.
          </span>
        </p>
      )}
    </div>
  );
}
