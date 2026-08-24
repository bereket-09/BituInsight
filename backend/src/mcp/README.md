# Core Insight MCP Server (read-only)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP
client — Claude Desktop, Claude Code, Cursor, Windsurf, or your own agent — query the
Core Insight telecom KPI analytics platform in natural language.

**It is read-only by construction.** It cannot upload files, start report processing,
edit or delete anything, or write to disk. See [Read-only guarantee](#read-only-guarantee).

There are two ways to connect, and they share one set of tool implementations:

| | Hosted (recommended) | Local (stdio) |
| --- | --- | --- |
| How you connect | Add the remote MCP URL to your client; it opens a Core Insight login to approve access | Your client launches `src/mcp/index.js` on your machine |
| Credentials | An OAuth token for your Core Insight account | A raw `DATABASE_URL` you paste into the client config |
| Whose data you see | **Yours only** — every query is filtered to the signed-in account | Every account in the database |
| Install | Nothing | This repository, Node, a reachable Postgres |
| Code | `src/mcp-http/` | `src/mcp/index.js` |

---

## Hosted endpoint

```
POST https://bituinsight.vercel.app/api/mcp
```

Streamable HTTP, **stateless** — no `Mcp-Session-Id` is issued and each request stands
alone, because Vercel keeps no memory between invocations and may route two requests of
the same conversation to different instances. `GET` is answered `405` (there is no
server-initiated SSE stream to open) and `DELETE` is a no-op `204`.

The endpoint is mounted behind the OAuth bearer middleware, which verifies the token and
exposes the platform user id at `req.auth.extra.userId`. `src/mcp-http/index.js` turns
that id into the scope every tool query is bound to. A request that arrives without an
identified account is refused with `401` — it is never served unscoped.

See [Account scoping](#account-scoping).

---

## Quick start (local stdio)

```bash
cd backend
npm install
DATABASE_URL='postgres://user:pass@host/db?sslmode=require' npm run mcp
```

The server speaks MCP over **stdio**. Diagnostics go to stderr; stdout carries only the
JSON-RPC stream. Started manually it will just sit there waiting for a client — that is
correct behaviour.

### Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | falls back to the local dev URL in `src/config` | Postgres connection string. SSL is enabled automatically for Neon / Supabase / RDS / `sslmode=require`. |
| `MCP_STATEMENT_TIMEOUT_MS` | no | `20000` | Hard per-query timeout. |
| `MCP_POOL_MAX` | no | `3` | Connection pool size for the MCP process. |

`backend/.env` is loaded automatically (via `src/config`), so a local `.env` with
`DATABASE_URL` is enough.

---

## Connecting Claude Desktop

Edit the Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Paste this (adjust the absolute path and connection string), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "core-insight": {
      "command": "node",
      "args": [
        "/absolute/path/to/BituInsight/backend/src/mcp/index.js"
      ],
      "env": {
        "DATABASE_URL": "postgresql://user:password@host/db?sslmode=require"
      }
    }
  }
}
```

If `backend/.env` already contains `DATABASE_URL`, the `env` block can be omitted.

### Claude Code

```bash
claude mcp add core-insight \
  --env DATABASE_URL='postgresql://user:password@host/db?sslmode=require' \
  -- node /absolute/path/to/BituInsight/backend/src/mcp/index.js
