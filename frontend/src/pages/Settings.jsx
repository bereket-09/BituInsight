import { useState } from 'react';
import {
  User,
  Webhook,
  Sparkles,
  Plug,
  Check,
  Save,
  Columns,
  Layout,
  Sun,
  Moon,
  ShieldCheck,
  Send,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Cpu,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';
import McpConnectPanel from '../components/McpConnectPanel';

const ICON_STROKE = 1.75;

const SETTINGS_TABS = [
  { id: 'general', label: 'General & Layout', icon: User },
  { id: 'teams', label: 'Teams & Alerts', icon: Webhook },
  { id: 'ai-engine', label: 'AI Intelligence', icon: Sparkles },
  { id: 'mcp', label: 'Desktop AI (MCP)', icon: Plug },
];

export default function Settings() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { layoutMode, setLayoutMode } = useSidebar();

  const [activeTab, setActiveTab] = useState('general');
  const [teamsWebhook, setTeamsWebhook] = useState(
    () => localStorage.getItem('coreinsight_teams_webhook') || ''
  );
  const [saved, setSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState(null);

  const handleSaveTeams = (e) => {
    e?.preventDefault();
    localStorage.setItem('coreinsight_teams_webhook', teamsWebhook.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleTestWebhook = () => {
    if (!teamsWebhook.trim()) {
      setTestError('Please enter a webhook URL first.');
      return;
    }
    if (!teamsWebhook.startsWith('https://')) {
      setTestError('Webhook URL must begin with https://');
      return;
    }
    setTestError(null);
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* Page Header */}
      <header className="border-b border-noc-border/80 pb-6">
        <p className="eyebrow">Platform Administration</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-noc-text sm:text-3xl">
          System Preferences & Integrations
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-noc-textDim">
          Customize navigation style, manage Microsoft Teams webhook alerts, and configure AI assistant connectivity.
        </p>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 active:translate-y-px',
                  isActive
                    ? 'bg-noc-accent text-white shadow-sm'
                    : 'border border-noc-border bg-noc-surface text-noc-textDim hover:border-noc-accent/30 hover:bg-noc-card hover:text-noc-text'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ===================== TAB 1: GENERAL & LAYOUT ===================== */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* User Profile Card */}
          <section className="card space-y-4">
            <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
              <User className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              <h2 className="text-sm font-semibold text-noc-text">Operator Account</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-noc-border/80 bg-noc-surface/50 p-3.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-noc-muted">
                  Full Name
                </span>
                <p className="mt-1 text-sm font-semibold text-noc-text">
                  {user?.name || 'Administrator'}
                </p>
              </div>
              <div className="rounded-xl border border-noc-border/80 bg-noc-surface/50 p-3.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-noc-muted">
                  Email Address
                </span>
                <p className="mt-1 text-sm font-semibold text-noc-text">
                  {user?.email || 'admin@coreinsight.local'}
                </p>
              </div>
            </div>
          </section>

          {/* Navigation Style Chooser */}
          <section className="card space-y-4">
            <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
              <Layout className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              <div>
                <h2 className="text-sm font-semibold text-noc-text">Navigation & Shell Style</h2>
                <p className="text-xs text-noc-muted">
                  Choose between a modern top navigation bar or a collapsible side dock.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Option 1: Top Bar */}
              <button
                type="button"
                onClick={() => setLayoutMode('top')}
                className={clsx(
                  'group flex flex-col items-start rounded-2xl border p-4 text-left transition-all',
                  layoutMode === 'top'
                    ? 'border-noc-accent bg-noc-accent/5 ring-1 ring-noc-accent/30'
                    : 'border-noc-border bg-noc-surface/60 hover:border-noc-border hover:bg-noc-card'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-noc-text flex items-center gap-2">
                    <Columns className="h-4 w-4 text-noc-accent rotate-90" />
                    Modern Top Navigation (Recommended)
                  </span>
                  {layoutMode === 'top' && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-noc-accent text-white">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-noc-textDim">
                  Expansive, full-width workspace with clean header tabs. Gives maximum horizontal width
                  for large telecom charts, SAAU tables, and throughput graphs without side crowding.
                </p>
              </button>

              {/* Option 2: Side Dock */}
              <button
                type="button"
                onClick={() => setLayoutMode('side')}
                className={clsx(
                  'group flex flex-col items-start rounded-2xl border p-4 text-left transition-all',
                  layoutMode === 'side'
                    ? 'border-noc-accent bg-noc-accent/5 ring-1 ring-noc-accent/30'
                    : 'border-noc-border bg-noc-surface/60 hover:border-noc-border hover:bg-noc-card'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-noc-text flex items-center gap-2">
                    <Columns className="h-4 w-4 text-noc-accent" />
                    Collapsible Side Dock
                  </span>
                  {layoutMode === 'side' && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-noc-accent text-white">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-noc-textDim">
                  Traditional collapsible drawer with an integrated toggle directly on the sidebar border.
                  Provides quick icon access on the left edge.
                </p>
              </button>
            </div>
          </section>

          {/* Theme Appearance */}
          <section className="card space-y-4">
            <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
              {isDark ? (
                <Moon className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              ) : (
                <Sun className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              )}
              <h2 className="text-sm font-semibold text-noc-text">Color Theme</h2>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-noc-text">
                  Currently using <span className="font-semibold">{isDark ? 'Dark Mode (NOC)' : 'Light Mode'}</span>
                </p>
                <p className="mt-0.5 text-xs text-noc-muted">
                  High-contrast green-charcoal palette tuned for operations rooms and field monitoring.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="btn-secondary text-xs"
              >
                {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ===================== TAB 2: TEAMS & NOTIFICATIONS ===================== */}
      {activeTab === 'teams' && (
        <section className="card space-y-5">
          <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
            <Webhook className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
            <div>
              <h2 className="text-sm font-semibold text-noc-text">Microsoft Teams Webhook Integration</h2>
              <p className="text-xs text-noc-muted">
                Automatically post formatted MessageCard reports with attached charts to your operations channel.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveTeams} className="space-y-4">
            <div>
              <label
                htmlFor="teams-webhook"
                className="block text-xs font-semibold uppercase tracking-wider text-noc-muted"
              >
                Incoming Webhook URL
              </label>
              <input
                id="teams-webhook"
                type="url"
                value={teamsWebhook}
                onChange={(e) => {
                  setTeamsWebhook(e.target.value);
                  setTestError(null);
                }}
                placeholder="https://outlook.office.com/webhook/..."
                className="input-field mt-2 font-mono text-xs"
              />
              {testError && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-noc-danger">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {testError}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-noc-muted">
                Configured webhooks receive executive chart cards upon successful report completion.
                A system-wide fallback can also be set via the <code className="rounded bg-noc-surface px-1.5 py-0.5 font-mono text-[11px] text-noc-accent">TEAMS_WEBHOOK_URL</code> environment variable.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-noc-border/80 pt-4">
              <button type="submit" className="btn-primary text-xs">
                <Save className="h-3.5 w-3.5" />
                Save Webhook
              </button>
              <button
                type="button"
                onClick={handleTestWebhook}
                className="btn-secondary text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Test Connection
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-xs font-semibold text-noc-success">
                  <Check className="h-3.5 w-3.5" />
                  Saved to browser
                </span>
              )}
              {testSent && (
                <span className="flex items-center gap-1 text-xs font-semibold text-noc-success">
                  <Check className="h-3.5 w-3.5" />
                  Test packet simulated successfully!
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* ===================== TAB 3: AI INTELLIGENCE & PRIVACY ===================== */}
      {activeTab === 'ai-engine' && (
        <div className="space-y-6">
          <section className="card space-y-4">
            <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
              <Sparkles className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
              <div>
                <h2 className="text-sm font-semibold text-noc-text">Core Insight Intelligence Architecture</h2>
                <p className="text-xs text-noc-muted">
                  How AI, seasonality baselines, and executive narratives operate together.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-noc-border/80 bg-noc-surface/50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-noc-text">
                  <Cpu className="h-4 w-4 text-noc-accent" />
                  Deterministic Statistical Core
                </div>
                <p className="text-xs leading-relaxed text-noc-muted">
                  Runs directly on the backend with zero external dependencies. Uses Median Absolute Deviation (MAD),
                  seasonal hour-of-day residuals, and robust z-scores to isolate legitimate network deviations from daily ramps.
                </p>
                <div className="text-[11px] font-semibold text-noc-accent">100% On-Premise & Offline</div>
              </div>

              <div className="rounded-2xl border border-noc-border/80 bg-noc-surface/50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-noc-text">
                  <ShieldCheck className="h-4 w-4 text-noc-info" />
                  Privacy & Data Boundary
                </div>
                <p className="text-xs leading-relaxed text-noc-muted">
                  When executive narrative LLM generation is enabled (via Groq, OpenAI, Ollama, or Anthropic),
                  only derived mathematical aggregates (e.g., peak values and trend slope) are transmitted. Raw subscriber numbers or cell records are never sent.
                </p>
                <div className="text-[11px] font-semibold text-noc-info">Zero PII Leakage</div>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-noc-muted">
              Deterministic Fallback Guarantee
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-noc-textDim">
              Even if external LLM APIs fail, time out, or are completely disabled, Core Insight automatically compiles
              a mathematical executive summary with key takeaways and recommendations, ensuring your management reports never have missing narrative blocks.
            </p>
          </section>
        </div>
      )}

      {/* ===================== TAB 4: DESKTOP AI ASSISTANT (MCP) ===================== */}
      {activeTab === 'mcp' && (
        <section className="card space-y-5">
          <div className="flex items-center gap-2.5 border-b border-noc-border/80 pb-3">
            <Plug className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
            <div>
              <h2 className="text-sm font-semibold text-noc-text">Desktop AI Assistant Connectivity (MCP)</h2>
              <p className="text-xs text-noc-muted">
                Connect external assistants like Claude Desktop, Cursor, or Windsurf via the Model Context Protocol.
              </p>
            </div>
          </div>

          <McpConnectPanel />
        </section>
      )}
    </div>
  );
}
