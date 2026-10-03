# Automatic imports from Outlook with Power Automate

NetAct emails its scheduled exports to a mailbox. A Power Automate flow on that
mailbox sends each Excel attachment to Core Insight, which works out which KPI it
is and processes it exactly like a manual upload. Reports appear in **Historical
reports** (or as a workbook), and every file is listed under **Automatic imports**.

```
NetAct ──scheduled email──▶ Outlook inbox ──Power Automate (HTTP)──▶ POST /api/ingest/files
                                                                       ├─ detects the workflow
                                                                       ├─ processes the report
                                                                       └─ optional Teams message
```

## What the portal detects

| File | Processed as |
|---|---|
| Peak Attach Users export (`Data for PEAK_ATTACH_…` sheets) | Peak Attached Users report |
| CMG throughput audit (`…CMG…throughput…` / `Data for ulPackets` sheets) | CMG Data Throughput report |
| CMM workbook with valid PLMN-level KPI sheets | CMM workbook (one report per valid sheet) |
| Anything else | Rejected with a reason (HTTP 422), listed in the import log |

To force a workflow, add `"workflow": "<slug>"` to the request, e.g. `traffic-volume`
or `cmm-workbook`.

The same file sent twice (a re-sent email, a flow retry) is recognised and **not**
processed again; the response points at the first report.

## Step 1 — Create an import key in the portal

1. Open **Reporting → Automatic imports**.
2. Under **Import keys**, name the key (e.g. `Power Automate – NetAct mail`) and
   click **Create key**.
3. Copy the key (`cik_…`). It is shown **once**. If it is lost, revoke it and
   create another.

The key can only send files into *your* reports. It cannot sign in or read data.

## Step 2 — Check that the HTTP action is available

The **HTTP** action in Power Automate is a **Premium** connector.

1. Go to <https://make.powerautomate.com> and choose **Create → Automated cloud flow**.
2. Add any action and search for **HTTP**.
3. If it shows a **Premium** badge and your licence does not include Premium, the
   flow will not save or run with it. Get a Power Automate Premium licence for the
   account that owns the flow, or ask about the SharePoint-folder alternative.

## Step 3 — Test the connection (optional, recommended)

Create an **Instant cloud flow** (manual trigger) with one **HTTP** action:

| Field | Value |
|---|---|
| Method | `GET` |
| URI | `https://bituinsight.vercel.app/api/ingest/ping` |
| Headers | `Authorization` : `Bearer cik_…your key…` |

Run it. A `200` response with `"ok": true` means the key and address are right.

## Step 4 — Build the flow

**Create → Automated cloud flow**, name it `NetAct exports → Core Insight`.

### Trigger: Office 365 Outlook — *When a new email arrives (V3)*

| Setting | Value |
|---|---|
| Folder | `Inbox` (or a folder a rule moves NetAct mail into) |
| From | NetAct's sender address |
| Include Attachments | **Yes** |
| Only with Attachments | **Yes** |
| Subject Filter | optional, e.g. a word that appears in every NetAct report subject |

### Action: *Apply to each*

Select output from previous steps: **Attachments** (from the trigger).

Inside the loop:

**Condition** — only Excel files:

```
endsWith(toLower(items('Apply_to_each')?['name']), '.xlsx')
```

(Add an **Or** row with `.xls` if NetAct ever sends the old format.)

**If yes → HTTP**

| Field | Value |
|---|---|
| Method | `POST` |
| URI | `https://bituinsight.vercel.app/api/ingest/files` |
| Headers | `Content-Type` : `application/json` |
| | `Authorization` : `Bearer cik_…your key…` |

Body:

```json
{
  "fileName": "@{items('Apply_to_each')?['name']}",
  "contentBytes": "@{items('Apply_to_each')?['contentBytes']}",
  "source": {
    "from": "@{triggerOutputs()?['body/from']}",
    "subject": "@{triggerOutputs()?['body/subject']}",
    "receivedAt": "@{triggerOutputs()?['body/receivedDateTime']}",
    "messageId": "@{triggerOutputs()?['body/id']}",
    "via": "power-automate"
  },
  "notifyTeams": true
}
```

If your loop has a different name (e.g. `For_each`), use that name inside `items('…')`.

### HTTP action settings (… → Settings)

* **Secure inputs: On.** Hides the key from the flow's run history.
* **Retry policy:** leave the default. Retries are safe, because duplicates are
  detected.

### Optional: tell yourself when a file is rejected

After the HTTP action, add a **Condition** on `outputs('HTTP')?['statusCode']` is not
equal to `200`. Set it to run when the HTTP action **has failed** (… → *Configure run
after*). In the **If yes** branch, send yourself an email or Teams message containing
`body('HTTP')?['error']`.

## Step 5 — Try it

Forward one NetAct email to the mailbox, or wait for the next scheduled one. Then:

1. Check the flow's **Run history**. The HTTP step should show `200` and
   `"status": "processed"`.
2. Open **Automatic imports** in the portal. The file is listed with what it was
   detected as and a link to its report.

## API reference

### `POST /api/ingest/files`

Headers: `Authorization: Bearer cik_…` (or `X-API-Key: cik_…`), `Content-Type: application/json`.

| Field | Required | Meaning |
|---|---|---|
| `fileName` | yes | Original file name; must end in `.xlsx` or `.xls` |
| `contentBytes` / `contentBase64` | yes | The file, base64 encoded (Outlook's `contentBytes` as-is) |
| `source` | no | `{ from, subject, receivedAt, messageId, via }`, shown in the import log |
| `workflow` | no | Skip detection: a workflow slug, or `cmm-workbook` |
| `notifyTeams` | no | `true` posts the finished report to the Teams webhook configured on the server |
| `defaultThreshold`, `kpiThresholds` | no | CMM workbook thresholds, as on the upload page |

Responses:

| Status | Body `status` | Meaning |
|---|---|---|
| 200 | `processed` | Done. `reportId` or `workbookId` points at the result |
| 200 | `failed` | Recognised, but processing failed. See `message` and the report |
| 200 | `duplicate` | Same file already imported. Returns the earlier `reportId` / `workbookId` |
| 400 / 413 / 415 | `error` | Missing fields, file too large, or not an Excel file |
| 401 | — | Missing, wrong or revoked key |
| 422 | `rejected` | Not a file the portal recognises. `error` says why |

### `GET /api/ingest/ping`

Same key header. Returns `{ "ok": true }` when the key is valid.

## Limits and notes

* **Size:** about **3 MB per attachment**. The host accepts 4.5 MB per request, and
  base64 adds about a third. NetAct exports are usually far smaller.
* **Time:** each file is processed while the request waits, normally a few seconds.
* **Teams:** `notifyTeams` uses the `TEAMS_WEBHOOK_URL` set on the server. A request
  cannot send to any other address.
* **Setup on the server:** none. The import tables are created on first use. (They
  are also part of `npm run seed` as migration `006-ingest.sql`.)
* **Revoking:** revoking a key on the Automatic imports page stops the flow at once.
  Create a new key and update the flow's HTTP header.
