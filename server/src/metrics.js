import client from 'prom-client';

// Part B: a dedicated module keeps instrumentation out of route/business logic.
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'pennywise-api' });
client.collectDefaultMetrics({ register: registry, prefix: 'pennywise_' });

export const httpRequests = new client.Counter({
  name: 'pennywise_http_requests_total',
  help: 'HTTP requests handled by the API.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'pennywise_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

// A rolling-window Summary is included to demonstrate the fourth Prometheus
// metric type. The Histogram remains the preferred source for fleet-wide p95s.
export const httpDurationSummary = new client.Summary({
  name: 'pennywise_http_request_duration_summary_seconds',
  help: 'Request duration summary over a rolling ten-minute window.',
  labelNames: ['method', 'route', 'status_code'],
  percentiles: [0.5, 0.95, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5,
  registers: [registry],
});

export const expensesCreated = new client.Counter({
  name: 'pennywise_expenses_created_total',
  help: 'Expenses successfully created.',
  labelNames: ['category'],
  registers: [registry],
});

export const expensesStored = new client.Gauge({
  name: 'pennywise_expenses_stored',
  help: 'Number of expense records currently stored.',
  registers: [registry],
});
