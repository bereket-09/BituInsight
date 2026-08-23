import clsx from 'clsx';
import { BrandMark } from './Layout';

/**
 * Loading placeholder.
 *
 * A spinner tells you nothing except "wait". Skeletons in the shape of the
 * incoming content tell you what is about to arrive and stop the layout from
 * jumping when it does. The component keeps its original API (`size`,
 * `fullScreen`, `label`) and adds `variant` for callers that know their shape.
 */

function Line({ className }) {
  return <span className={clsx('skeleton block h-3', className)} />;
}

function StatTile() {
  return (
    <div className="card p-5">
      <Line className="w-20" />
      <span className="skeleton mt-4 block h-7 w-24" />
      <Line className="mt-3 h-2 w-16" />
    </div>
  );
}

function Rows({ count }) {
  return (
    <div className="divide-y divide-noc-border">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <span className="skeleton h-9 w-9 shrink-0 rounded-xl" />
          <span className="min-w-0 flex-1">
            <Line className={i % 3 === 0 ? 'w-56 max-w-[70%]' : 'w-40 max-w-[55%]'} />
            <Line className="mt-2 h-2 w-24" />
          </span>
          <span className="skeleton hidden h-6 w-16 rounded-md sm:block" />
        </div>
      ))}
    </div>
  );
}

export default function LoadingSpinner({
  size = 'md',
  fullScreen = false,
  label,
  variant = 'page',
}) {
  // The one prop that used to pick a spinner diameter now picks density.
  const density = { sm: 3, md: 6, lg: 9 }[size] ?? 6;

  if (fullScreen) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-noc-bg px-6"
      >
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow">
              <BrandMark className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-display text-base font-semibold tracking-tight text-noc-text">
                Core Insight
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-noc-muted">
                Telecom KPI
              </span>
            </span>
          </div>
          <span className="skeleton mt-8 block h-1 w-full rounded-full" />
          <p className="mt-4 text-xs text-noc-muted">{label || 'Preparing your workspace'}</p>
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex items-end justify-between gap-4">
      <span className="min-w-0">
        <Line className="h-2 w-24" />
        <span className="skeleton mt-3 block h-6 w-48 max-w-full" />
      </span>
      <span className="skeleton hidden h-9 w-28 rounded-xl sm:block" />
    </div>
  );

  const body =
    variant === 'list' ? (
      <div className="card overflow-hidden p-0">
        <Rows count={density} />
      </div>
    ) : variant === 'panel' ? (
      <div className="card">
        <Line className="w-32" />
        <span className="skeleton mt-4 block h-48 w-full rounded-xl" />
      </div>
    ) : (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <StatTile key={i} />
          ))}
        </div>
        <div className="card">
          <div className="flex items-center justify-between gap-4">
            <Line className="w-32" />
            <Line className="h-2 w-16" />
          </div>
          <span className="skeleton mt-5 block h-56 w-full rounded-xl" />
        </div>
        <div className="card overflow-hidden p-0">
          <Rows count={Math.max(3, density - 2)} />
        </div>
      </>
    );

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label || 'Loading'}</span>
      {header}
      {body}
      {label && (
        <p className="text-center text-xs text-noc-muted" aria-hidden="true">
          {label}
        </p>
      )}
    </div>
  );
}
