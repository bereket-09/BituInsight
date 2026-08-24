import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
  UserCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { mcpApi } from '../api';

const ICON_STROKE = 1.75;

const README_URL =
  'https://github.com/bereket-09/BituInsight/blob/main/backend/src/mcp/README.md';

/**
 * The hosted endpoint lives alongside the rest of the API, so it is derived from
 * the same base this page already calls rather than hard-coded — a preview
 * deployment then shows its own URL instead of production's.
 */
function hostedUrl() {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) return `${base}/mcp`;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${base}/mcp`;
}

const HOSTED_URL = hostedUrl();

const HOSTED_CLIENTS = [
  {
    id: 'json',
    label: 'Claude Desktop, Cursor, Windsurf',
    snippet: `{
  "mcpServers": {
    "core-insight": {
      "type": "http",
      "url": "${HOSTED_URL}"
    }
  }
}`,
    hint: 'Paste into the client’s MCP config file — on macOS, ~/Library/Application Support/Claude/claude_desktop_config.json — then restart it.',
  },
  {
    id: 'cli',
    label: 'Claude Code',
    snippet: `claude mcp add --transport http core-insight ${HOSTED_URL}`,
    hint: 'Run once in a terminal, then approve the connection in the browser tab it opens.',
  },
  {
    id: 'url',
    label: 'Any other client',
    snippet: HOSTED_URL,
    hint: 'Add it as a remote MCP server over Streamable HTTP. The client handles the sign-in itself.',
  },
];

/*
 * Placeholders, never values. The path is the reader's own checkout and the
 * connection string is a credential, so both stay as angle-bracket slots the
 * reader fills in — this page must never render either one.
 */
const REPO_PATH_PLACEHOLDER = '<absolute path to your BituInsight checkout>';
const DATABASE_URL_PLACEHOLDER = '<your Postgres connection string>';

const LOCAL_CLIENTS = [
  {
    id: 'json',
    label: 'Claude Desktop, Cursor, Windsurf',
    snippet: `{
  "mcpServers": {
    "core-insight": {
      "command": "node",
      "args": [
        "${REPO_PATH_PLACEHOLDER}/backend/src/mcp/index.js"
      ],
      "env": {
        "DATABASE_URL": "${DATABASE_URL_PLACEHOLDER}"
      }
    }
  }
}`,
    hint: 'Paste into the client’s MCP config file, then restart it. The env block can be dropped if backend/.env already has DATABASE_URL.',
  },
  {
    id: 'cli',
    label: 'Claude Code',
    snippet: `claude mcp add core-insight \\
  --env DATABASE_URL='${DATABASE_URL_PLACEHOLDER}' \\
  -- node ${REPO_PATH_PLACEHOLDER}/backend/src/mcp/index.js`,
    hint: 'Run once in a terminal. The server is registered for this machine only.',
  },
];

const CONNECT_STEPS = [
  {
    icon: KeyRound,
    title: 'Your client opens a Core Insight login.',
    body: 'The first request returns a sign-in page. You approve the connection with the account you already use here.',
  },
  {
    icon: UserCheck,
    title: 'The assistant gets a token, not a database.',
    body: 'It receives an access token for your account. There is no connection string to paste and nothing to install.',
  },
  {
    icon: ShieldCheck,
    title: 'Every question is answered from your data only.',
    body: 'Each query is filtered to the account that owns the token, so “all my reports” means yours.',
  },
];

/**
 * Clipboard access is unavailable on non-secure origins, so fall back to the
 * legacy command and, if that fails too, report it rather than pretending.
 */
async function writeToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/** Leave the block selected so the reader can finish the copy by hand. */
function selectElement(node) {
  if (!node || !window.getSelection || !document.createRange) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function CodeBlock({ code, label }) {
  const [state, setState] = useState('idle');
  const preRef = useRef(null);

  const handleCopy = async () => {
    const copied = await writeToClipboard(code);
    if (copied) {
      setState('copied');
      setTimeout(() => setState('idle'), 2200);
    } else {
      selectElement(preRef.current);
      setState('manual');
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-noc-border bg-noc-bg">
      <div className="flex items-center justify-between gap-3 border-b border-noc-border/70 px-3 py-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-noc-muted">
          {label}
        </span>
        <button type="button" onClick={handleCopy} className="btn-secondary px-2.5 py-1 text-xs">
          {state === 'copied' ? (
            <Check className="h-3.5 w-3.5 text-noc-success" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          )}
          {state === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto px-3.5 py-3 font-mono text-[11px] leading-relaxed text-noc-textDim"
      >
        {code}
      </pre>
      <p aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Configuration copied to clipboard' : ''}
      </p>
      {state === 'manual' && (
        <p className="border-t border-noc-border/70 px-3.5 py-2 text-xs text-noc-warning">
          This browser blocked clipboard access. The block above is selected — press
          Cmd+C or Ctrl+C to copy it.
        </p>
      )}
    </div>
  );
}

/** Client picker shared by the hosted and local paths. */
function ClientPicker({ clients, value, onChange }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {clients.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onChange(entry.id)}
          aria-pressed={entry.id === value}
          className={clsx(
            'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200',
            entry.id === value
              ? 'border-noc-accent/40 bg-noc-accent/10 text-noc-accent'
              : 'border-noc-border bg-noc-surface text-noc-textDim hover:text-noc-text'
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function SafetyPoint({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-noc-accent" strokeWidth={ICON_STROKE} />
      <span className="text-xs leading-relaxed text-noc-textDim">
        <span className="font-medium text-noc-text">{title}</span> {children}
      </span>
    </li>
  );
}

/**
 * The multi-account guard, stated as it actually behaves — and only for the local
 * path, which is the one it applies to. The account count is a fact about this
 * database; the override is read from this deployment's environment, which is not
 * necessarily the environment the local process runs in.
 */
function AccessNotice({ access }) {
  const count = access?.accountCount;
  const allowAll = Boolean(access?.allowAllUsers);
  const blocked = access?.startsWithoutOverride === false;

  let body;
  if (!access) {
    // Still loading, or the lookup failed: say nothing about this database.
    body = '';
  } else if (count === null || count === undefined) {
    body =
      'The account count could not be read just now, so this cannot say which case applies to you.';
  } else if (count <= 1) {
    body = `This database holds ${count === 1 ? 'a single account' : 'no accounts'}, so there is nothing to separate and the local server starts normally. It will refuse to start once a second account exists.`;
  } else if (allowAll) {
    body = `This database holds ${count} accounts. MCP_ALLOW_ALL_USERS=true is set in this deployment's environment, so where that is also set for the local process the guard is waived and its tools read every account's reports.`;
  } else {
    body = `This database holds ${count} accounts, so the local server will refuse to start. Use the hosted endpoint above, or choose one of the options below.`;
  }

  return (
    <div
      className={clsx(
        'mt-3 rounded-xl border p-3.5',
        blocked ? 'border-noc-warning/40 bg-noc-warning/5' : 'border-noc-border bg-noc-bg'
      )}
    >
      <div className="flex gap-2.5">
        {blocked ? (
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-noc-warning"
            strokeWidth={ICON_STROKE}
          />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-noc-muted" strokeWidth={ICON_STROKE} />
        )}
        <div>
          <p className="text-xs font-medium text-noc-text">
            Run locally and there is no signed-in user, so the local server fails closed
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-noc-textDim">
            Over a pipe on your own machine nothing identifies you, so the tools read
            every account rather than yours. Rather than do that silently, the local
            server refuses to start when the database holds more than one account. {body}
          </p>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-noc-textDim">
            <li>
              <span className="font-medium text-noc-text">Recommended</span> — use the
              hosted endpoint instead. It signs you in and scopes every tool to your
              account.
            </li>
            <li>
              <span className="font-medium text-noc-text">Or</span> — point
              <code className="mx-1 rounded bg-noc-surface px-1.5 py-0.5 font-mono text-[11px] text-noc-accent">
                DATABASE_URL
              </code>
              at a Postgres role restricted to the rows that person may read, so the
              boundary is enforced by the database rather than by the process.
            </li>
            <li>
              <span className="font-medium text-noc-text">Or</span> — set
              <code className="mx-1 rounded bg-noc-surface px-1.5 py-0.5 font-mono text-[11px] text-noc-accent">
                MCP_ALLOW_ALL_USERS=true
              </code>
              when every MCP user is entitled to see every report anyway.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ToolGroup({ group }) {
  return (
    <div className="border-t border-noc-border/60 pt-3 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold text-noc-text">{group.label}</h4>
        <span className="badge badge-neutral">{group.tools.length}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-noc-muted">{group.blurb}</p>
      <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {group.tools.map((tool) => (
          <li key={tool.name} className="min-w-0" title={tool.description || undefined}>
            <code className="font-mono text-[11px] text-noc-accent">{tool.name}</code>
            <span className="ml-2 text-[11px] text-noc-muted">{tool.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function McpConnectPanel() {
  const [hostedClientId, setHostedClientId] = useState(HOSTED_CLIENTS[0].id);
  const [localClientId, setLocalClientId] = useState(LOCAL_CLIENTS[0].id);
  const [localOpen, setLocalOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['mcp-connection'],
    queryFn: () => mcpApi.connection().then((res) => res.data),
    staleTime: 5 * 60 * 1000,
  });

  const hostedClient =
    HOSTED_CLIENTS.find((entry) => entry.id === hostedClientId) || HOSTED_CLIENTS[0];
  const localClient =
    LOCAL_CLIENTS.find((entry) => entry.id === localClientId) || LOCAL_CLIENTS[0];
  const blockedColumns = data?.blockedColumns || [];
  const timeoutSeconds = data?.limits?.statementTimeoutMs
    ? Math.round(data.limits.statementTimeoutMs / 1000)
    : null;

  return (
    <div>
      <p className="text-sm leading-relaxed text-noc-textDim">
        The Model Context Protocol lets an AI assistant — Claude Desktop, Claude Code,
        Cursor or your own agent — query this platform's reports, KPIs and findings
        directly, in plain language. The connection is read-only: the assistant can ask
        questions about your data but cannot upload, edit, delete or process anything.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="badge badge-success">Read-only</span>
        <span className="badge badge-info">Scoped to your account</span>
        {data ? (
          <>
            <span className="badge badge-neutral">{data.toolCount} tools</span>
            <span className="badge badge-neutral">
              {data.server.name} v{data.server.version}
            </span>
          </>
        ) : null}
      </div>

      {/* Hosted connection — the primary path */}
      <section className="mt-6 border-t border-noc-border/60 pt-5">
        <p className="eyebrow">Connect to this deployment</p>
        <p className="mt-2 text-sm leading-relaxed text-noc-textDim">
          Point your client at one URL. There is no database connection string to hand
          over and nothing to install — connecting opens a Core Insight login, and once
          you approve it the assistant reads your account's data and no one else's.
        </p>

        <div className="mt-3.5 rounded-xl border border-noc-accent/25 bg-noc-accent/5 p-3.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-noc-muted">
            Remote MCP endpoint
          </p>
          <p className="mt-1.5 break-all font-mono text-xs text-noc-accent">{HOSTED_URL}</p>
        </div>

        <ol className="mt-4 space-y-2.5">
          {CONNECT_STEPS.map((step) => (
            <li key={step.title} className="flex gap-2.5">
              <step.icon
                className="mt-0.5 h-4 w-4 shrink-0 text-noc-accent"
                strokeWidth={ICON_STROKE}
              />
              <span className="text-xs leading-relaxed text-noc-textDim">
                <span className="font-medium text-noc-text">{step.title}</span> {step.body}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <ClientPicker
            clients={HOSTED_CLIENTS}
            value={hostedClientId}
            onChange={setHostedClientId}
          />
          <CodeBlock code={hostedClient.snippet} label={hostedClient.label} />
          <p className="mt-2 text-xs leading-relaxed text-noc-muted">{hostedClient.hint}</p>
        </div>
      </section>

      {/* Tools */}
      <section className="mt-6 border-t border-noc-border/60 pt-5">
        <p className="eyebrow">What the assistant can ask for</p>
        {isLoading && (
          <div className="mt-3 space-y-2">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs leading-relaxed text-noc-warning">
            The tool list could not be loaded from the server. Rather than show a list
            that might be out of date, it is left out — the README below has the full
            reference.
          </p>
        )}
        {data && (
          <div className="mt-3 space-y-4">
            {data.groups.map((group) => (
              <ToolGroup key={group.id} group={group} />
            ))}
          </div>
        )}
      </section>

      {/* Safety */}
      <section className="mt-6 border-t border-noc-border/60 pt-5">
        <p className="eyebrow">What it cannot do</p>
        <ul className="mt-3 space-y-2.5">
          <SafetyPoint icon={UserCheck} title="It cannot reach another account.">
            Over the hosted endpoint every statement carries a bound ownership filter, and
            the query helper refuses to run one that does not declare which column ties
            its rows to an account — so a missing filter fails loudly rather than quietly
            returning someone else's reports.
          </SafetyPoint>
          <SafetyPoint icon={ShieldCheck} title="No tool accepts SQL.">
            Every statement is authored in the server's own source and all input from the
            assistant arrives as a bound parameter, so a model cannot compose a query at
            all.
          </SafetyPoint>
          <SafetyPoint icon={ShieldCheck} title="A guard rejects anything but a read.">
            Only a single SELECT or WITH…SELECT passes; every write, DDL and
            session-mutating keyword is refused before it reaches the database.
          </SafetyPoint>
          <SafetyPoint icon={ShieldCheck} title="Postgres enforces it independently.">
            Each statement runs inside BEGIN TRANSACTION READ ONLY
            {timeoutSeconds ? ` with a ${timeoutSeconds}-second statement timeout` : ''}, so
            the database itself refuses a write even if the guard were bypassed.
          </SafetyPoint>
          <SafetyPoint icon={Lock} title="Two columns are unreadable by name.">
            {blockedColumns.length > 0 ? (
              <>
                {blockedColumns.map((column, index) => (
                  <span key={column}>
                    {index > 0 ? ' and ' : ''}
                    <code className="rounded bg-noc-bg px-1 py-0.5 font-mono text-[11px] text-noc-accent">
                      {column}
                    </code>
                  </span>
                ))}{' '}
                are rejected by the guard, so chart image bytes and password hashes never
                leave the database through MCP.
              </>
            ) : (
              'Chart image bytes and password hashes are rejected by name, so they never leave the database through MCP.'
            )}
          </SafetyPoint>
          <SafetyPoint icon={ShieldCheck} title="Nothing outside the database is touched.">
            No tool writes files, uploads data, calls the platform's HTTP API or starts
            report processing, and the MCP layer uses its own small connection pool.
          </SafetyPoint>
        </ul>
      </section>

      {/* Local fallback — secondary */}
      <section className="mt-6 border-t border-noc-border/60 pt-5">
        <button
          type="button"
          onClick={() => setLocalOpen((open) => !open)}
          aria-expanded={localOpen}
          className="flex w-full items-center gap-2 text-left"
        >
          <Terminal className="h-4 w-4 shrink-0 text-noc-muted" strokeWidth={ICON_STROKE} />
          <span className="text-xs font-semibold text-noc-text">Or run it locally</span>
          <span className="text-xs text-noc-muted">
            stdio, on your own machine, with your own database
          </span>
          <ChevronDown
            className={clsx(
              'ml-auto h-4 w-4 shrink-0 text-noc-muted transition-transform duration-200',
              localOpen && 'rotate-180'
            )}
            strokeWidth={ICON_STROKE}
          />
        </button>

        {localOpen && (
          <div className="mt-3.5">
            <p className="text-xs leading-relaxed text-noc-textDim">
              The same server also runs over stdio from a checkout of this repository.
              Your client launches it as a subprocess and it connects straight to Postgres
              with a connection string you supply, so nothing is signed in and the tools
              read every account in that database. Core Insight cannot tell you whether a
              local client is connected — the client owns the process.
            </p>

            <ClientPicker
              clients={LOCAL_CLIENTS}
              value={localClientId}
              onChange={setLocalClientId}
            />
            <CodeBlock code={localClient.snippet} label={localClient.label} />
            <p className="mt-2 text-xs leading-relaxed text-noc-muted">{localClient.hint}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-noc-muted">
              Both placeholders are yours to fill in: the absolute path to your checkout of
              this repository, and the Postgres connection string the server should read
              with. Core Insight never renders a connection string on this page.
            </p>

            <AccessNotice access={data?.access} />
          </div>
        )}
      </section>

      <div className="mt-6 border-t border-noc-border/60 pt-4">
        <a
          href={README_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Full reference — every tool and parameter
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
        </a>
        <p className="mt-2 text-xs text-noc-muted">
          In your checkout:
          <code className="ml-1 rounded bg-noc-bg px-1.5 py-0.5 font-mono text-[11px] text-noc-accent">
            backend/src/mcp/README.md
          </code>
        </p>
      </div>
    </div>
  );
}
