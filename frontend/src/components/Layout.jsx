import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  History,
  GitBranch,
  Settings,
  LogOut,
  Radio,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import ThemeToggle from './ThemeToggle';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload Report' },
  { to: '/reports', icon: History, label: 'Historical Reports' },
  { to: '/workflows', icon: GitBranch, label: 'KPI Workflows' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const SIDEBAR_WIDE = 'w-60';
const SIDEBAR_NARROW = 'w-[4.5rem]';

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

  const sidebarContent = (
    <>
      <div
        className={clsx(
          'flex items-center border-b border-noc-border',
          collapsed ? 'justify-center px-2 py-4' : 'gap-3 px-5 py-5'
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-noc-accent">
          <Radio className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-noc-text">BituInsight</h1>
            <p className="text-[10px] uppercase tracking-widest text-noc-muted">Telecom KPI</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4 lg:px-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'mb-2 hidden w-full items-center rounded-lg text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text lg:flex',
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            onClick={closeMobile}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-lg text-sm font-medium transition-all',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-noc-accent/15 text-noc-accent'
                  : 'text-noc-muted hover:bg-noc-card hover:text-noc-text'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={clsx('border-t border-noc-border p-3', collapsed && 'px-2')}>
        <ThemeToggle
          className={clsx('mb-3', collapsed ? 'w-full justify-center' : 'w-full justify-center')}
          showLabel={!collapsed}
          iconOnly={collapsed}
        />
        {!collapsed && (
          <div className="mb-3 px-1">
            <p className="truncate text-xs font-medium text-noc-text">{user?.name}</p>
            <p className="truncate text-[11px] text-noc-muted">{user?.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          className={clsx(
            'flex w-full items-center rounded-lg text-sm text-noc-muted transition-colors hover:bg-red-500/10 hover:text-red-400',
            collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-noc-border bg-noc-surface transition-all duration-300 ease-in-out',
          collapsed ? SIDEBAR_NARROW : SIDEBAR_WIDE,
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <button
          type="button"
          onClick={closeMobile}
          className="absolute right-2 top-4 rounded-lg p-1.5 text-noc-muted hover:bg-noc-card lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main column */}
      <div className={clsx('flex min-h-screen flex-1 flex-col transition-[margin] duration-300', mainMargin)}>
        {/* Mobile / collapse header bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-noc-border bg-noc-surface/95 px-4 py-3 backdrop-blur lg:px-6">
          <button
            type="button"
            onClick={toggleMobile}
            className="rounded-lg p-2 text-noc-muted hover:bg-noc-card hover:text-noc-text lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-noc-muted hover:bg-noc-card hover:text-noc-text lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold text-noc-text">BituInsight</p>
            <p className="truncate text-[10px] text-noc-muted">
              {navItems.find((n) =>
                n.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(n.to)
              )?.label || 'Telecom KPI'}
            </p>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