```

### Cursor / Windsurf

Same JSON shape, in `~/.cursor/mcp.json` (or the editor's MCP settings):

```json
{
  "mcpServers": {
    "core-insight": {
      "command": "node",
      "args": ["/absolute/path/to/BituInsight/backend/src/mcp/index.js"],
      "env": { "DATABASE_URL": "postgresql://user:password@host/db?sslmode=require" }
    }
  }
}
```

---

## Read-only guarantee

The user requirement was explicit: the AI must never write. That is enforced
structurally, in four independent layers, not by convention.

1. **No tool accepts SQL.** Every statement in this server is authored in
   `src/mcp/tools/*.js`. Caller input is only ever bound as a parameter (`$1`, `$2`, …).
   A connected model cannot author a statement at all, so there is nothing to inject into.
2. **Statement guard** (`src/mcp/db.js` → `assertReadOnly`). Every query must be a single
   `SELECT` or `WITH … SELECT`. Multiple statements, all write/DDL/session keywords
   (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`,
   `COPY`, `SET`, `BEGIN`, `CALL`, …) and volatile admin functions (`pg_sleep`,
   `pg_read_file`, `pg_terminate_backend`, `dblink`, `nextval`, …) are rejected. Comments
   and string literals are stripped before scanning, so `created_at`, `OFFSET` and
   `->>'start'` are not false positives.
3. **PostgreSQL itself.** Every statement runs inside `BEGIN TRANSACTION READ ONLY` with
   `SET LOCAL statement_timeout`. Even if layers 1–2 were bypassed, the database refuses
   the write with SQLSTATE `25006`. (Transaction-scoped rather than session-scoped because
   Neon's pooler rejects session startup options.)
4. **Blocked columns.** `generated_charts.image_data` and `users.password_hash` are
   rejected by name, so no query in this server — now or after a future edit — can select
   them.

Beyond the database: no tool writes files, uploads anything, calls the platform's HTTP
API, or triggers the report-processing pipeline. The MCP process uses its own small
connection pool (`src/mcp/db.js`), so it cannot affect the API server's connection budget.

**Never returned:** chart image bytes (`image_data`, up to ~100 KB of PNG per row —
`image_bytes` gives the size instead) and password hashes.

---

## Account scoping

Whose rows a statement may read is decided by a **scope**, built in `src/mcp/db.js` and
handed to the tool assembly. Tools never reach the raw reader; they only have
`scope.readRows` / `scope.readOne` (scoped) and `scope.catalogRows` / `scope.catalogOne`
(account-neutral). The separation is enforced from both sides, so a leak takes more than
one forgotten `WHERE`:

- **A scoped statement must declare its anchor.** Every statement passed to the scoped
  reader has to contain at least one `{{SCOPE:alias.user_id}}` (or `{{SCOPE:alias.id}}`
  for the `users` row itself). The scope substitutes it for `alias.user_id = $n` and
  appends the caller's id as a bound parameter. A statement with no anchor is **refused
  before it reaches the database** — a tool that forgets the filter fails loudly instead
  of returning somebody else's reports. The column half is a closed set, so an anchor can
  only ever expand into an ownership test.
- **An account-neutral statement must prove it.** The catalogue reader rejects any
  statement naming `users`, `uploaded_files`, `processed_reports`, `workbook_uploads`,
  `generated_metrics`, `generated_charts` or `teams_delivery_logs`.

Tables with no `user_id` of their own — `generated_charts`, `generated_metrics` — inherit
ownership from the report they hang off, so those statements join `processed_reports` and
anchor there.

**Unscoped by design.** Only two reads are account-neutral, both in `describe_schema`: the
column list from `information_schema.columns` and the enum list from `pg_type`/`pg_enum`.
They describe the shape of the database, not anybody's rows. Everything else is scoped —
including `describe_schema`'s row counts, which report what the session can reach rather
than what the platform holds, and the workflow catalogue's report counts, where the
anchor sits in the `LEFT JOIN` so every workflow is still listed while only the caller's
reports are counted. `list_users` anchors on the primary key, so an authenticated session
sees its own account and no other.

### The local stdio server

Run over stdio there is no signed-in user — an MCP client launches the process with a
`DATABASE_URL` and nothing else — so the tools read every account, exactly as they always
have. That is a named choice, not an omission: `index.js` builds its scope through
`createAllAccountsScope(ALL_ACCOUNTS_ACKNOWLEDGEMENT)`, which refuses to exist without the
explicit acknowledgement string, and the anchor is still required on every statement — it
just expands to a constant. `get_server_info` reports `scope.mode` so a connected model can
tell the two apart.

The existing fail-closed check still applies: if the database holds more than one account
the stdio server **refuses to start**, and prints the ways forward.

- **Recommended** — connect to the hosted endpoint instead. It identifies you and scopes
  every tool to your account.
- **Or** point `DATABASE_URL` at a Postgres role restricted to the rows that user may read.
- **Or** set `MCP_ALLOW_ALL_USERS=true` when every MCP user is entitled to see every
  report anyway.

On a single-account deployment there is nothing to separate and the server starts normally.

---

## Tools

21 tools. All are annotated `readOnlyHint: true`.

Every response is compact JSON. Large arrays are bounded and, when truncated, carry an
explicit `truncationNote` saying how many items were omitted and how to get the rest —
nothing is ever silently cut. A miss returns `{ "found": false, "message": … }` rather
than an error.

### Discovery

#### `describe_schema`
Every table this server reads, its columns and types, row counts, enum values, foreign-key
relationships, and — most usefully — a hand-written map of the JSONB documents (where
findings, time series and chart configs actually live) naming the tool that reads each one.
Start here.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `table` | enum | all | One of `users`, `kpi_workflows`, `uploaded_files`, `processed_reports`, `workbook_uploads`, `generated_metrics`, `generated_charts`, `teams_delivery_logs` |
| `include_jsonb_guide` | boolean | `true` | The JSONB path map |
| `include_counts` | boolean | `true` | Per-table row counts |

#### `get_server_info`
No parameters. What the server is, its read-only guarantees, blocked columns and the
limits applied to every query.

#### `list_workflows`
The three KPI workflows, merging the code definition (required columns, chart definitions,
metadata) with the database row and report counts.

| Parameter | Type | Default |
| --- | --- | --- |
| `include_charts` | boolean | `true` |

#### `get_workflow`
Full definition of one workflow plus its report statistics and five most recent reports.

| Parameter | Type | Notes |
| --- | --- | --- |
| `slug` | enum, required | `traffic-volume`, `telecom-metric`, `cmg-data-throughput` |

#### `list_users`
Platform accounts with report and workbook counts. Credentials are unreadable by design.

| Parameter | Type | Default | Max |
| --- | --- | --- | --- |
| `limit` | integer | 25 | 100 |

#### `get_platform_stats`
Report and workbook counts by status, per-workflow usage, chart/file storage totals, KPI
coverage, a daily activity histogram, data-quality spread and the most recent uploads.

| Parameter | Type | Default | Max |
| --- | --- | --- | --- |
| `recent_limit` | integer | 10 | 50 |
| `activity_days` | integer | 30 | 365 |

### Reports

#### `list_reports`
Search and filter processed reports. Returns headline fields only.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `workflow` | enum | — | Workflow slug |
| `status` | enum | — | `pending`, `validating`, `processing`, `completed`, `failed` |
| `kpi_name` | string ≤200 | — | Case-insensitive substring |
| `search` | string ≤200 | — | Free text over filename, KPI, sheet, title, narrative |
| `workbook_id` | uuid | — | Only KPIs from this workbook |
| `user_email` | string ≤255 | — | Owning user |
| `created_from` / `created_to` | ISO date | — | Date range |
| `only_standalone` | boolean | — | Single-file uploads only |
| `only_workbook_kpis` | boolean | — | Workbook children only |
| `has_findings` | boolean | — | With / without analytics findings |
| `has_intelligence` | boolean | — | Carries an intelligence block |
| `sort` | enum | `created_desc` | `created_desc`, `created_asc`, `completed_desc`, `kpi_asc`, `status_asc` |
| `page` | integer | 1 | max 1000 |
| `limit` | integer | 20 | max 100 |

#### `get_report`
Full detail for one report.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `report_id` | uuid, required | — | |
| `sections` | array of enum | all | `overview`, `summary`, `metrics`, `charts`, `parse_meta`, `timeseries_meta`, `validation` |
| `max_summary_chars` | integer | 40000 | Inline budget for the formatted summary |

The `charts` section is metadata only. The analytics block is deliberately excluded — use
`get_report_intelligence`; series points come from `get_report_timeseries`.

#### `get_report_metrics`
Headline metric object (average, peak, latest, minimum, threshold, unit, …), highlight
chips, node split, daily peaks, peaks-by-view, plus the persisted `generated_metrics` rows.

| Parameter | Type |
| --- | --- |
| `report_id` | uuid, required |

#### `get_report_timeseries`
Paginated series points. Series are stored per span; call without `span` to get the
auto-detected one plus every available span and its size.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `report_id` | uuid, required | — | |
| `span` | string ≤30 | auto-detected | e.g. `native`, `hourly`, `daily`, `weekly`, `monthly` |
| `offset` | integer | 0 | 0-based |
| `limit` | integer | 200 | **max 500** |
| `fields` | array of string (≤20) | all | Keep only these keys per point |
| `include_meta` | boolean | `true` | min/peak/detected/spans |

Returns `hasMore` and `nextOffset` for paging, and a `truncationNote` whenever the window
is partial.

### Analytics

#### `get_report_intelligence`
The analytics pass for one report.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `report_id` | uuid, required | — | |
| `sections` | array of enum | all | `scope`, `findings`, `anomalies`, `trend`, `forecast`, `capacity`, `quality`, `baseline`, `dailyShape`, `balance`, `narrative` |
| `max_findings` | integer | 25 | max 100 |
| `max_anomalies` | integer | 50 | max 500 |
| `max_evidence` | integer | 10 | max 200, per finding |
| `max_baseline_buckets` | integer | 24 | max 200 |

Merges `summary.intelligence` with `report_data.intelligence` (which alone holds
`anomalies`, `baseline` and `brief`).

#### `search_findings`
Cross-report search over ranked findings, ordered by severity then recency.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `category` | enum | — | `anomaly`, `data-quality`, `trend`, `capacity`, `distribution` |
| `severity` | enum | — | `critical`, `major`, `minor`, `info` |
| `min_severity` | enum | — | This severity and anything worse |
| `workflow` | enum | — | Workflow slug |
| `kpi_name` | string ≤200 | — | Substring |
| `workbook_id` | uuid | — | |
| `contains` | string ≤200 | — | Substring of title or detail |
| `created_from` | ISO date | — | |
| `include_evidence` | boolean | `false` | Attach the evidence block |
| `limit` | integer | 40 | max 200 |
| `offset` | integer | 0 | |

#### `get_data_quality_overview`
Grade distribution plus per-report score, coverage, gap count and point count, worst first.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `workflow` | enum | — | |
| `grade` | enum | — | `good`, `acceptable`, `degraded`, `unreliable`, `unusable` |
| `workbook_id` | uuid | — | |
| `limit` | integer | 50 | max 200 |

### Cross-report analysis

#### `list_kpis`
Every distinct KPI name, how often it has been processed, its workflows, first/last seen,
average-of-averages and highest peak.

| Parameter | Type | Default | Max |
| --- | --- | --- | --- |
| `workflow` | enum | — | |
| `name_contains` | string ≤200 | — | |
| `workbook_id` | uuid | — | |
| `limit` | integer | 100 | 300 |

#### `get_kpi_history`
One KPI across every report that produced it: metrics, trend direction and slope, quality
grade, capacity utilisation and headroom, covered time span.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `kpi_name` | string ≤200, required | — | Substring by default |
| `exact` | boolean | `false` | Require an exact (case-insensitive) match |
| `workflow` | enum | — | |
| `created_from` | ISO date | — | |
| `limit` | integer | 25 | max 100 |

#### `compare_reports`
Line up 2–10 reports side by side, with the union of metric keys so differences are obvious.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `report_ids` | array of uuid, required | — | 2–10 ids; output preserves your ordering |
| `include_findings` | boolean | `true` | Top findings per report |
| `max_findings_each` | integer | 5 | max 20 |

#### `get_workflow_rollup`
Grouped counts and averages without pulling individual reports.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `group_by` | enum, required | — | `workflow`, `status`, `day`, `week`, `month`, `quality_grade`, `trend_direction` |
| `workflow` | enum | — | |
| `kpi_name` | string ≤200 | — | Substring |
| `created_from` / `created_to` | ISO date | — | |
| `only_completed` | boolean | `true` | |
| `limit` | integer | 50 | max 200 |

Averages mix units across workflows (% vs Gbps vs users); filter by `workflow` or
`kpi_name` for a comparable number. The response says so when unfiltered.

### Workbooks

#### `list_workbooks`
Multi-sheet CMM workbook uploads with sheet/KPI counts and child-report state.

| Parameter | Type | Default | Max |
| --- | --- | --- | --- |
| `status` | enum | — | |
| `filename_contains` | string ≤200 | — | |
| `user_email` | string ≤255 | — | |
| `limit` | integer | 20 | 100 |
| `offset` | integer | 0 | |

#### `get_workbook`
One workbook with its per-KPI child reports and, optionally, the sheet-detection preview.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `workbook_id` | uuid, required | — | |
| `kpi_status` | enum | — | Only children in this state |
| `kpi_limit` | integer | 60 | max 200 |
| `include_preview` | boolean | `false` | Per-sheet detection preview (large) |
| `preview_limit` | integer | 40 | max 200 sheets |

### Charts

#### `list_charts`
Chart inventory across reports. Type, title, stored image size, source report — never the
image bytes.

| Parameter | Type | Default | Max |
| --- | --- | --- | --- |
| `report_id` | uuid | — | |
| `workbook_id` | uuid | — | |
| `chart_type` | string ≤50 | — | e.g. `line`, `area`, `pie` |
| `title_contains` | string ≤200 | — | |
| `limit` | integer | 50 | 200 |
| `offset` | integer | 0 | |

#### `get_chart_config`
The Chart.js definition behind one chart: type, dataset shape, axis labels, options.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `chart_id` | uuid, required | — | |
| `include_data` | boolean | `false` | Include values and labels, not just shape |
| `max_series_points` | integer | 100 | max 2000, per dataset |

---

## Example prompts

- "Which KPIs are breaching their threshold right now?" → `search_findings` with
  `category: "capacity"`, `min_severity: "major"`.
- "Show me the worst data quality in the last workbook." → `list_workbooks` →
  `get_data_quality_overview` with that `workbook_id`.
- "What happened to PDPActFR_3G_Final in March?" → `get_kpi_history` →
  `get_report_intelligence` → `get_report_timeseries`.
- "Compare 2G and 3G PDP activation failure rates." → `list_kpis` → `compare_reports`.
- "How much chart storage are we using?" → `get_platform_stats`.

## File layout

```
src/mcp-http/
  index.js            hosted Streamable HTTP handler (stateless, per-user scope)

src/mcp/
  index.js            stdio entry point (npm run mcp)
  server.js           McpServer assembly + get_server_info (shared by both transports)
  db.js               read-only pool, statement guard, read-only transactions, scopes
  format.js           compact JSON results, truncation, not-found handling
  validate.js         shared zod input schemas and bounds
  tools/
    workflows.js      list_workflows, get_workflow
    reports.js        list_reports, get_report, get_report_metrics
    intelligence.js   get_report_intelligence, search_findings, get_data_quality_overview
    timeseries.js     get_report_timeseries
    charts.js         list_charts, get_chart_config
    workbooks.js      list_workbooks, get_workbook
    analysis.js       list_kpis, get_kpi_history, compare_reports, get_workflow_rollup
    platform.js       get_platform_stats, list_users, describe_schema
```

## Troubleshooting

- **Client shows no tools.** Check the client's MCP log for the `[core-insight-mcp]`
  stderr lines. A missing `DATABASE_URL` exits immediately with a message.
- **`self signed certificate in certificate chain`.** Append `?sslmode=require` to
  `DATABASE_URL`; the pool then relaxes chain verification the same way the API does.
- **Queries time out.** Raise `MCP_STATEMENT_TIMEOUT_MS`, or narrow the request (smaller
  `limit`, fewer `sections`).
- **"read-only guard: …" in a response.** A statement was rejected before reaching the
  database. That is the guard doing its job; it never indicates a partially applied change.
- **"scope guard: …" in a response.** A statement was refused because it did not declare
  which column ties its rows to an account, or because an account-neutral read touched an
  account-owned table. Both are bugs in a tool, not in the request — but they fail closed,
  so no data crosses accounts while one is being fixed.
- **`401` from the hosted endpoint.** The bearer token was missing, expired, or did not
  carry a platform user id. The endpoint will not fall back to reading everything.
