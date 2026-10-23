/**
 * Multi-KPI Correlation & Root-Cause Analysis (RCA) Engine
 *
 * Connects statistical anomalies across distinct sheets/KPIs in a CMM workbook
 * to isolate network-wide incidents from local noise, identify probable root causes,
 * and project fleet-wide capacity saturation countdowns.
 */

function parseJson(val) {
  if (!val) return {};
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
  return val;
}

/**
 * Classifies probable root cause based on multi-KPI anomaly patterns.
 */
function classifyIncident(events) {
  const kpiNames = events.map((e) => (e.kpiName || '').toLowerCase());
  const types = events.map((e) => e.type);

  const hasUsers = kpiNames.some((n) => n.includes('user') || n.includes('saau') || n.includes('attach'));
  const hasThroughput = kpiNames.some((n) => n.includes('throughput') || n.includes('traffic') || n.includes('volume') || n.includes('cmg'));
  const hasSuccess = kpiNames.some((n) => n.includes('success') || n.includes('ratio') || n.includes('rate'));

  const allDips = types.every((t) => t === 'dip' || t === 'flatline');
  const allSpikes = types.every((t) => t === 'spike');

  // 1. Telemetry / Probe Collection Gap: all flatlines or zero-readings simultaneously
  if (types.some((t) => t === 'flatline') || (allDips && events.length >= 3)) {
    return {
      title: 'Telemetry Collection / Probe Outage',
      category: 'telemetry_gap',
      severity: 'minor',
      confidence: 88,
      explanation:
        'Simultaneous telemetry dips/flatlines across multiple disparate KPI sheets indicate an EMS/probe collection drop or export timing issue rather than a physical radio/core outage.',
      recommendation:
        'Check Element Management System (EMS) probe cron timers, SFTP transfer buffers, and mediation server status.',
    };
  }

  // 2. Radio Access Network (RAN) Outage / Paging Failure
  if (hasUsers && (allDips || hasSuccess)) {
    return {
      title: 'RAN Access / Paging Degradation',
      category: 'ran_outage',
      severity: 'major',
      confidence: 92,
      explanation:
        'Correlated drop in user attachments and active sessions points to a base station (eNodeB/gNodeB) cluster outage or S1-MME signaling link congestion.',
      recommendation:
        'Inspect regional eNodeB/gNodeB cluster availability, tracking area identity (TAI) paging success, and radio backhaul transport links.',
    };
  }

  // 3. Core Gateway User-Plane Congestion / Failover
  if (hasThroughput && (types.includes('spike') || types.includes('shift'))) {
    return {
      title: 'Core Gateway (CMG/UPF) User-Plane Shift',
      category: 'core_congestion',
      severity: 'critical',
      confidence: 89,
      explanation:
        'Sharp throughput shift or saturation spike indicates sudden user-plane rerouting, peer gateway failover, or streaming event concentration.',
      recommendation:
        'Verify bearer management logs on primary CMG/UPF nodes, inspect inter-gateway load balancing, and check interface queue buffer drops.',
    };
  }

  // 4. Signaling Storm / Traffic Surge
  if (allSpikes && (hasUsers || hasThroughput)) {
    return {
      title: 'Traffic Surge / Flash Crowd Event',
      category: 'flash_crowd',
      severity: 'major',
      confidence: 85,
      explanation:
        'Simultaneous surge across active users and payload volume exceeding 3× seasonal MAD baseline indicates an localized event surge or mass terminal re-attachment.',
      recommendation:
        'Ensure dynamic bearer throttling is active and review APN capacity allocations for high-density sectors.',
    };
  }

  // Default Correlated Anomaly
  return {
    title: 'Multi-KPI Correlated Performance Fluctuation',
    category: 'correlated_general',
    severity: events.length > 2 ? 'major' : 'minor',
    confidence: 78,
    explanation:
      'Simultaneous metric deviations occurred across multiple operational layers within the same reporting window.',
    recommendation:
      'Cross-reference NOC maintenance logs and transmission backhaul metrics during the identified window.',
  };
}

/**
 * Correlates child KPI reports within a CMM workbook.
 */
