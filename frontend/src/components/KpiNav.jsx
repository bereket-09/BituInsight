import { useState, useEffect } from 'react';
import { LayoutGrid, PanelLeft, LayoutList, Search } from 'lucide-react';
import clsx from 'clsx';

const NAV_MODE_KEY = 'coreinsight_kpi_nav_mode';
const ICON_STROKE = 1.75;

function KpiStatusDot({ status }) {
  const pending = ['pending', 'validating', 'processing'].includes(status);
  return (
    <span
      className={clsx(
        'relative flex h-2 w-2 shrink-0 rounded-full',
        status === 'completed' && 'bg-noc-success',
        status === 'failed' && 'bg-noc-danger',
        pending && 'bg-noc-warning',
        !status && 'bg-noc-border'
      )}
    >
      {pending && (
        <span className="absolute inset-0 animate-ping rounded-full bg-noc-warning opacity-60" />
      )}
    </span>
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
        aria-current={active ? 'true' : undefined}
        className={clsx(
          'group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 active:translate-y-px',
          active
            ? 'bg-noc-accent/10 font-semibold text-noc-text'
            : 'text-noc-textDim hover:bg-noc-card hover:text-noc-text'
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-noc-accent transition-opacity duration-200',
            active ? 'opacity-100' : 'opacity-0'
          )}
        />
        <KpiStatusDot status={status} />
        <span className="min-w-0 truncate">{label}</span>
        {subLabel && (
          <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-noc-muted">
            {subLabel}
          </span>
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
        aria-current={active ? 'true' : undefined}
        className={clsx(
          'relative inline-flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-xs transition-all duration-200 active:translate-y-px',
          active
            ? 'font-semibold text-noc-text'
            : 'font-medium text-noc-muted hover:bg-noc-card/60 hover:text-noc-text'
        )}
      >
        {icon}
        {status != null && <KpiStatusDot status={status} />}
        <span className="truncate">{label}</span>
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-noc-accent transition-opacity duration-200',
            active ? 'opacity-100' : 'opacity-0'
          )}
        />
      </button>
    );
  };

  const modeToggle = (
    <div className="flex shrink-0 rounded-lg border border-noc-border bg-noc-bg/60 p-0.5">
      <button
        type="button"
        onClick={() => onModeChange('sidebar')}
        title="Sidebar list"
        aria-label="Show KPIs as a sidebar list"
        aria-pressed={mode === 'sidebar'}
        className={clsx(
          'rounded-md p-1.5 transition-all duration-200 active:translate-y-px',
          mode === 'sidebar'
            ? 'bg-noc-accent/15 text-noc-accent shadow-card'
            : 'text-noc-muted hover:text-noc-text'
        )}
      >
        <PanelLeft strokeWidth={ICON_STROKE} className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onModeChange('tabs')}
        title="Top tabs"
        aria-label="Show KPIs as top tabs"
        aria-pressed={mode === 'tabs'}
        className={clsx(
          'rounded-md p-1.5 transition-all duration-200 active:translate-y-px',
          mode === 'tabs'
            ? 'bg-noc-accent/15 text-noc-accent shadow-card'
            : 'text-noc-muted hover:text-noc-text'
        )}
      >
        <LayoutList strokeWidth={ICON_STROKE} className="h-4 w-4" />
      </button>
    </div>
  );

  if (mode === 'tabs') {
    return (
      <div className={clsx('space-y-3', className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-noc-muted">
            {items.length} KPIs
          </p>
          {modeToggle}
        </div>
        <nav
          aria-label="KPIs"
          className="-mb-px flex gap-0.5 overflow-x-auto border-b border-noc-border"
        >
          {tabNavButton(
            'overview',
            overviewLabel,
            null,
            <LayoutGrid strokeWidth={ICON_STROKE} className="h-3.5 w-3.5 shrink-0" />
          )}
          {items.map((item) => tabNavButton(item.id, item.label, item.status))}
        </nav>
      </div>
    );
  }

  return (
    <aside
      className={clsx(
        'card flex w-full shrink-0 flex-col p-0 lg:w-56 xl:w-64',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-noc-border px-3 py-2.5">
        <span className="eyebrow text-noc-muted">KPIs · {items.length}</span>
        {modeToggle}
      </div>

      <div className="border-b border-noc-border p-2">
        <div className="relative">
          <Search
            strokeWidth={ICON_STROKE}
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-noc-muted"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter KPIs"
            aria-label="Filter KPIs"
            className="input-field py-1.5 pl-8 text-xs"
          />
        </div>
      </div>

      <nav
        aria-label="KPIs"
        className="max-h-[min(70vh,520px)] flex-1 space-y-0.5 overflow-y-auto p-2"
      >
        <button
          type="button"
          onClick={() => onSelect('overview')}
          aria-current={activeId === 'overview' ? 'true' : undefined}
          className={clsx(
            'group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-sm transition-all duration-200 active:translate-y-px',
            activeId === 'overview'
              ? 'bg-noc-accent/10 font-semibold text-noc-text'
              : 'font-medium text-noc-textDim hover:bg-noc-card hover:text-noc-text'
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-noc-accent transition-opacity duration-200',
              activeId === 'overview' ? 'opacity-100' : 'opacity-0'
            )}
          />
          <LayoutGrid
            strokeWidth={ICON_STROKE}
            className={clsx(
              'h-4 w-4 shrink-0 transition-colors',
              activeId === 'overview' ? 'text-noc-accent' : 'text-noc-muted group-hover:text-noc-text'
            )}
          />
          {overviewLabel}
        </button>
        {filtered.map((item) =>
          sidebarNavButton(item.id, item.label, item.status, item.subLabel)
        )}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-noc-muted">No KPIs match that filter</p>
        )}
      </nav>
    </aside>
  );
}
