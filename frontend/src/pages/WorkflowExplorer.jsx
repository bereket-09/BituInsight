import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Columns, BarChart2, Terminal, Trash2, Lock, FileJson } from 'lucide-react';
import { workflowApi, workflowDefinitionApi } from '../api';
import WorkflowDefinitionImport, { ImportPanelToggle } from '../components/WorkflowDefinitionImport';

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

/**
 * Two-step removal rather than a modal or a browser confirm: the second click is
 * the confirmation, and it stays inside the card the user is looking at.
 */
function RemoveDefinition({ slug, onRemove, isPending }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-danger active:translate-y-px"
        onClick={() => setArmed(true)}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        Remove
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className="rounded-lg border border-noc-danger/40 px-2 py-1 text-xs font-medium text-noc-danger transition-colors hover:bg-noc-danger/10 active:translate-y-px"
        disabled={isPending}
        onClick={() => onRemove(slug)}
      >
        {isPending ? 'Removing' : 'Confirm removal'}
      </button>
      <button
        type="button"
        className="rounded-lg px-2 py-1 text-xs font-medium text-noc-muted transition-colors hover:text-noc-text active:translate-y-px"
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
    </span>
  );
}

export default function WorkflowExplorer() {
  const [importOpen, setImportOpen] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const queryClient = useQueryClient();

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list().then((r) => r.data.workflows),
  });

  const { data: definitions } = useQuery({
    queryKey: ['workflow-definitions'],
    queryFn: () => workflowDefinitionApi.list().then((r) => r.data),
  });

  const importedSlugs = new Set(
    (definitions?.definitions || []).filter((d) => d.isActive).map((d) => d.slug)
  );

  const removeMutation = useMutation({
    mutationFn: (slug) => workflowDefinitionApi.remove(slug),
    onSuccess: () => {
      setRemoveError('');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
    },
    onError: (err) =>
      setRemoveError(err.response?.data?.error || 'The workflow could not be removed'),
  });

  if (isLoading) return <ExplorerSkeleton />;

  const importedCount = importedSlugs.size;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1 className="mt-2 text-display-md text-noc-text">KPI workflow explorer</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-noc-textDim">
            Every workflow the platform can run, with the columns it expects and the charts it
            produces. Built-in workflows ship with the platform; imported ones arrive as JSON
            definitions and can be removed again.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {workflows && (
            <p className="tabular text-xs text-noc-muted">
              {workflows.length} {workflows.length === 1 ? 'workflow' : 'workflows'}
              {importedCount > 0 && `, ${importedCount} imported`}
            </p>
          )}
          <ImportPanelToggle open={importOpen} onToggle={() => setImportOpen((open) => !open)} />
        </div>
      </header>

      {/* The panel stays open after an import so its confirmation is still on screen
          while the new workflow appears in the list below. */}
      {importOpen && <WorkflowDefinitionImport />}

      {removeError && (
        <p className="rounded-xl border border-noc-danger/30 bg-noc-danger/5 px-4 py-3 text-sm text-noc-text">
          {removeError}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {workflows?.map((wf) => {
          const isImported = importedSlugs.has(wf.slug);
          return (
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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isImported ? (
                  <span className="badge badge-info normal-case tracking-normal">
                    <FileJson className="h-3 w-3" strokeWidth={ICON_STROKE} />
                    Imported definition
                  </span>
                ) : (
                  <span className="badge badge-neutral normal-case tracking-normal">
                    <Lock className="h-3 w-3" strokeWidth={ICON_STROKE} />
                    Built in
                  </span>
                )}
                {isImported && (
                  <RemoveDefinition
                    slug={wf.slug}
                    onRemove={(slug) => removeMutation.mutate(slug)}
                    isPending={removeMutation.isPending && removeMutation.variables === wf.slug}
                  />
                )}
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
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-noc-border px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-noc-border bg-noc-bg text-noc-muted">
            <Terminal className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </span>
          <p className="text-sm leading-relaxed text-noc-textDim">
            <span className="font-medium text-noc-text">Two ways to add a workflow.</span> Import a
            JSON definition here and it runs on the shared interpreter, no deploy needed. Developers
            can still implement one as a module under{' '}
            <code className="rounded bg-noc-bg px-1.5 py-0.5 font-mono text-xs text-noc-accent">
              backend/src/kpi-workflows/
            </code>{' '}
            when a KPI needs logic the definition schema does not cover.
          </p>
        </div>
      </div>
    </div>
  );
}
