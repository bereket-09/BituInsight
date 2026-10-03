import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  History,
  Inbox,
  GitBranch,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import ThemeToggle from './ThemeToggle';

/* One stroke weight across the shell — mixed weights are what makes icon sets
   look assembled rather than drawn. */
const ICON_STROKE = 1.75;

/**
 * Brand mark: a broadcast/signal glyph rather than a stock icon, so the product
 * has one thing that belongs to it. Mirrored arcs keep it optically balanced at
 * 20px. Shared with the login screen.
 */
export function BrandMark({ className }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <path
        d="M20 10.3a7 7 0 0 1 0 11.4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M12 21.7a7 7 0 0 1 0-11.4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M22.9 6.2a12 12 0 0 1 0 19.6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.42"
      />
      <path
        d="M9.1 25.8a12 12 0 0 1 0-19.6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.42"
      />
    </svg>
  );
}

/* Grouping turns five equal-weight links into a readable map of the product:
   look at data, put data in, configure how data is read. */
const navGroups = [
  {
    label: 'Overview',
    items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Reporting',
    items: [
      { to: '/upload', icon: Upload, label: 'Upload report' },
      { to: '/reports', icon: History, label: 'Historical reports' },
      { to: '/imports', icon: Inbox, label: 'Automatic imports' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/workflows', icon: GitBranch, label: 'KPI workflows' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

const navItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label }))
);

const SIDEBAR_WIDE = 'w-60';
const SIDEBAR_NARROW = 'w-[4.5rem]';

function initialsOf(user) {
  const source = (user?.name || user?.email || '').trim();
  if (!source) return '—';
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile, toggleMobile } = useSidebar();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const mainMargin = collapsed ? 'lg:ml-[4.5rem]' : 'lg:ml-60';

  const matchedItem = navItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );
  const current =
    matchedItem ||
    (location.pathname.startsWith('/workbooks')
      ? { label: 'Workbook report', group: 'Reporting' }
      : { label: 'Dashboard', group: 'Overview' });

  const sidebarContent = (
    <>
      {/* Brand lockup */}
      <div
        className={clsx(
          'flex shrink-0 items-center border-b border-noc-border',
          collapsed ? 'justify-center px-2 py-5' : 'gap-3 px-5 py-5'
        )}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow">
          <BrandMark className="h-5 w-5" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate font-display text-[15px] font-semibold leading-tight tracking-tight text-noc-text">
              Core Insight
            </span>
            <span className="block truncate text-[10px] font-medium uppercase tracking-[0.18em] text-noc-muted">
              Telecom KPI
            </span>
          </span>
        )}
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-2 py-5 lg:px-3"
      >
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={clsx(groupIndex > 0 && 'mt-6')}>
            {collapsed ? (
              groupIndex > 0 && <span className="mx-auto mb-4 block h-px w-6 bg-noc-border" />
            ) : (
              <span className="mb-2 block px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-noc-muted">
                {group.label}
              </span>
            )}
            <ul className="space-y-1">
              {group.items.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    title={collapsed ? label : undefined}
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex items-center overflow-hidden rounded-xl text-sm transition-all duration-200 active:translate-y-px',
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                        isActive
                          ? 'bg-noc-accent/10 font-semibold text-noc-text'
                          : 'font-medium text-noc-textDim hover:bg-noc-card hover:text-noc-text'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Accent rail — the active state should be legible from
                            the corner of the eye, not just a tint. */}
                        <span
                          aria-hidden="true"
                          className={clsx(
                            'absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-noc-accent transition-opacity duration-200',
                            isActive ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Icon
                          strokeWidth={ICON_STROKE}
                          className={clsx(
                            'h-[18px] w-[18px] shrink-0 transition-colors',
                            isActive ? 'text-noc-accent' : 'text-noc-muted group-hover:text-noc-text'
                          )}
                        />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account footer */}
      <div className={clsx('shrink-0 border-t border-noc-border p-3', collapsed && 'px-2')}>
        {collapsed ? (
          <div
            title={user?.email || user?.name || 'Signed in'}
            className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl border border-noc-border bg-noc-card text-[11px] font-semibold text-noc-textDim"
          >
            {initialsOf(user)}
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-noc-border bg-noc-card/60 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noc-accent/10 text-[11px] font-semibold text-noc-accent">
              {initialsOf(user)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-noc-text">
                {user?.name || 'Signed in'}
              </span>
              <span className="block truncate text-[11px] text-noc-muted">{user?.email}</span>
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          className={clsx(
            'flex w-full items-center rounded-xl text-sm font-medium text-noc-muted transition-all duration-200 hover:bg-noc-danger/10 hover:text-noc-danger active:translate-y-px',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2.5'
          )}
        >
          <LogOut strokeWidth={ICON_STROKE} className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="relative flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-xl focus:bg-noc-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-noc-bg/70 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-noc-border bg-gradient-to-b from-noc-surface via-noc-surface to-noc-bg transition-all duration-300 ease-in-out',
          collapsed ? SIDEBAR_NARROW : SIDEBAR_WIDE,
          mobileOpen ? 'translate-x-0 shadow-lift' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <button
          type="button"
          onClick={closeMobile}
          className="absolute right-2 top-4 rounded-lg p-1.5 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text active:translate-y-px lg:hidden"
          aria-label="Close sidebar"
        >
          <X strokeWidth={ICON_STROKE} className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main column */}
      <div
        className={clsx(
          'flex min-h-screen flex-1 flex-col transition-[margin] duration-300',
          mainMargin
        )}
      >
        <header className="sticky top-0 z-20 border-b border-noc-border bg-noc-surface/80 backdrop-blur-xl">
          <div className="content-shell flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={toggleMobile}
              className="-ml-1 rounded-lg p-2 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text active:translate-y-px lg:hidden"
              aria-label="Open menu"
            >
              <Menu strokeWidth={ICON_STROKE} className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="-ml-2 hidden rounded-lg p-2 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text active:translate-y-px lg:inline-flex"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <PanelLeftOpen strokeWidth={ICON_STROKE} className="h-5 w-5" />
              ) : (
                <PanelLeftClose strokeWidth={ICON_STROKE} className="h-5 w-5" />
              )}
            </button>

            <span aria-hidden="true" className="hidden h-6 w-px bg-noc-border sm:block" />

            {/* Page context: where you are, one line, always. */}
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-[11px] font-medium text-noc-muted">
                <li className="hidden shrink-0 sm:block">Core Insight</li>
                <li aria-hidden="true" className="hidden shrink-0 sm:block">
                  <ChevronRight strokeWidth={ICON_STROKE} className="h-3 w-3" />
                </li>
                <li className="hidden shrink-0 sm:block">{current.group}</li>
                <li aria-hidden="true" className="hidden shrink-0 sm:block">
                  <ChevronRight strokeWidth={ICON_STROKE} className="h-3 w-3" />
                </li>
                <li className="min-w-0 truncate text-[13px] font-semibold text-noc-text">
                  {current.label}
                </li>
              </ol>
            </nav>

            <ThemeToggle iconOnly />
          </div>
        </header>

        <main id="main-content" className="flex-1">
          <div className="content-shell px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
