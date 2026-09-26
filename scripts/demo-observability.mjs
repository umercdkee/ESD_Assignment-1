// Generate safe, repeatable local traffic for the Grafana and Kibana demos.
// The API base can be overridden with API_BASE_URL if the published port changes.
const baseUrl = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function send(label, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const requestId = response.headers.get('x-request-id') || '(none)';
  const body = await response.text();
  console.log(`${label}: ${options.method || 'GET'} ${path} -> ${response.status} (request_id=${requestId})`);
  if (body && process.env.SHOW_RESPONSE_BODY === '1') console.log(body);
  return response;
}

console.log(`Sending observability demo requests to ${baseUrl}`);

await send('health', '/api/health');
await send('categories', '/api/categories');
await send('list expenses', '/api/expenses');

// Create then remove a clearly labelled demo record so persistent stores are
// left as they were. The create counter still records the successful POST.
const createdResponse = await send('create demo expense', '/api/expenses', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: `Observability demo ${new Date().toISOString()}`,
    amount: 1,
    category: 'Other',
    expense_date: new Date().toISOString().slice(0, 10),
    notes: 'Temporary record created by the observability demo script.',
  }),
});

let created;
try {
  created = await createdResponse.json();
} catch {
  // Keep going so error traffic is still generated if the create request fails.
}

if (createdResponse.status === 201 && created?.id) {
  await send('delete demo expense', `/api/expenses/${encodeURIComponent(created.id)}`, { method: 'DELETE' });
} else {
  console.log('delete demo expense: skipped because the API did not return a created record');
}

await send('validation error', '/api/expenses', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: '', amount: -1, category: 'Not a category', expense_date: 'invalid' }),
});
await send('not found', '/api/expenses/observability-demo-missing-id', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });

// Malformed JSON exercises the parser error path and produces a 500/error log
// in this app. The logger redacts the parser's captured request body.
await send('malformed JSON error', '/api/expenses', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{',
});

await send('metrics scrape', '/metrics');
console.log('Done. Allow a few seconds for Prometheus to scrape and Filebeat to index the logs.');