function correlateWorkbookKpis(reports = []) {
  if (!Array.isArray(reports) || reports.length < 2) {
    return {
      hasCorrelations: false,
      incidents: [],
      capacityRadar: null,
      summaryNarrative: 'Insufficient KPI sheets to execute cross-correlation analysis.',
    };
  }

  const allAnomalies = [];
  const capacityItems = [];

  for (const rep of reports) {
    const summary = parseJson(rep.summary);
    const intel = summary.intelligence || {};
    const kpiName = rep.kpi_name || rep.sheet_name || 'KPI';

    // 1. Gather anomalies
    const repAnomalies = intel.findings?.filter((f) => f.severity === 'critical' || f.severity === 'major') || [];
    const directAnomalies = summary.anomalies || [];

    for (const anom of directAnomalies) {
      allAnomalies.push({
        kpiName,
        sheetName: rep.sheet_name,
        timestamp: anom.timestamp || anom.date,
        dateLabel: anom.label || anom.date || 'Unknown timestamp',
        type: anom.type || (anom.deviationPct > 0 ? 'spike' : 'dip'),
        deviationPct: anom.deviationPct || 0,
        detail: anom.message || `${anom.type || 'Deviation'} detected`,
      });
    }

    for (const finding of repAnomalies) {
      if (finding.timestamp || finding.date) {
        allAnomalies.push({
          kpiName,
          sheetName: rep.sheet_name,
          timestamp: finding.timestamp || finding.date,
          dateLabel: finding.label || finding.date || 'Event period',
          type: finding.direction === 'falling' ? 'dip' : 'spike',
          deviationPct: finding.changePct || 0,
          detail: finding.title || finding.detail,
        });
      }
    }

    // 2. Capacity & Saturation metrics
    const cap = intel.capacity;
    const trend = intel.trend;
    const threshold = rep.threshold || summary.threshold || cap?.threshold;

    if (cap && threshold) {
      const peak = Number(cap.planningPeak || cap.peak || 0);
      const threshNum = Number(threshold);
      const utilPct = threshNum > 0 ? Math.round((peak / threshNum) * 100) : 0;
      const slopePct = trend?.slopePerDayPct ? Number(trend.slopePerDayPct) : 0;

      let daysToSaturation = null;
      if (utilPct < 100 && slopePct > 0.05) {
        const remainingPct = 100 - utilPct;
        daysToSaturation = Math.max(1, Math.round(remainingPct / slopePct));
      } else if (utilPct >= 100) {
        daysToSaturation = 0;
      }

      capacityItems.push({
        kpiName,
        sheetName: rep.sheet_name,
        utilizationPct: utilPct,
        peak,
        threshold: threshNum,
        unit: intel.unit || '',
        trendDirection: trend?.direction || 'flat',
        daysToSaturation,
        risk:
          utilPct >= 95 || (daysToSaturation !== null && daysToSaturation <= 14)
            ? 'critical'
            : utilPct >= 80 || (daysToSaturation !== null && daysToSaturation <= 45)
              ? 'warning'
              : 'healthy',
      });
    }
  }

  // Time-bucket clustering for correlated events (group within same date or label)
  const groupedByTime = new Map();
  for (const anom of allAnomalies) {
    const key = anom.dateLabel || String(anom.timestamp);
    if (!groupedByTime.has(key)) {
      groupedByTime.set(key, []);
    }
    groupedByTime.get(key).push(anom);
  }

  const incidents = [];
  for (const [timeKey, events] of groupedByTime.entries()) {
    // A correlated incident involves multiple distinct KPIs
    const uniqueKpis = new Set(events.map((e) => e.kpiName));
    if (uniqueKpis.size >= 2) {
      const classification = classifyIncident(events);
      incidents.push({
        id: `inc-${timeKey.replace(/\s+/g, '-').toLowerCase()}`,
        timeKey,
        affectedKpis: Array.from(uniqueKpis),
        eventCount: events.length,
        ...classification,
        events,
      });
    }
  }

  // Sort incidents by severity and event count
  incidents.sort((a, b) => (b.severity === 'critical' ? 2 : 1) - (a.severity === 'critical' ? 2 : 1) || b.eventCount - a.eventCount);

  // Compute Capacity Saturation Radar
  let capacityRadar = null;
  if (capacityItems.length > 0) {
    const withSaturation = capacityItems.filter((c) => c.daysToSaturation !== null);
    withSaturation.sort((a, b) => a.daysToSaturation - b.daysToSaturation);

    const limiting = withSaturation[0] || capacityItems.sort((a, b) => b.utilizationPct - a.utilizationPct)[0];

    const overallRisk = capacityItems.some((c) => c.risk === 'critical')
      ? 'critical'
      : capacityItems.some((c) => c.risk === 'warning')
        ? 'warning'
        : 'healthy';

    capacityRadar = {
      limitingKpi: limiting.kpiName,
      limitingUtilization: limiting.utilizationPct,
      earliestExhaustionDays: limiting.daysToSaturation,
      overallRisk,
      items: capacityItems,
    };
  }

  return {
    hasCorrelations: incidents.length > 0,
    incidents,
    capacityRadar,
    correlatedCount: incidents.length,
    analyzedKpiCount: reports.length,
  };
}

module.exports = {
  correlateWorkbookKpis,
  classifyIncident,
};
