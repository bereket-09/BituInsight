# Core Insight — Setup Guide

> **Already deployed:** <https://coreinsight.vercel.app> — sign in with
> `admin@coreinsight.local` / `admin123`. Follow this guide only if you want to run
> your own copy. **Change that password before real data goes in** (see
> [Security](#security-important)).

A step-by-step guide to getting Core Insight running. **No prior experience assumed.**
If you can copy and paste, you can complete this.

Pick one of the three paths below:

| Path | Best for | Time |
|------|----------|------|
| [A. Docker](#path-a--docker-easiest) | Just want it running on your machine | ~10 min |
| [B. Manual](#path-b--manual-install) | You want to edit the code | ~20 min |
| [C. Cloud](#path-c--deploy-to-the-internet) | Publish it so others can use it | ~15 min |

---

## Before you start

You need two free programs. Check whether you already have them — open a terminal
(**Mac:** press `Cmd + Space`, type `Terminal`, press Enter. **Windows:** press the
Start button, type `PowerShell`, press Enter) and paste this:

```bash
node --version && git --version
```

- If you see two version numbers (e.g. `v20.11.0` and `git version 2.39`), you're set.
- If you see "command not found", install the missing one:
  - **Node.js** — download the "LTS" version from <https://nodejs.org> and run the installer.
  - **Git** — download from <https://git-scm.com/downloads> and run the installer.

Then close and reopen your terminal, and run the check again.

### Get the code

```bash
git clone https://github.com/bereket-09/CoreInsight.git
cd CoreInsight
```

Every command in this guide assumes you are inside the `CoreInsight` folder.

---

## Path A — Docker (easiest)

Docker runs the whole system — database, backend, and website — with one command.

**1. Install Docker Desktop** from <https://www.docker.com/products/docker-desktop>.
Run the installer, then **open the Docker Desktop app** and wait until it says
"Docker Desktop is running".

**2. Create your settings file.** This copies the example settings into a real one:

```bash
cp .env.example .env
```

**3. Start everything:**

```bash
docker compose up --build
```

The first run takes 5–10 minutes (it downloads everything it needs). You'll know
it's ready when the text stops scrolling and you see lines mentioning
`core-insight-api` and `core-insight-web`.

**4. Open the app:** go to <http://localhost:3000> in your browser.

| | |
|---|---|
| Website | http://localhost:3000 |
| Email | `admin@coreinsight.local` |
| Password | `admin123` |

**To stop it:** press `Ctrl + C` in the terminal, then run `docker compose down`.

> **If the download fails** with a timeout or `auth.docker.io` error, your network is
> blocking Docker's servers. Use Path B instead, or run `./scripts/start-local.sh`
> which only uses Docker for the database.

---

## Path B — Manual install

Use this if Docker won't work or you want to edit the code.

### 1. Set up a database

You need a PostgreSQL database. The easiest free option is **Neon** — no installation:

1. Go to <https://neon.tech> and sign up (free).
2. Click **Create Project**. Any name works.
3. On the project page find **Connection string** and click copy. It looks like:
   `postgresql://user:password@ep-something.aws.neon.tech/neondb?sslmode=require`
4. Keep that text somewhere — you need it in the next step.

<details>
<summary>Prefer a local database instead? Click here</summary>

Install PostgreSQL from <https://www.postgresql.org/download/>, then your connection
string is `postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres`.
</details>

### 2. Create your settings file

```bash
cp .env.example .env
```

Now open the `.env` file in a text editor (Notepad, TextEdit, VS Code — anything).
Find the line starting with `DATABASE_URL` and replace it with your connection string:

```
DATABASE_URL=postgresql://paste-your-connection-string-here
```

Also change `JWT_SECRET` to any long random text — mash the keyboard if you like.
This is what keeps logins secure.

Save and close the file.

### 3. Install and prepare the backend

```bash
cd backend
npm install
```

This takes a few minutes. Warnings in yellow are normal; only red `ERR!` lines matter.

Now create the database tables and the first user:

```bash
npm run db:setup
```

You should see `Database ready` followed by `Database seed completed`. **This only
needs to be done once.**

Start the backend and **leave this terminal open**:

```bash
npm start
```

You should see `Core Insight API running on port 4000`.

### 4. Start the website

Open a **second** terminal window (`Cmd + T` on Mac, or a new PowerShell window),
go back to the project folder, and run:

```bash
cd CoreInsight/frontend
npm install
npm run dev
```

Open <http://localhost:3000> and log in with `admin@coreinsight.local` / `admin123`.

**To stop:** press `Ctrl + C` in both terminal windows.

---

## Path C — Deploy to the internet

This publishes the app at a public web address using Vercel (free tier is fine).

**1. Create a database** — follow [step 1 of Path B](#1-set-up-a-database) and copy
the connection string.

**2. Install the Vercel tool and sign in:**

```bash
npm install -g vercel
vercel login
```

**3. Link the project** (accept the defaults it offers):

```bash
vercel link
```

**4. Add your settings.** Run each line below; it will ask you to paste a value,
then ask which environments — choose **Production**.

```bash
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add UPLOAD_DIR production
vercel env add REPORTS_DIR production
vercel env add CHARTS_DIR production
```

Paste these values when prompted:

| Setting | Value to paste |
|---|---|
| `DATABASE_URL` | your database connection string |
| `JWT_SECRET` | any long random text |
| `UPLOAD_DIR` | `/tmp/uploads` |
| `REPORTS_DIR` | `/tmp/reports` |
| `CHARTS_DIR` | `/tmp/charts` |

> Do **not** set `DISABLE_CHART_RENDERING` — charts render fine on cloud hosts, and
> setting it would switch them off.

**5. Prepare the database** (run once, from the project folder):

```bash
cd backend
DATABASE_URL="your-connection-string-here" npm run db:setup
cd ..
```

**6. Publish:**

```bash
vercel deploy --prod
```

It prints a web address when it finishes. That's your live app.

> **New deployments are private by default.** Anyone opening the link is asked to
> log into Vercel first. To make it publicly reachable:
> ```bash
> vercel project protection disable YOUR-PROJECT-NAME --sso
> ```
> **Change the admin password before you do this** — see [Security](#security-important).

---

## Using the app

1. Log in.
2. Click **Upload** in the left sidebar.
3. Choose the KPI type that matches your file, then pick your Excel file.
   Test files are in the `samples/` folder of the project.
4. Check the preview, then click **Upload & Process**.
5. When it finishes you land on the report, which shows:
   - an **Executive summary** in plain English,
   - a **Findings** list (spikes, dips, trends, data-quality problems),
   - charts you can explore and export.

### Supported files

Files must come out of **NetAct** in their original format — don't rearrange the
columns or delete header rows first.

| KPI type | Sheet to pick | Notes |
|---|---|---|
| CMG Data Throughput | `Data for … (…)` | Header row 1, data starts row 3 |
| Traffic Volume | any | Needs Date, PLMN Name, and the volume columns |
| CMM Workbook | — | Use **Workbook** mode for multi-sheet exports |

---

## Security (important)

The system ships with a well-known default password. **Before anyone outside your
team can reach the app**, change it:

1. Log in as `admin@coreinsight.local`.
2. Open a terminal in the project and run:

```bash
cd backend
node -e "
const bcrypt = require('bcryptjs');
const pool = require('./src/db/pool');
const newPassword = 'CHANGE-THIS-TO-YOUR-PASSWORD';
bcrypt.hash(newPassword, 10)
  .then(h => pool.query('UPDATE users SET password_hash=\$1 WHERE email=\$2', [h, 'admin@coreinsight.local']))
  .then(() => { console.log('Password updated'); return pool.end(); });
"
```

Replace `CHANGE-THIS-TO-YOUR-PASSWORD` with your own password first.

Also: never commit your `.env` file or paste a database connection string into
chat, email, or a shared document. If one leaks, rotate it in your database
provider's dashboard.

---

## Optional: turn on AI-written summaries

Every report always gets a written summary calculated from the numbers. If you add
an Anthropic API key, that summary is instead written by Claude — more readable,
with suggested next steps.

1. Get a key at <https://console.anthropic.com>.
2. Add it:
   - **Local:** add `ANTHROPIC_API_KEY=sk-ant-...` to your `.env` file.
   - **Cloud:** run `vercel env add ANTHROPIC_API_KEY production`, then redeploy.

Without a key nothing breaks — you just get the calculated summary instead.

---

## When something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `command not found: node` | Node.js isn't installed | Install it, then reopen your terminal |
| `ECONNREFUSED` on startup | The database can't be reached | Check `DATABASE_URL` in `.env`; if using Docker, is Docker Desktop running? |
| `password authentication failed` | Wrong database password | Re-copy the connection string from your provider |
| `relation "users" does not exist` | Database tables were never created | Run `npm run db:setup` in the `backend` folder |
| `port 3000 is already in use` | Something else is using that port | Close the other program, or run `npm run dev -- --port 3001` |
| Login says "Invalid credentials" | Seed never ran, or password changed | Run `npm run db:setup` in `backend` |
| Blank page after login | Backend isn't running | Check the backend terminal for red errors |
| Charts render but have no text | The font files didn't ship | Confirm `backend/assets/fonts/*.ttf` exist; on a cloud host they must be in `includeFiles` in `vercel.json` |
| Reports have no chart images at all | Rendering is switched off | Make sure `DISABLE_CHART_RENDERING` is **not** set to `true` |
| Upload rejected on the cloud, works locally | File is over the host's request limit | Vercel caps uploads at about 4.5 MB; use a Docker install for larger exports |

**Where chart images live:** charts are rendered on the server and the PNG bytes
are stored in the database, so they survive on hosts with no permanent disk. Each
report holds roughly 260 KB. Re-processing a report replaces its old images rather
than piling up new ones, and images older than `CHART_RETENTION_DAYS` (default 90)
are cleared automatically while the report itself is kept.

Still stuck? Open an issue at
<https://github.com/bereket-09/CoreInsight/issues> and paste the red error text.
