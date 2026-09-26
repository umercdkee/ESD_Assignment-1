// Part E.1 repeatable experiment: compare normal, deliberately slow, and
// recovered request behavior. The server must be started with
// DEMO_FAULT_INJECTION=true for the middle stage to inject the delay.
const baseUrl = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const durationSeconds = 60;
const intervalMs = Math.max(250, Number(process.env.INTERVAL_MS) || 1000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runStage(name, injectFault) {
  console.log(`\n=== ${name}: ${new Date().toISOString()} for ${durationSeconds}s ===`);
  const endAt = Date.now() + durationSeconds * 1000;
  let index = 0;
  let failures = 0;
  let slow = 0;

  while (Date.now() < endAt) {
    const startedAt = Date.now();
    const headers = injectFault ? { 'x-demo-fault': 'add-delay' } : {};
    try {
      const response = await fetch(`${baseUrl}/api/health`, { headers });
      const elapsedMs = Date.now() - startedAt;
      const requestId = response.headers.get('x-request-id') || '(missing)';
      if (!response.ok) failures += 1;
      if (elapsedMs >= 400) slow += 1;
      console.log(`${new Date().toISOString()} ${name} #${++index}: status=${response.status} duration_ms=${elapsedMs} request_id=${requestId}`);
      await response.arrayBuffer();
    } catch (error) {
      failures += 1;
      console.log(`${new Date().toISOString()} ${name} #${++index}: request failed (${error.message})`);
    }
    const remaining = endAt - Date.now();
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }
  console.log(`${name} summary: requests=${index}, slow_over_400ms=${slow}, failures=${failures}`);
}

console.log(`API: ${baseUrl}; stage duration: ${durationSeconds}s; interval: ${intervalMs}ms`);
console.log('Prometheus scrapes every five seconds; each stage runs for at least one minute.');
await runStage('baseline', false);
await runStage('fault-injected', true);
await runStage('recovery', false);
console.log('\nExperiment complete. Compare each stage using the start/end times printed above.');
