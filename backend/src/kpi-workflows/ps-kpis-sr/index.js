const { createSuccessRatioWorkflow } = require('../success-ratio-engine');

/**
 * Basic PS KPIs SR — the packet-core success ratios.
 *
 * 22 KPIs in one workbook, and not all of them are reported per CMM: three Sy_*
 * ratios are per SPS (and at a 5-minute cadence rather than 15), two Gy/Gx
 * ratios are per CMG, and Auth_Succ_Rate is per HSS behind a second label
 * column. The engine reads the entity from each sheet's own header rather than
 * assuming one node type, so all 22 land in the same report.
 */
module.exports = createSuccessRatioWorkflow({
  slug: 'ps-kpis-sr',
  name: 'PS KPIs — Success Ratios',
  description:
    'Every packet-core success-ratio KPI in the Basic PS KPIs SR export, each calculated on its own: hourly and daily averages per node (CMM, SPS, CMG, HSS), per data centre and combined. Success ratios are averaged into a bucket, never added.',
  domainLabel: 'PS Success Ratios',
  kpiGroupLabel: 'PS success-ratio KPIs',
  sheetHint: 'Data for <PS KPI>',
  coverSheet: /^basic\s+ps\s+kpis\s+sr$/i,
  teamsIcon: '🛰️',
  metadata: {
    category: 'Success ratio',
    technology: ['CMM', 'SPS', 'CMG', 'HSS', 'PS core'],
    icon: 'activity',
    unit: '%',
  },
});
