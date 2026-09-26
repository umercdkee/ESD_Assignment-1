// Part E.2: bounded demonstration only. Sends exactly 100 requests and checks
// Prometheus after each 20-request batch; it never grows labels without bound.
const apiBaseUrl = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const prometheusUrl = (process.env.PROMETHEUS_URL || 'http://localhost:9090').replace(/\/$/, '');
const metricName = 'pennywise_demo_requests_total';
const batchSize = 20;
const maxRequests = 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function querySeriesCount() {
  const queryUrl = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(`count(${metricName})`)}`;
  const response = await fetch(queryUrl);
  if (!response.ok) throw new Error(`Prometheus returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== 'success') throw new Error(`Prometheus query failed: ${JSON.stringify(payload)}`);
  const result = payload.data.result[0];
  return result ? Number(result.value[1]) : 0;
}

async function waitForSeriesCount(expected) {
  // Scrape interval is five seconds; retry briefly in case this checkpoint
  // fell just after a scrape.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const count = await querySeriesCount();
    if (count === expected) return count;
    await sleep(1000);
  }
  const actual = await querySeriesCount();
  throw new Error(`Expected ${expected} active series for ${metricName}, Prometheus reports ${actual}. Confirm the API restarted in the requested mode and wait for a scrape.`);
}

console.log(`API: ${apiBaseUrl}; Prometheus: ${prometheusUrl}`);
console.log('This run is hard-capped at 100 generated request IDs.');
console.log('Waiting for the post-restart scrape to clear any previous demo series...');
await waitForSeriesCount(0);

const requestIds = new Set();
let usesRequestIdLabel;
for (let index = 1; index <= maxRequests; index += 1) {
  const response = await fetch(`${apiBaseUrl}/api/demo/cardinality`, { method: 'POST' });
  const payload = await response.json();
  if (!response.ok || payload.status !== 'counted') {
    throw new Error(`API rejected demo request ${index} (HTTP ${response.status}). Enable CARDINALITY_DEMO_ENABLED and recreate the API.`);
  }
  if (usesRequestIdLabel === undefined) usesRequestIdLabel = payload.request_id_label;
  if (payload.request_id_label !== usesRequestIdLabel) throw new Error('API cardinality label mode changed during the run.');
  requestIds.add(payload.request_id);

  if (index % batchSize === 0) {
    await sleep(6000); // allow at least one five-second Prometheus scrape
    const expectedSeries = usesRequestIdLabel ? requestIds.size : 1;
    const actualSeries = await waitForSeriesCount(expectedSeries);
    console.log(`requests=${index}; unique_request_ids=${requestIds.size}; request_id_label=${usesRequestIdLabel}; Prometheus ${metricName} series=${actualSeries}`);
  }
}

console.log(`Complete: ${requestIds.size} unique request IDs generated. Compare the count above with the other label mode.`);
