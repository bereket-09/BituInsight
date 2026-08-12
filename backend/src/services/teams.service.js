const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

async function sendToTeams(webhookUrl, messageCard, chartPaths = []) {
  const url = webhookUrl || config.teamsWebhookUrl;
  if (!url) {
    throw new Error('Teams webhook URL is not configured');
  }

  const payload = { ...messageCard };

  if (chartPaths.length > 0) {
    payload.sections = payload.sections || [];
    const chartFacts = chartPaths.map((cp, i) => ({
      name: `Chart ${i + 1}`,
      value: path.basename(cp),
    }));
    payload.sections.push({
      title: 'Generated Charts',
      facts: chartFacts,
      text: `_${chartPaths.length} chart(s) generated. View full report in BituInsight portal._`,
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.error('Teams delivery failed', { status: response.status, body: responseText });
    throw new Error(`Teams webhook failed: ${response.status} ${responseText}`);
  }

  logger.info('Teams message sent successfully');
  return { success: true, responseBody: responseText };
}

module.exports = { sendToTeams };
