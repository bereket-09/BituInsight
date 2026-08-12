# BituInsight — Telecom KPI Analytics Platform

Production-grade telecom KPI workflow engine for Excel report ingestion, KPI-specific transformations, graph generation, reporting, and Microsoft Teams integration.

![Stack](https://img.shields.io/badge/React-18-61DAFB) ![Node](https://img.shields.io/badge/Node.js-20-339933) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)

> **New to this project? Read [SETUP.md](SETUP.md)** — a step-by-step install guide
> written for non-technical users.

## Features

- **Pluggable KPI workflows** — Developer-implemented modules under `backend/src/kpi-workflows/`
- **Excel ingestion & validation** — Structure, columns, and data type checks with detailed errors
- **Analytics intelligence layer** — Seasonality-aware anomaly detection, trend fitting,
  forecasting, capacity headroom, and data-quality scoring (see below)
- **Executive narratives** — Optional Claude-authored summary per report, with a
  deterministic fallback so a report always carries a written summary
- **Chart generation** — Server-side Chart.js PNG rendering via `@napi-rs/canvas`
  (no system graphics libraries required); images stored in Postgres so they survive
  on hosts without a persistent disk
- **Historical reports** — Full processing history with re-download and Teams re-send
- **Microsoft Teams** — Incoming Webhook delivery with formatted MessageCards
- **Operations dashboard** — NOC-style dark UI

## Analytics Intelligence Layer

Lives in `backend/src/analytics/` and runs for every workflow via `processReport`.

| Module | Responsibility |
|---|---|
| `stats.js` | Median, MAD, quantiles, robust z-score, OLS regression |
| `seasonality.js` | Cadence detection; hour-of-day / day-of-week baselines |
| `anomalies.js` | Spikes **and** dips vs. seasonal baseline; level shifts; flatlines |
| `trend.js` | Trend fit with r² confidence; forecast with 95% prediction band |
| `capacity.js` | Busy-period peak, headroom, days-to-saturation |
| `quality.js` | Collection gaps, duplicates, coverage %, quality score |
| `insights.js` | Ranked findings with evidence; deterministic narrative |

Design choices worth knowing:

- Anomalies are scored against a **seasonal baseline**, so an evening busy hour is
  compared with other evenings rather than with 03:00.
- A point must clear **both** a statistical bar (robust z) and a **materiality** bar
  (relative deviation), so a tight bucket doesn't turn a 9% wobble into an incident.
- Level shifts are detected on **seasonally adjusted residuals** — otherwise every
  morning ramp reads as a permanent step change.
- Trends with r² < 0.3 are reported as flat and **no forecast is produced**, rather
  than drawing a confident line through noise.
- Finding nothing is a valid result: a clean period reports clean.

## Quick Start

```bash
# Start all services (images pulled from AWS ECR Public, not Docker Hub)
docker compose up --build
```

### Docker Hub timeout (`auth.docker.io` / `i/o timeout`)

Images use **`public.ecr.aws/docker/library/...`** mirrors instead of Docker Hub. If pulls still fail:

1. **Retry** after checking network/VPN, or set Docker Desktop → Settings → DNS to `8.8.8.8`.
2. **Local mode** (Postgres in Docker, API + UI on your machine):

```bash
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:3000      |
| API       | http://localhost:4000/api  |
| PostgreSQL| localhost:5432             |

**Default login:** `admin@bituinsight.local` / `admin123`

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  React UI   │────▶│  Express API │────▶│  PostgreSQL    │
└─────────────┘     └──────┬───────┘     └────────────────┘
                           │
                    ┌──────▼───────┐
                    │ KPI Workflow │
                    │    Engine    │
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      Validation     Transformation    Charts (PNG)
           │               │               │
           └───────────────┴───────────────┘
                           │
                    ┌──────▼───────┐
                    │ MS Teams     │
                    │ Webhook      │
                    └──────────────┘
```

### KPI Workflow Module Structure

Each workflow lives in `backend/src/kpi-workflows/<slug>/`:

| File            | Responsibility                          |
|-----------------|-----------------------------------------|
| `index.js`      | Module exports & metadata               |
| `validator.js`  | Column mapping & data validation        |
| `transformer.js`| Data cleaning & normalization           |
| `calculator.js` | KPI metrics & anomaly detection         |
| `charts.js`     | Chart configuration definitions         |
| `formatter.js`  | Microsoft Teams message formatting      |

Register new workflows in `backend/src/kpi-workflows/registry.js`.

## Implemented Workflows

| Slug             | Name               | Status     |
|------------------|--------------------|------------|
| `traffic-volume` | Traffic Volume KPI | ✅ Complete |
| `cmg-data-throughput` | CMG Data Throughput (MDC1/MDC2) | ✅ Complete |

### Traffic Volume KPI

**Required columns:** Date, PLMN Name, 2G+3G data volume, 4G data volume, Total data volume

**Calculations:** Daily total, peak/min hour, 4G & 2G/3G contribution %, hourly trends, anomaly detection

**Charts:** Hourly trend (line), technology split (pie), daily trend (area)

### CMG Data Throughput

**Required columns:** Period start time, CMG name, DL max Mbps, UL max Mbps

**Calculations:** Per row `(DL + UL) / 1000` Gbps; aggregate sums per period for **MDC1** and **MDC2** (parsed from CMG name, e.g. `…@MDC1-NK-CMG-CP01` → `MDC1`)

**Charts:** MDC1 vs MDC2 lines, stacked throughput, node share pie, combined trend

## API Endpoints

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| POST   | `/api/auth/login`                             | Authenticate             |
| GET    | `/api/auth/me`                                | Current user             |
| GET    | `/api/workflows`                              | List KPI workflows       |
| GET    | `/api/workflows/:slug`                        | Workflow details         |
| GET    | `/api/dashboard`                              | Dashboard statistics     |
| GET    | `/api/reports`                                | List historical reports  |
| GET    | `/api/reports/:id`                            | Report details           |
| POST   | `/api/reports/upload`                         | Upload & process         |
| POST   | `/api/reports/validate`                       | Validate only            |
| POST   | `/api/reports/:id/teams`                      | Send to Teams            |
| GET    | `/api/reports/:id/download`                   | Download report JSON     |
| GET    | `/api/reports/:id/charts/:chartId/download`   | Download chart PNG       |

## Sample Data

Generate a sample Traffic Volume Excel file:

```bash
cd backend && npm install && node scripts/generate-sample-excel.js
```

Output: `samples/traffic-volume-sample.xlsx`

## Configuration

Copy `.env.example` to `.env` and customize:

```env
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/your-webhook-url
JWT_SECRET=your-production-secret
```

## Local Development

```bash
# Start PostgreSQL
docker-compose up postgres -d

# Backend
cd backend
npm install
cp ../.env.example .env
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Adding a New KPI Workflow

1. Create `backend/src/kpi-workflows/my-workflow/` with validator, transformer, calculator, charts, formatter
2. Export module from `index.js` matching the traffic-volume pattern
3. Register in `backend/src/kpi-workflows/registry.js`
4. Restart backend — workflow auto-seeds to database

## Tech Stack

- **Frontend:** React 18, TailwindCSS, Recharts, React Query, React Router, Axios
- **Backend:** Node.js, Express, ExcelJS, Chart.js (node-canvas), Multer, JWT
- **Database:** PostgreSQL 16
- **Infra:** Docker, docker-compose, Nginx

## License

Proprietary — BituInsight Telecom KPI Platform
