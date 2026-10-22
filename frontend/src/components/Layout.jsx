import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  History,
  Inbox,
  GitBranch,
  Settings,
  LogOut,
  ChevronRight,
  Sparkles,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  Columns,
  Maximize2,
  Compass,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import ThemeToggle from './ThemeToggle';
import AiCopilotModal from './AiCopilotModal';

const ICON_STROKE = 1.75;

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

const PRIMARY_LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/reports', label: 'History', icon: History },
  { to: '/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/imports', label: 'Imports', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function initialsOf(user) {
  const source = (user?.name || user?.email || '').trim();
  if (!source) return 'CI';
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
  const {
    layoutMode,
    toggleLayoutMode,
    collapsed,
    toggleCollapsed,
    mobileOpen,
    closeMobile,
    toggleMobile,
    aiCopilotOpen,
    openAiCopilot,
    closeAiCopilot,
  } = useSidebar();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut ⌘K / Ctrl+K for AI Copilot
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openAiCopilot();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openAiCopilot]);

  // Close mobile drawer on route change
  useEffect(() => {
    closeMobile();
    setUserDropdownOpen(false);
  }, [location.pathname, closeMobile]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isTopMode = layoutMode === 'top';

  return (
    <div className="relative min-h-screen bg-noc-bg text-noc-text flex flex-col">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-xl focus:bg-noc-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* AI Copilot Interactive Modal */}
      <AiCopilotModal isOpen={aiCopilotOpen} onClose={closeAiCopilot} />

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-noc-bg/75 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* ===================== TOP NAVIGATION BAR MODE (Default Modern SaaS) ===================== */}
      {isTopMode ? (
        <>
          <header className="sticky top-0 z-30 border-b border-noc-border/80 bg-noc-surface/85 backdrop-blur-xl">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              {/* Left Lockup: Brand + Nav links */}
              <div className="flex items-center gap-6 lg:gap-8">
                <Link
                  to="/"
                  className="group flex items-center gap-3 transition-opacity hover:opacity-90"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow transition-transform duration-200 group-hover:scale-105">
                    <BrandMark className="h-5 w-5" />
                  </span>
                  <div className="hidden sm:block">
                    <span className="block font-display text-[15px] font-bold tracking-tight text-noc-text">
                      Core Insight
                    </span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-noc-muted">
                      Telecom Analytics
                    </span>
                  </div>
                </Link>

                {/* Desktop Primary Nav Bar */}
                <nav
                  aria-label="Primary"
                  className="hidden items-center gap-1 md:flex"
                >
                  {PRIMARY_LINKS.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) =>
                        clsx(
                          'relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 active:translate-y-px',
                          isActive
                            ? 'bg-noc-accent/10 text-noc-accent'
                            : 'text-noc-textDim hover:bg-noc-card hover:text-noc-text'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            strokeWidth={ICON_STROKE}
                            className={clsx(
                              'h-4 w-4 transition-colors',
                              isActive ? 'text-noc-accent' : 'text-noc-muted'
                            )}
                          />
                          <span>{label}</span>
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-noc-accent"
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </nav>
              </div>

              {/* Right Lockup: AI Copilot, Upload, Layout toggle, User */}
              <div className="flex items-center gap-2.5">
                {/* AI Copilot Button */}
                <button
                  type="button"
                  onClick={openAiCopilot}
                  className="group relative inline-flex items-center gap-2 rounded-xl border border-noc-accent/30 bg-noc-accent/10 px-3 py-1.5 text-xs font-semibold text-noc-accent transition-all duration-200 hover:border-noc-accent hover:bg-noc-accent/20 active:translate-y-px"
                  title="Ask Core Insight AI Copilot (⌘K)"
                >
                  <Sparkles
                    className="h-3.5 w-3.5 text-noc-accent transition-transform duration-300 group-hover:rotate-12"
                    strokeWidth={ICON_STROKE}
                  />
                  <span className="hidden sm:inline">AI Copilot</span>
                  <span className="hidden rounded bg-noc-accent/20 px-1 py-0.5 text-[10px] font-mono lg:inline">
                    ⌘K
                  </span>
                </button>

                {/* Quick Upload CTA */}
                <Link
                  to="/upload"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-noc-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-noc-accentHover active:translate-y-px"
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>Upload</span>
                </Link>

                <ThemeToggle iconOnly />

                {/* User Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setUserDropdownOpen((o) => !o)}
                    aria-expanded={userDropdownOpen}
                    aria-label="User menu"
                    className="flex items-center gap-2 rounded-xl border border-noc-border bg-noc-surface p-1.5 text-xs transition-colors hover:border-noc-accent/30 hover:bg-noc-card"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-noc-accent/15 text-[11px] font-semibold text-noc-accent">
                      {initialsOf(user)}
                    </span>
                    <ChevronDown
                      className={clsx(
                        'h-3.5 w-3.5 text-noc-muted transition-transform duration-200',
                        userDropdownOpen && 'rotate-180'
                      )}
                      strokeWidth={ICON_STROKE}
                    />
                  </button>

                  {userDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 origin-top-right rounded-2xl border border-noc-border bg-noc-card p-2 shadow-lift">
                      <div className="border-b border-noc-border/60 px-3 py-2 text-left">
                        <p className="truncate text-xs font-semibold text-noc-text">
                          {user?.name || 'Operator'}
                        </p>
                        <p className="truncate text-[11px] text-noc-muted">{user?.email}</p>
                      </div>

                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => {
                            toggleLayoutMode();
                            setUserDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-noc-textDim transition-colors hover:bg-noc-surface hover:text-noc-text"
                        >
                          <Columns className="h-4 w-4 text-noc-muted" strokeWidth={ICON_STROKE} />
                          Switch to Side Dock
                        </button>
                        <Link
                          to="/settings"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-noc-textDim transition-colors hover:bg-noc-surface hover:text-noc-text"
                        >
                          <Settings className="h-4 w-4 text-noc-muted" strokeWidth={ICON_STROKE} />
                          Settings & Integrations
                        </Link>
                      </div>

                      <div className="border-t border-noc-border/60 pt-1">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-noc-danger transition-colors hover:bg-noc-danger/10"
                        >
                          <LogOut className="h-4 w-4" strokeWidth={ICON_STROKE} />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Menu Button */}
                <button
                  type="button"
                  onClick={toggleMobile}
                  className="rounded-xl p-2 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main id="main-content" className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              <Outlet />
            </div>
          </main>
        </>
      ) : (
        /* ===================== MODERN COLLAPSIBLE SIDEBAR MODE ===================== */
        <div className="relative flex min-h-screen">
          {/* Side Nav Sidebar */}
          <aside
            className={clsx(
              'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-noc-border bg-noc-surface transition-all duration-300 ease-in-out',
              collapsed ? 'w-20' : 'w-64',
              mobileOpen ? 'translate-x-0 shadow-lift' : '-translate-x-full lg:translate-x-0'
            )}
          >
            {/* Sidebar Brand Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-noc-border px-4">
              <Link to="/" className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow">
                  <BrandMark className="h-5 w-5" />
                </span>
                {!collapsed && (
                  <div className="min-w-0">
                    <span className="block truncate font-display text-sm font-bold text-noc-text">
                      Core Insight
                    </span>
                    <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-noc-muted">
                      Telecom Analytics
                    </span>
                  </div>
                )}
              </Link>

              {/* Inline Collapse Toggle Right on Sidebar */}
              <button
                type="button"
                onClick={toggleCollapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden rounded-lg p-1.5 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text lg:flex"
              >
                <ChevronLeft
                  className={clsx(
                    'h-4 w-4 transition-transform duration-300',
                    collapsed && 'rotate-180'
                  )}
                  strokeWidth={ICON_STROKE}
                />
              </button>
            </div>

            {/* AI Copilot Quick Launcher inside Sidebar */}
            <div className="p-3">
              <button
                type="button"
                onClick={openAiCopilot}
                className={clsx(
                  'flex w-full items-center rounded-xl border border-noc-accent/30 bg-noc-accent/10 text-xs font-semibold text-noc-accent transition-all duration-200 hover:bg-noc-accent/20 active:translate-y-px',
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5'
                )}
                title="Open AI Copilot"
              >
                <Sparkles className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                {!collapsed && (
                  <div className="flex flex-1 items-center justify-between">
                    <span>AI Copilot</span>
                    <span className="font-mono text-[10px] opacity-75">⌘K</span>
                  </div>
                )}
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
              {PRIMARY_LINKS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'group flex items-center rounded-xl text-xs font-semibold transition-all duration-200 active:translate-y-px',
                      collapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5',
                      isActive
                        ? 'bg-noc-accent/10 text-noc-accent'
                        : 'text-noc-textDim hover:bg-noc-card hover:text-noc-text'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        strokeWidth={ICON_STROKE}
                        className={clsx(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-noc-accent' : 'text-noc-muted group-hover:text-noc-text'
                        )}
                      />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Switch to Topbar Button */}
            <div className="border-t border-noc-border p-3 space-y-1.5">
              <button
                type="button"
                onClick={toggleLayoutMode}
                title="Switch to Top Navigation bar"
                className={clsx(
                  'flex w-full items-center rounded-xl text-xs font-medium text-noc-textDim transition-colors hover:bg-noc-card hover:text-noc-text',
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                )}
              >
                <Columns className="h-4 w-4 shrink-0 text-noc-muted" strokeWidth={ICON_STROKE} />
                {!collapsed && <span>Top Bar Mode</span>}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className={clsx(
                  'flex w-full items-center rounded-xl text-xs font-medium text-noc-danger transition-colors hover:bg-noc-danger/10',
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                {!collapsed && <span>Sign out</span>}
              </button>
            </div>
          </aside>

          {/* Main Area in Side Nav Mode */}
          <div
            className={clsx(
              'flex flex-1 flex-col transition-[margin] duration-300',
              collapsed ? 'lg:ml-20' : 'lg:ml-64'
            )}
          >
            <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-noc-border bg-noc-surface/80 px-4 backdrop-blur-xl sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleMobile}
                  className="rounded-lg p-2 text-noc-muted hover:bg-noc-card lg:hidden"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </button>
                <span className="font-semibold text-sm text-noc-text">Core Insight Workspace</span>
              </div>
              <div className="flex items-center gap-3">
                <Link to="/upload" className="btn-primary text-xs py-1.5 px-3">
                  <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                  Upload
                </Link>
                <ThemeToggle iconOnly />
              </div>
            </header>

            <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">
              <Outlet />
            </main>
          </div>
        </div>
      )}

      {/* Mobile Slide-Over Drawer Navigation */}
      {mobileOpen && (
        <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-noc-border bg-noc-surface p-5 shadow-2xl lg:hidden">
          <div className="flex items-center justify-between border-b border-noc-border/80 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-noc-accent text-white">
                <BrandMark className="h-4 w-4" />
              </span>
              <span className="font-display font-bold text-sm text-noc-text">Core Insight</span>
            </div>
            <button
              type="button"
              onClick={closeMobile}
              className="rounded-lg p-1.5 text-noc-muted hover:bg-noc-card hover:text-noc-text"
            >
              <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                closeMobile();
                openAiCopilot();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-noc-accent/15 px-3 py-2.5 text-xs font-semibold text-noc-accent"
            >
              <Sparkles className="h-4 w-4" />
              Open AI Copilot
            </button>
          </div>

          <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
            {PRIMARY_LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={closeMobile}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-noc-accent/10 font-semibold text-noc-accent'
                      : 'text-noc-textDim hover:bg-noc-card hover:text-noc-text'
                  )
                }
              >
                <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-noc-border/80 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-noc-muted">Appearance</span>
              <ThemeToggle iconOnly />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-noc-danger hover:bg-noc-danger/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
