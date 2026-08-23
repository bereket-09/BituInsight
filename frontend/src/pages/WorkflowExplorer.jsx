import { useQuery } from '@tanstack/react-query';
import { Columns, BarChart2, Terminal } from 'lucide-react';
import { workflowApi } from '../api';

const ICON_STROKE = 1.75;

function ExplorerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="skeleton h-2.5 w-28" />
        <div className="skeleton h-9 w-72 max-w-full" />
        <div className="skeleton h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-5 w-48" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
            <div className="flex gap-2 pt-2">
              <div className="skeleton h-5 w-16 rounded-md" />
              <div className="skeleton h-5 w-20 rounded-md" />
              <div className="skeleton h-5 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagGroup({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-noc-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export default function WorkflowExplorer() {
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list().then((r) => r.data.workflows),
  });

  if (isLoading) return <ExplorerSkeleton />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1 className="mt-2 text-display-md text-noc-text">KPI workflow explorer</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-noc-textDim">
            Every workflow the platform can run, with the columns it expects and the charts it
            produces.
          </p>
        </div>
        {workflows && (
          <p className="tabular text-xs text-noc-muted">
            {workflows.length} {workflows.length === 1 ? 'workflow' : 'workflows'}
          </p>
        )}
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {workflows?.map((wf) => (
          <article key={wf.slug} className="card flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] text-noc-accent">{wf.slug}</p>
                <h2 className="mt-1.5 text-base font-semibold text-noc-text">{wf.name}</h2>
              </div>
              <span className="tabular shrink-0 rounded-md border border-noc-border px-2 py-0.5 text-[11px] font-medium text-noc-muted">
                v{wf.version}
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-noc-textDim">{wf.description}</p>

            <div className="mt-5 space-y-4 border-t border-noc-border/70 pt-4">
              <TagGroup icon={Columns} title="Required columns">
                {wf.requiredColumns?.map((col) => (
                  <span
                    key={col.key}
                    className="rounded-md border border-noc-border bg-noc-bg px-2 py-0.5 font-mono text-[10px] text-noc-textDim"
                  >
                    {col.label}
                  </span>
                ))}
              </TagGroup>

              <TagGroup icon={BarChart2} title="Generated charts">
                {wf.chartDefinitions?.map((chart) => (
                  <span key={chart.id} className="badge badge-neutral normal-case tracking-normal">
                    {chart.title}
                  </span>
                ))}
              </TagGroup>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-noc-border px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-noc-border bg-noc-bg text-noc-muted">
            <Terminal className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </span>
          <p className="text-sm leading-relaxed text-noc-textDim">
            <span className="font-medium text-noc-text">Adding new workflows.</span> Developers
            implement workflows as modules under{' '}
            <code className="rounded bg-noc-bg px-1.5 py-0.5 font-mono text-xs text-noc-accent">
              backend/src/kpi-workflows/
            </code>{' '}
            and register them in the workflow registry. No UI configuration is required.
          </p>
        </div>
      </div>
    </div>
  );
}
