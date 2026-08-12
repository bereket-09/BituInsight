import { useQuery } from '@tanstack/react-query';
import { GitBranch, Columns, BarChart2 } from 'lucide-react';
import { workflowApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function WorkflowExplorer() {
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list().then((r) => r.data.workflows),
  });

  if (isLoading) return <LoadingSpinner label="Loading workflows..." />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">KPI Workflow Explorer</h1>
        <p className="mt-1 text-sm text-noc-muted">
          Preconfigured telecom KPI workflows — add new workflows via backend modules
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {workflows?.map((wf) => (
          <div key={wf.slug} className="card transition-all hover:border-noc-accent/30 hover:shadow-glow">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-noc-accent/10 p-2.5">
                <GitBranch className="h-5 w-5 text-noc-accent" />
              </div>
              <div>
                <h3 className="font-semibold">{wf.name}</h3>
                <p className="text-xs text-noc-muted">v{wf.version} · {wf.slug}</p>
              </div>
            </div>

            <p className="mb-4 text-sm text-noc-textDim">{wf.description}</p>

            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-noc-muted">
                  <Columns className="h-3.5 w-3.5" />
                  Required Columns
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {wf.requiredColumns?.map((col) => (
                    <span key={col.key} className="badge-info font-mono text-[10px]">
                      {col.label}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-noc-muted">
                  <BarChart2 className="h-3.5 w-3.5" />
                  Generated Charts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {wf.chartDefinitions?.map((chart) => (
                    <span key={chart.id} className="badge-neutral text-[10px]">
                      {chart.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card border-dashed">
        <p className="text-sm text-noc-muted">
          <strong className="text-noc-text">Adding new workflows:</strong> Developers implement
          workflows as modules under <code className="rounded bg-noc-surface px-1.5 py-0.5 font-mono text-xs text-noc-accent">backend/src/kpi-workflows/</code> and
          register them in the workflow registry. No UI configuration required.
        </p>
      </div>
    </div>
  );
}
