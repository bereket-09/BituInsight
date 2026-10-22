const { createSuccessRatioWorkflow } = require('../success-ratio-engine');

/**
 * Basic CS KPIs SR — the circuit-core success ratios.
 *
 * Four KPIs per MSS, and two quirks the engine has to survive: CSSR reports off
 * the quarter hour and at a different minute on each MSS (:01, :03, :11, :13),
 * and MDC2NMSS02 is short one period in every KPI. Readings are floored onto
 * the KPI's own cadence grid so an offset lands in the right bucket, and a
 * missing reading is left out of the average rather than counted as zero.
 */
module.exports = createSuccessRatioWorkflow({
  slug: 'cs-kpis-sr',
  name: 'CS KPIs — Success Ratios',
  description:
    'Every circuit-core success-ratio KPI in the Basic CS KPIs SR export, each calculated on its own: hourly and daily averages per MSS, per data centre and combined. Success ratios are averaged into a bucket, never added.',
  domainLabel: 'CS Success Ratios',
  kpiGroupLabel: 'CS success-ratio KPIs',
  sheetHint: 'Data for <CS KPI>',
  coverSheet: /^basic\s+cs\s+kpis\s+sr$/i,
  teamsIcon: '📞',
  metadata: {
    category: 'Success ratio',
    technology: ['MSS', 'VLR', 'CS core', '2G', '3G'],
    icon: 'phone-call',
    unit: '%',
  },
});
