import { useState, useEffect } from 'react';
import { LayoutGrid, PanelLeft, LayoutList, Search } from 'lucide-react';
import clsx from 'clsx';

const NAV_MODE_KEY = 'coreinsight_kpi_nav_mode';

function KpiStatusDot({ status }) {
  return (
    <span
      className={clsx(
        'h-2 w-2 shrink-0 rounded-full',
        status === 'completed' && 'bg-green-400',
        status === 'failed' && 'bg-red-400',
        ['pending', 'validating', 'processing'].includes(status) && 'animate-pulse bg-amber-400',
        !status && 'bg-noc-border'
      )}
    />
  );
}

export function useKpiNavMode() {
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem(NAV_MODE_KEY);
      return saved === 'tabs' ? 'tabs' : 'sidebar';
    } catch {
      return 'sidebar';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(NAV_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  return [mode, setMode];
}

export default function KpiNav({
  activeId,
  onSelect,
  overviewLabel = 'Overview',
  items = [],
  mode,
  onModeChange,
  className,
}) {
  const [filter, setFilter] = useState('');

  const filtered = items.filter((item) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      (item.label || '').toLowerCase().includes(q) ||
      (item.subLabel || '').toLowerCase().includes(q)
    );
  });

  const sidebarNavButton = (id, label, status, subLabel) => {
    const active = activeId === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        title={label}
        className={clsx(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
          active
            ? 'bg-noc-accent/15 font-medium text-noc-accent'
            : 'text-noc-muted hover:bg-noc-card hover:text-noc-text'
        )}
      >
        <KpiStatusDot status={status} />
        <span className="min-w-0 truncate">{label}</span>
        {subLabel && (
          <span className="ml-auto truncate text-[10px] text-noc-muted">{subLabel}</span>
        )}
      </button>
    );
  };

  const tabNavButton = (id, label, status, icon) => {
    const active = activeId === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        title={label}
        className={clsx(
          'inline-flex max-w-[10rem] shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
          active
            ? 'border-noc-accent text-noc-accent'
            : 'border-transparent text-noc-muted hover:text-noc-text'
        )}
      >
        {icon}
        {status != null && <KpiStatusDot status={status} />}
        <span className="truncate">{label}</span>
      </button>
    );
  };

  const modeToggle = (
    <div className="flex shrink-0 rounded-lg border border-noc-border p-0.5">
      <button
        type="button"
        onClick={() => onModeChange('sidebar')}
        title="Sidebar list"
        className={clsx(
          'rounded-md p-1.5 transition-colors',
          mode === 'sidebar' ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted hover:text-noc-text'
        )}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onModeChange('tabs')}
        title="Top tabs"
        className={clsx(
          'rounded-md p-1.5 transition-colors',
          mode === 'tabs' ? 'bg-noc-accent/20 text-noc-accent' : 'text-noc-muted hover:text-noc-text'
        )}
      >
        <LayoutList className="h-4 w-4" />
      </button>
    </div>
  );

  if (mode === 'tabs') {
    return (
      <div className={clsx('space-y-3', className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-noc-muted">{items.length} KPIs</p>
          {modeToggle}
        </div>
        <div className="-mb-px flex gap-0.5 overflow-x-auto border-b border-noc-border">
          {tabNavButton('overview', overviewLabel, null, <LayoutGrid className="h-3.5 w-3.5 shrink-0" />)}
          {items.map((item) => tabNavButton(item.id, item.label, item.status))}
        </div>
      </div>
    );
  }

  return (
    <aside
      className={clsx(
        'flex w-full shrink-0 flex-col rounded-xl border border-noc-border bg-noc-surface lg:w-56 xl:w-64',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-noc-border p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-noc-muted">
          KPIs ({items.length})
        </span>
        {modeToggle}
      </div>

      <div className="border-b border-noc-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-noc-muted" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter KPIs..."
            className="input-field py-1.5 pl-8 text-xs"
          />
        </div>
      </div>

      <nav className="max-h-[min(70vh,520px)] flex-1 space-y-0.5 overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => onSelect('overview')}
          className={clsx(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            activeId === 'overview'
              ? 'bg-noc-accent/15 text-noc-accent'
              : 'text-noc-muted hover:bg-noc-card hover:text-noc-text'
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          {overviewLabel}
        </button>
        {filtered.map((item) =>
          sidebarNavButton(item.id, item.label, item.status, item.subLabel)
        )}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-noc-muted">No KPIs match filter</p>
        )}
      </nav>
    </aside>
  );
}
