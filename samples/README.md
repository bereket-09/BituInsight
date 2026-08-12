# Sample KPI Data Files

## traffic-volume-sample.xlsx

Sample Traffic Volume KPI report with 24 hourly records for **BituTel-PLMN-001** on 2026-05-22.

**Columns:**
- Date
- PLMN Name
- 2G+3G data volume
- 4G data volume
- Total data volume

**Usage:**
1. Log in to BituInsight at http://localhost:3000
2. Go to **Upload KPI Report**
3. Select workflow: **Traffic Volume KPI**
4. Upload `traffic-volume-sample.xlsx`
5. Click **Upload & Process**

Regenerate with:
```bash
cd backend && npm install && node scripts/generate-sample-excel.js
# Or use Python: see README.md in project root
```

## cmg-data-throughput-sample.xlsx

CMG CP audit export (`Data for ulPackets` sheet) with **Period start time**, **CMG name**, **DL/UL max Mbps** columns.

**Calculation:**
1. Per row: `(DL max Mbps + UL max Mbps) ÷ 1000` → Gbps
2. Detect node from CMG name: **MDC1** or **MDC2** (not the full hostname)
3. Sum all row values per period × node (e.g. all rows at `00:00` for MDC1 → one total)

**Usage:**
1. Upload → **Single KPI** mode
2. Workflow: **CMG Data Throughput**
3. Sheet: `Data for ulPackets (ulPackets)` (auto-suggested)
4. Header row 1, data from row 3 (row 2 = field codes `DLMAXMBPS` / `ULMAXMBPS`)
