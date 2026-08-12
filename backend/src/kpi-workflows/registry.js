const trafficVolume = require('./traffic-volume');
const telecomMetric = require('./telecom-metric');
const cmgDataThroughput = require('./cmg-data-throughput');

const WORKFLOW_REGISTRY = {
  [trafficVolume.slug]: trafficVolume,
  [telecomMetric.slug]: telecomMetric,
  [cmgDataThroughput.slug]: cmgDataThroughput,
};

function getWorkflow(slug) {
  const workflow = WORKFLOW_REGISTRY[slug];
  if (!workflow) {
    throw new Error(`KPI workflow not found: ${slug}`);
  }
  return workflow;
}

function getAllWorkflows() {
  return Object.values(WORKFLOW_REGISTRY).map((wf) => ({
    slug: wf.slug,
    name: wf.name,
    description: wf.description,
    version: wf.version,
    metadata: wf.metadata,
    requiredColumns: wf.requiredColumns,
    chartDefinitions: wf.chartDefinitions,
  }));
}

function listWorkflowSlugs() {
  return Object.keys(WORKFLOW_REGISTRY);
}

module.exports = {
  getWorkflow,
  getAllWorkflows,
  listWorkflowSlugs,
};
