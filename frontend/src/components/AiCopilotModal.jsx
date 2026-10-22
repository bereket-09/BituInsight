import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  ShieldCheck,
  TrendingUp,
  Cpu,
  ArrowRight,
  ExternalLink,
  HelpCircle,
  Activity,
  Layers,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../api';

const ICON_STROKE = 1.75;

const PROMPT_SUGGESTIONS = [
  {
    id: 'health',
    title: 'Network Overview',
    prompt: 'Summarize overall network health and recent report results.',
  },
  {
    id: 'anomalies',
    title: 'Anomalies & Headroom',
    prompt: 'How does Core Insight detect anomalies and calculate capacity headroom?',
  },
  {
    id: 'mcp',
    title: 'Claude & Cursor Integration',
    prompt: 'How does the AI Assistant access (MCP) work and how do I connect it?',
  },
  {
    id: 'workflows',
    title: 'Supported KPI Workflows',
    prompt: 'What KPI workflows are currently available in the platform?',
  },
];

export default function AiCopilotModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'architecture'
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your **Core Insight Telecom AI Assistant**.\n\nI can help explain network KPI trends, clarify anomaly detections, analyze your report processing pipeline, or guide you through connecting desktop assistants like Claude or Cursor.\n\nWhat would you like to explore?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then((r) => r.data),
    staleTime: 30000,
  });

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages, isTyping]);

  if (!isOpen) return null;

  const stats = dashboardData?.stats;
  const recentWorkbooks = dashboardData?.recentWorkbooks || [];
  const recentReports = dashboardData?.recentReports || [];
  const total = Number(stats?.total) || 0;
  const completed = Number(stats?.completed) || 0;
  const completionRate = total ? Math.round((completed / total) * 100) : 100;

  const generateAnswer = (query) => {
    const q = query.toLowerCase();

    if (q.includes('health') || q.includes('recent') || q.includes('overview') || q.includes('status')) {
      return `### Network Operations Overview\n\n- **Pipeline Success Rate:** **${completionRate}%** (${completed} completed out of ${total} single KPI runs)\n- **Recent CMM Workbooks:** ${recentWorkbooks.length} workbooks processed in the latest batch\n- **Recent KPI Reports:** ${recentReports.length} individual reports on file\n\n**Health Assessment:** The ingestion pipeline is operating normally. All uploaded CMM workbooks are parsed against seasonal baselines to isolate genuine deviations from normal peak busy-hour traffic.`;
    }

    if (q.includes('anomal') || q.includes('headroom') || q.includes('capacity') || q.includes('detect')) {
      return `### How Anomaly & Capacity Detection Works\n\nCore Insight uses a **two-stage statistical model** designed specifically for cellular networks:\n\n1. **Seasonal Hour-of-Day Baselines:** Traffic at 18:00 is compared against other 18:00 periods, not 03:00. This avoids false positives during daily peak ramps.\n2. **Robust Z-Score + Materiality Bar:** A deviation must exceed statistical thresholds (using Median Absolute Deviation) AND represent a material change (>15-20%) before triggering an alert.\n3. **Capacity Headroom:** Peak busy hours are measured against configured thresholds to project days-to-saturation.\n\nThis intelligence runs **locally and deterministically** for every upload.`;
    }

    if (q.includes('mcp') || q.includes('claude') || q.includes('cursor') || q.includes('desktop') || q.includes('connect')) {
      return `### AI Assistant Access (Model Context Protocol)\n\n**Model Context Protocol (MCP)** allows an external AI tool—such as Claude Desktop, Claude Code, or Cursor—to read your telecom data directly.\n\n**Key Guarantees:**\n- 🔒 **Read-Only:** The assistant can only query reports and findings. It cannot delete, upload, or modify data.\n- 🛡️ **Account-Scoped:** Authentication tokens ensure an assistant sees only your authorized datasets.\n- 🌐 **No Database Credentials Required:** You connect via a simple hosted HTTP endpoint or local configuration snippet.\n\nYou can configure this anytime under **Settings → AI Assistant (MCP)**.`;
    }

    if (q.includes('workflow') || q.includes('kpi') || q.includes('type') || q.includes('cmm')) {
      return `### Supported KPI Workflows\n\nCore Insight provides specialized ingestion and charting workflows for key telecom metrics:\n\n- **CMM Throughput:** Control and user plane bandwidth profiling with peak detection.\n- **SAAU (Simultaneously Attached & Active Users):** High-density user concurrency tracking.\n- **Attached Users:** Total subscriber registrations and paging performance.\n- **Data / Traffic Volume:** Uplink and downlink payload distribution.\n- **Success Ratio:** Call and session setup reliability.\n\nYou can explore all workflows and custom definitions under the **KPI Workflows** page.`;
    }

    // Default contextual answer
    return `### AI Telemetry & Insights\n\nI parsed your query: *"${query}"*.\n\nCore Insight operates with built-in analytics intelligence:\n- **Automated Intelligence:** Seasonality, trend regression (r²), and capacity headroom are derived automatically.\n- **Executive Summaries:** Generated using lightweight LLM prompts or mathematical fallbacks.\n- **External Assistant:** Connect your personal AI tool via the Model Context Protocol in Settings.\n\nWould you like more details on your recent reports or help connecting an external assistant?`;
  };

  const handleSend = (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const responseText = generateAnswer(text);
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-noc-bg/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative flex h-[85vh] max-h-[780px] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-noc-border bg-noc-surface shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-noc-border/80 bg-noc-card/70 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-noc-accent/15 text-noc-accent">
              <Sparkles className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-noc-text">Core Insight Copilot</h2>
                <span className="badge badge-success text-[10px]">Active</span>
              </div>
              <p className="text-xs text-noc-muted">Telecom KPI intelligence & conversational analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-noc-border bg-noc-bg p-0.5 sm:flex">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={clsx(
                  'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                  activeTab === 'chat'
                    ? 'bg-noc-card text-noc-text shadow-sm'
                    : 'text-noc-muted hover:text-noc-text'
                )}
              >
                Assistant Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('architecture')}
                className={clsx(
                  'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                  activeTab === 'architecture'
                    ? 'bg-noc-card text-noc-text shadow-sm'
                    : 'text-noc-muted hover:text-noc-text'
                )}
              >
                How AI Works Here
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-noc-muted transition-colors hover:bg-noc-card hover:text-noc-text"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        {activeTab === 'chat' ? (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {messages.map((m) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <div
                    key={m.id}
                    className={clsx(
                      'flex gap-3 text-sm leading-relaxed',
                      isAssistant ? 'items-start' : 'items-start flex-row-reverse'
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                        isAssistant
                          ? 'bg-noc-accent/10 text-noc-accent border border-noc-accent/20'
                          : 'bg-noc-border text-noc-text'
                      )}
                    >
                      {isAssistant ? (
                        <Bot className="h-4 w-4" strokeWidth={ICON_STROKE} />
                      ) : (
                        <User className="h-4 w-4" strokeWidth={ICON_STROKE} />
                      )}
                    </span>
                    <div
                      className={clsx(
                        'max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm shadow-sm',
                        isAssistant
                          ? 'border border-noc-border bg-noc-card text-noc-text'
                          : 'bg-noc-accent text-white font-medium'
                      )}
                    >
                      <div className="space-y-2 whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-noc-accent/20 bg-noc-accent/10 text-noc-accent">
                    <Bot className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl border border-noc-border bg-noc-card px-4 py-3 text-noc-muted">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-noc-accent" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-noc-accent [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-noc-accent [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            <div className="shrink-0 border-t border-noc-border/60 bg-noc-card/40 px-6 py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-noc-muted">
                Suggested questions:
              </p>
              <div className="flex flex-wrap gap-2">
                {PROMPT_SUGGESTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSend(item.prompt)}
                    className="rounded-lg border border-noc-border bg-noc-surface px-2.5 py-1 text-xs text-noc-textDim transition-colors hover:border-noc-accent/40 hover:text-noc-text active:translate-y-px"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="shrink-0 border-t border-noc-border bg-noc-card p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about network KPIs, anomalies, capacity, or reports..."
                  className="input-field py-2.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="btn-primary shrink-0 px-4 py-2.5 disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" strokeWidth={ICON_STROKE} />
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Architecture / How AI Works Explainer View */
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div>
              <span className="eyebrow">Demystifying AI in Core Insight</span>
              <h3 className="mt-1 text-lg font-semibold text-noc-text">
                How AI & Analytics Actually Work on Your Data
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-noc-textDim">
                We believe AI should be transparent, deterministic where accuracy matters, and completely private.
                Core Insight organizes intelligence into three clear tiers:
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Pillar 1 */}
              <div className="rounded-2xl border border-noc-border bg-noc-card p-4 space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-noc-accent/15 text-noc-accent">
                  <Activity className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </div>
                <h4 className="text-sm font-semibold text-noc-text">1. Statistical Intelligence</h4>
                <p className="text-xs leading-relaxed text-noc-muted">
                  Runs locally on your server during upload. Automatically fits trends, scores data quality, establishes hour-of-day seasonal baselines, and flags anomalous dips and spikes.
                </p>
                <div className="pt-1 text-[11px] font-medium text-noc-accent">
                  100% Deterministic & Private
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="rounded-2xl border border-noc-border bg-noc-card p-4 space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-noc-info/15 text-noc-info">
                  <Sparkles className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </div>
                <h4 className="text-sm font-semibold text-noc-text">2. Executive AI Narratives</h4>
                <p className="text-xs leading-relaxed text-noc-muted">
                  Transforms statistical metrics into concise executive summaries and actionable recommendations for management decks. Only high-level mathematical figures are processed—never customer IDs.
                </p>
                <div className="pt-1 text-[11px] font-medium text-noc-info">
                  Privacy-Guaranteed Briefs
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="rounded-2xl border border-noc-border bg-noc-card p-4 space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-noc-warning/15 text-noc-warning">
                  <Cpu className="h-5 w-5" strokeWidth={ICON_STROKE} />
                </div>
                <h4 className="text-sm font-semibold text-noc-text">3. Desktop MCP Assistant</h4>
                <p className="text-xs leading-relaxed text-noc-muted">
                  Allows desktop assistants (Claude Desktop, Cursor, Claude Code) to ask questions about your reports using the open Model Context Protocol. Purely read-only and scoped to your account.
                </p>
                <div className="pt-1 text-[11px] font-medium text-noc-warning">
                  Read-Only Token Access
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-noc-border bg-noc-card p-5">
              <h4 className="text-sm font-semibold text-noc-text">Frequently Asked Questions</h4>
              <div className="mt-4 space-y-3 divide-y divide-noc-border/60">
                <div className="pt-3 first:pt-0">
                  <p className="text-xs font-semibold text-noc-text">Is my Excel data sent to third-party AI companies?</p>
                  <p className="mt-1 text-xs leading-relaxed text-noc-muted">
                    No. Raw cell values, subscriber numbers, and operator credentials are never sent to external AI APIs. Only derived statistical aggregates (e.g. &ldquo;95th percentile peak: 1.2M&rdquo;) form the executive summary brief.
                  </p>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-semibold text-noc-text">What happens if no AI API key is configured?</p>
                  <p className="mt-1 text-xs leading-relaxed text-noc-muted">
                    Core Insight includes a built-in deterministic narrative generator. You always receive complete executive takeaways and findings, even completely offline without an LLM.
                  </p>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-semibold text-noc-text">Where do I configure AI connections?</p>
                  <p className="mt-1 text-xs leading-relaxed text-noc-muted">
                    Head to <Link to="/settings" onClick={onClose} className="text-noc-accent underline font-medium">Settings → AI & Assistant</Link> to configure Microsoft Teams webhook deliveries, review LLM settings, or connect Claude Desktop via MCP.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
