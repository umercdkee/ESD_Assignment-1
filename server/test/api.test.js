import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('expense API validates input and supports list, create, update, delete and metrics', async (t) => {
  const port = await availablePort();
  const api = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  api.stderr.setEncoding('utf8');
  api.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => api.kill('SIGTERM'));

  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`API exited early: ${stderr}`);
    try { health = await fetch(`${base}/api/health`); break; } catch { await delay(100); }
  }
  assert.ok(health, `API did not start: ${stderr}`);
  assert.deepEqual(await health.json(), { status: 'ok', storage: 'memory' });

  const invalid = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '', amount: 0, category: 'Food', expense_date: 'invalid' }),
  });
  assert.equal(invalid.status, 400);

  const createdResponse = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Test groceries', amount: 18.25, category: 'Food', expense_date: '2026-09-23', notes: 'Market' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.title, 'Test groceries');
  assert.equal(Number(created.amount), 18.25);

  const listedResponse = await fetch(`${base}/api/expenses`);
  const listed = await listedResponse.json();
  assert.ok(listed.some((expense) => expense.id === created.id));

  const updatedResponse = await fetch(`${base}/api/expenses/${created.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated groceries', amount: 21.5, category: 'Shopping', expense_date: '2026-09-22', notes: 'Updated note' }),
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.id, created.id);
  assert.equal(updated.title, 'Updated groceries');
  assert.equal(Number(updated.amount), 21.5);
  assert.equal(updated.category, 'Shopping');

  const missingUpdate = await fetch(`${base}/api/expenses/not-a-real-id`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'No record', amount: 1, category: 'Other', expense_date: '2026-09-23' }),
  });
  assert.equal(missingUpdate.status, 404);

  const deleted = await fetch(`${base}/api/expenses/${created.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const missingDelete = await fetch(`${base}/api/expenses/${created.id}`, { method: 'DELETE' });
  assert.equal(missingDelete.status, 404);

  const metricsResponse = await fetch(`${base}/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  assert.match(metrics, /pennywise_http_requests_total/);
  assert.match(metrics, /pennywise_expenses_created_total/);
  assert.match(metrics, /pennywise_expenses_stored/);
});
