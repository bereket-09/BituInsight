import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Check,
  Copy,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  AlertTriangle,
} from 'lucide-react';
import { ingestApi } from '../api';
import { API_URL } from '../api/client';

const ICON_STROKE = 1.75;

const STATUS = {
  processed: { label: 'Imported', className: 'badge-success' },
  duplicate: { label: 'Duplicate', className: 'badge-neutral' },
  rejected: { label: 'Rejected', className: 'badge-warning' },
  failed: { label: 'Failed', className: 'badge-danger' },
  received: { label: 'Processing', className: 'badge-info' },
};

function endpointBase() {
  if (/^https?:\/\//.test(API_URL)) return API_URL.replace(/\/$/, '');
  return `${window.location.origin}${API_URL.replace(/\/$/, '')}`;
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary shrink-0 px-2.5 py-1.5 text-xs"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

function CodeLine({ label, value }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg border border-noc-border bg-noc-bg/60 px-3 py-2 font-mono text-xs text-noc-text">
        {value}
      </code>
      <CopyButton text={value} />
    </div>
  );
}

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resultLink(event) {
  if (event.report_id) return { to: `/reports/${event.report_id}`, label: 'Open report' };
  if (event.workbook_id) return { to: `/workbooks/${event.workbook_id}`, label: 'Open workbook' };
  return null;
}

export default function AutomaticImports() {
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState('Power Automate – NetAct mail');
  const [newKey, setNewKey] = useState(null);

  const keysQuery = useQuery({ queryKey: ['ingest-keys'], queryFn: () => ingestApi.keys().then((r) => r.data.keys) });
  const eventsQuery = useQuery({
    queryKey: ['ingest-events'],
    queryFn: () => ingestApi.events({ limit: 100 }).then((r) => r.data.events),
    refetchInterval: 30000,
  });

  const createKey = useMutation({
    mutationFn: () => ingestApi.createKey(keyName),
    onSuccess: (res) => {
      setNewKey(res.data);
      queryClient.invalidateQueries({ queryKey: ['ingest-keys'] });
    },
  });
  const revokeKey = useMutation({
    mutationFn: (id) => ingestApi.revokeKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingest-keys'] }),
  });

  const base = endpointBase();
  const activeKeys = (keysQuery.data || []).filter((k) => !k.revoked_at);
  const events = eventsQuery.data || [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header>
        <p className="eyebrow">Reporting</p>
        <h1 className="mt-2 text-display-md text-noc-text">Automatic imports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-noc-textDim">
          Files sent here by an automation — such as a Power Automate flow on the mailbox that
          receives NetAct&rsquo;s scheduled exports — are recognised and processed like a manual
          upload, and appear in your reports. CMM workbooks, CMG throughput and Peak Attach Users
          exports are detected automatically.
        </p>
      </header>

      {/* ——— Connection details ——— */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold text-noc-text">Where to send files</h2>
        </div>
        <CodeLine label="Upload (POST)" value={`${base}/ingest/files`} />
        <CodeLine label="Test (GET)" value={`${base}/ingest/ping`} />
        <CodeLine label="Header" value="Authorization: Bearer <your import key>" />
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-noc-muted">JSON body</p>
          <pre className="overflow-x-auto rounded-lg border border-noc-border bg-noc-bg/60 p-3 font-mono text-[11px] leading-relaxed text-noc-textDim">{`{
  "fileName": "Peak_Attach_Users.xlsx",
  "contentBytes": "<the attachment, base64>",
  "source": { "from": "...", "subject": "...", "receivedAt": "...", "messageId": "..." },
  "notifyTeams": false,
  "workflow": "optional — e.g. traffic-volume or cmm-workbook to skip detection"
}`}</pre>
          <p className="mt-2 text-xs text-noc-muted">
            Files up to about 3 MB per attachment (the hosting limit is 4.5 MB per request, and
            base64 adds a third). The same file sent twice is recognised and not processed again.
          </p>
        </div>
      </section>

      {/* ——— Keys ——— */}
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold text-noc-text">Import keys</h2>
        </div>
        <p className="text-xs leading-relaxed text-noc-muted">
          An import key lets an automation send files into <em>your</em> reports. It cannot read
          anything or sign in. Create one per flow so each can be revoked on its own.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input-field flex-1"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="What will use this key?"
            maxLength={80}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={createKey.isPending || !keyName.trim()}
            onClick={() => createKey.mutate()}
          >
            <Plus className="h-4 w-4" />
            {createKey.isPending ? 'Creating…' : 'Create key'}
          </button>
        </div>

        {newKey && (
          <div className="rounded-xl border border-noc-accent/40 bg-noc-accent/[0.07] p-4">
            <p className="text-sm font-semibold text-noc-text">Copy this key now — it will not be shown again</p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-noc-border bg-noc-bg/70 px-3 py-2 font-mono text-xs text-noc-text">
                {newKey.key}
              </code>
              <CopyButton text={newKey.key} label="Copy key" />
            </div>
            <p className="mt-2 text-xs text-noc-muted">
              Paste it into the flow&rsquo;s HTTP step as <code>Bearer {newKey.keyPrefix}…</code>. Treat it
              like a password.
            </p>
          </div>
        )}

        {activeKeys.length > 0 ? (
          <ul className="divide-y divide-noc-border rounded-xl border border-noc-border">
            {activeKeys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm text-noc-text">{k.name}</span>
                <code className="font-mono text-xs text-noc-muted">{k.key_prefix}…</code>
                <span className="text-xs text-noc-muted">
                  {k.last_used_at ? `last used ${formatWhen(k.last_used_at)}` : 'never used'}
                </span>
                <button
                  type="button"
                  className="btn-secondary px-2.5 py-1.5 text-xs"
                  disabled={revokeKey.isPending}
                  onClick={() => {
                    if (window.confirm(`Revoke "${k.name}"? Any flow using it will stop working.`)) {
                      revokeKey.mutate(k.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !keysQuery.isLoading && <p className="text-xs text-noc-muted">No active keys yet.</p>
        )}
      </section>

      {/* ——— Log ——— */}
      <section className="card overflow-hidden p-0">
        <header className="flex flex-wrap items-center gap-2 border-b border-noc-border/70 px-5 py-3.5">
          <Mail className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold text-noc-text">Import log</h2>
          <span className="text-xs text-noc-muted">refreshes every 30 seconds</span>
          <button
            type="button"
            className="btn-secondary ml-auto px-2.5 py-1.5 text-xs"
            onClick={() => eventsQuery.refetch()}
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', eventsQuery.isFetching && 'animate-spin')} />
            Refresh
          </button>
        </header>

        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-noc-muted">
            {eventsQuery.isLoading ? 'Loading…' : 'Nothing has been sent yet. Files from your flow will appear here.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-left text-[10px] uppercase tracking-[0.12em] text-noc-muted">
                  <th className="px-4 py-2 font-medium">Received</th>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-4 py-2 font-medium">From email</th>
                  <th className="px-4 py-2 font-medium">Detected as</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const status = STATUS[e.status] || STATUS.received;
                  const link = resultLink(e);
                  const resultFailed = e.result_status === 'failed';
                  return (
                    <tr key={e.id} className="border-b border-noc-border/50 align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-noc-textDim">{formatWhen(e.created_at)}</td>
                      <td className="max-w-[16rem] px-4 py-3">
                        <p className="truncate font-mono text-xs text-noc-text" title={e.file_name}>{e.file_name}</p>
                        {e.key_name && <p className="mt-0.5 text-[11px] text-noc-muted">via {e.key_name}</p>}
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 text-xs text-noc-textDim">
                        <p className="truncate">{e.source?.from || '—'}</p>
                        {e.source?.subject && (
                          <p className="mt-0.5 truncate text-[11px] text-noc-muted" title={e.source.subject}>
                            {e.source.subject}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-noc-text">
                        {e.workflow_slug === 'cmm-workbook' ? 'CMM workbook' : e.workflow_name || e.workflow_slug || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('badge', resultFailed ? 'badge-danger' : status.className)}>
                          {resultFailed ? 'Failed' : status.label}
                        </span>
                      </td>
                      <td className="max-w-[18rem] px-4 py-3 text-xs">
                        {link && (
                          <Link to={link.to} className="font-medium text-noc-accent hover:underline">
                            {link.label}
                          </Link>
                        )}
                        {e.message && (
                          <p
                            className={clsx(
                              'mt-0.5 leading-snug',
                              e.status === 'rejected' || e.status === 'failed' ? 'text-noc-warning' : 'text-noc-muted'
                            )}
                          >
                            {(e.status === 'rejected' || e.status === 'failed') && (
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                            )}
                            {e.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
