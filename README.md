# Pennywise — personal expense tracker

Pennywise is a small full-stack app for people who want a clear, low-friction view of everyday spending. Add expenses, group them into categories, search and filter activity, see a monthly summary, and export a CSV.

## What works

- Responsive React dashboard with monthly spending, top category, transaction history, category breakdown, search, filters, CSV export, and add/delete actions.
- Express API with validated expense endpoints and a Supabase-backed store.
- Starts in sample-data memory mode without credentials so the app can be explored immediately. Memory data resets when the API restarts.
- Structured JSON request/error logs with request IDs, plus a `/metrics` endpoint and initial Prometheus instruments.

## Run locally

Requirements: Node.js 22 or newer and npm.

1. In the project folder, install the root and app dependencies:

   ```sh
   npm install
   npm --prefix server install
   npm --prefix client install
   ```

2. Start both servers:

   ```sh
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173). The API listens on port 3001. Add an expense, try the category/month filters, search, export, and delete. Without credentials you will see sample activity; your changes last only until the API restarts.

## Run with Docker

Requirements: Docker Desktop (or Docker Engine) with the Compose plugin.

1. From the project root, copy `.env.example` to `.env` and set the Supabase values if you want persistent storage. You can leave them as placeholders to use sample data in memory.

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

2. Build and start the containers:

   ```sh
   docker compose up --build
   ```

3. Open [http://localhost:8080](http://localhost:8080). Nginx serves the built React app and forwards `/api` requests to the Express container. The API is available inside the Compose network on port 3001.

The observability services are also available at [http://localhost:9090](http://localhost:9090) (Prometheus), [http://localhost:3000](http://localhost:3000) (Grafana), and [http://localhost:5601](http://localhost:5601) (Kibana). Grafana provisions the `Pennywise Observability` dashboard and Prometheus data source on startup. The local Grafana login starts as `admin` / `admin`; Grafana asks you to change the password on first login. Kibana and Elasticsearch are local-only with security disabled for this coursework stack; do not expose ports 5601 or 9200 publicly. To fit an 8 GB laptop, Elasticsearch is limited to 1.5 GB with a 512 MB Java heap, and Kibana is limited to 1 GB with a 512 MB Node.js heap. Together their container memory limits are 2.5 GB. The stack needs internet access the first time so Docker can download its images.

On Windows with Docker Desktop and the WSL 2 backend, Elasticsearch may require a higher WSL `vm.max_map_count`. If Elasticsearch exits with a memory-map bootstrap error, run this from PowerShell while Docker Desktop is running, then start Compose again:

   ```powershell
   wsl -d docker-desktop -u root sysctl -w vm.max_map_count=1048576
   ```

On this Windows Docker Desktop setup, Node Exporter reports the Linux VM environment available to the containers, not the Windows host operating system. The dashboard labels that target `docker-desktop-linux-vm`; describe that measured machine in the report. A Linux deployment can mount the host's `/proc`, `/sys`, and root filesystem for host-level data following Node Exporter's host monitoring guidance. Stop with `docker compose down`; Prometheus, Grafana, Elasticsearch, and Filebeat state volumes remain. `docker compose down -v` deletes those histories and Filebeat's saved log read positions. Docker retains API JSON log files up to three 10 MB files per container; Elasticsearch's indexed logs have no automatic expiry in this coursework setup and remain until its data volume is deleted. Rebuild after changing app source with `docker compose up --build`. The app does not store expenses in Docker: for persistent expenses, configure Supabase and apply `supabase/schema.sql` as described above. The Supabase key is passed only to the API container; do not use a service role key.

## Connect Supabase for persistent data

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the project API settings. Keep credentials out of source control. Do not use a service role key in the browser or commit it.
3. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
4. Restart `npm run dev`. The header should say “Synced with Supabase.”

The included RLS policies are deliberately permissive for a local, single-user assignment demo. Do not expose the starter API or anon-key table policies publicly; before deploying, add Supabase Auth, an `user_id` column, ownership checks in RLS, and appropriate API abuse protection.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API and storage mode status |
| GET | `/api/categories` | Expense categories |
| GET | `/api/expenses` | List expenses, newest date first |
| POST | `/api/expenses` | Create a validated expense |
| PUT | `/api/expenses/:id` | Replace an expense with validated fields |
| DELETE | `/api/expenses/:id` | Delete an expense |
| GET | `/metrics` | Prometheus metrics for the Part B work |

POST fields: `title`, `amount`, `category`, `expense_date` (`YYYY-MM-DD`), and optional `notes`. Amounts must be positive. Categories are Food, Transport, Housing, Bills, Shopping, Health, Entertainment, and Other.

## Part B metrics

Prometheus scrapes the API and Node Exporter every five seconds. Grafana automatically provisions a dashboard with application latency/error charts, expense activity, and machine CPU, memory, disk, and network panels. Dashboard and scrape configuration are under `grafana/provisioning/` and `prometheus/`.

| Metric | Purpose | Type | Unit | Labels | Recorded in |
| --- | --- | --- | --- | --- | --- |
| `pennywise_http_requests_total` | Count handled API requests and identify errors by HTTP status | Counter | requests | `method`, bounded `route`, `status_code` | `server/src/index.js`, after each response finishes |
| `pennywise_http_request_duration_seconds` | Distribution of API response durations; histogram buckets support p95/p99 | Histogram | seconds | `method`, bounded `route`, `status_code` | `server/src/index.js`, after each response finishes |
| `pennywise_http_request_duration_summary_seconds` | Application-side rolling p50/p95/p99 response duration | Summary | seconds | `method`, bounded `route`, `status_code`, exported `quantile` | `server/src/index.js`, after each response finishes; ten-minute window |
| `pennywise_expenses_created_total` | Successful expense creations by business category | Counter | expenses | `category` | `server/src/index.js`, after a successful create |
| `pennywise_expenses_stored` | Current number of records in the selected storage | Gauge | expenses | none | `server/src/store.js`, when the collection is read or changed |
| `pennywise_*` default process metrics | Node.js process and runtime health | Various | varies | default metric labels | `server/src/metrics.js`, collected by `prom-client` |
| `node_*` | Machine CPU, memory, filesystem, and network health | Exporter metrics (counters/gauges) | varies | `instance`, device/core and `machine` | Node Exporter; scraped by Prometheus from `node-exporter:9100` |

To create repeatable sample traffic for the dashboards and log search, start the stack with `docker compose up --build`, then run `npm run demo:observability` from the repository root. The script uses the host-published app URL (`http://localhost:8080`), makes normal requests plus validation, not-found, and malformed-JSON requests, creates and deletes one clearly labelled demo expense, and prints each status and request ID. Set `API_BASE_URL` to override the URL. Give Prometheus and Filebeat a few seconds after it finishes to collect the data.

In Grafana, select the `Pennywise Observability` dashboard. To inspect request counts by status directly in Explore, use `sum by (status_code) (increase(pennywise_http_requests_total[5m]))`. In Kibana Discover, select the `pennywise-logs-*` data view and search `service : "pennywise-api"`; for the generated malformed-body error, search `msg : "request failed"`, then use its `request_id` to find the corresponding access log. The script prints request IDs for each response, including the malformed JSON request.

### Part E.1: reproduce slow requests

`npm run experiment:slow-requests` sends `/api/health` requests in three one-minute stages: baseline, fault injected, and recovery. Prometheus scrapes every five seconds, so each stage includes at least twelve scrapes. During the fault stage, every explicitly marked request is delayed by 500 ms. This fault is disabled by default and requires `DEMO_FAULT_INJECTION=true` in `.env`; the script cannot activate it by itself. To run the experiment, add `DEMO_FAULT_INJECTION=true` and `DEMO_DELAY_MS=500` to `.env` (preserve any existing Supabase settings), then run `docker compose up -d --build api` and `npm run experiment:slow-requests`. Set the flag back to `false` and run `docker compose up -d api` after capturing results. The fault only applies to requests carrying the experiment's `x-demo-fault` header, so ordinary app requests are unaffected.

In Grafana Explore, compare the request duration p95 for `/api/health` using `histogram_quantile(0.95, sum by (le) (rate(pennywise_http_request_duration_seconds_bucket{route="/api/health"}[1m])))`. The injected stage should raise p95; request counts and status should remain similar because the delayed requests still succeed. The script prints the exact stage times, status, latency, and request IDs. In Kibana Discover, search `service : "pennywise-api" AND req.url : "/api/health"`, then inspect `responseTime` and correlate a request with the script's printed `request_id`. The experiment introduces latency only; it should not create 4xx/5xx responses.

### Part E.2: bounded cardinality demonstration

The separate `pennywise_demo_requests_total` test counter is disabled by default. It can optionally include `request_id` as a label; regular application metrics never use request IDs as labels. For the high-cardinality phase, set `CARDINALITY_DEMO_ENABLED=true` and `CARDINALITY_DEMO_REQUEST_ID_LABEL=true` in `.env`, recreate the API with `docker compose up -d --build api`, then run `npm run experiment:cardinality`. The script sends exactly 100 demo requests in batches of 20, waits for a Prometheus scrape, and prints the series count at each checkpoint. Expected counts are 20, 40, 60, 80, and 100.

For comparison, set `CARDINALITY_DEMO_REQUEST_ID_LABEL=false`, recreate the API with `docker compose up -d api`, wait for a scrape, and run the script again. The series count should remain 1 while the counter value increases. The script checks that Prometheus has cleared the previous active series before starting; old samples remain in Prometheus storage until retention expires. Turn `CARDINALITY_DEMO_ENABLED=false` after the experiment. The endpoint and metric are disabled by default. Keep this to 100 IDs; unique IDs create one time series per request and increase Prometheus memory, storage, and query costs. Put request IDs in logs instead.

Prometheus query for both phases:

```promql
count(pennywise_demo_requests_total)
```

Useful Grafana/PromQL examples:

```promql
sum by (route) (rate(pennywise_http_requests_total[5m]))
sum by (route) (rate(pennywise_http_requests_total{status_code=~"5.."}[5m]))
histogram_quantile(0.95, sum by (le) (rate(pennywise_http_request_duration_seconds_bucket[1m])))
sum by (category) (increase(pennywise_expenses_created_total[1h]))
pennywise_expenses_stored
```

The Grafana histogram p95 panel uses a rolling one-minute window, calculated by Prometheus from bucket rates; unlike Summary quantiles, histogram buckets can be aggregated across API instances. Slow observations can remain in that moving window for up to one minute after recovery begins. The Summary panel shows its application-side p95 over a rolling ten-minute window, so it can stay elevated longer. See the prebuilt dashboard for the exact queries and chart descriptions. For the Windows Docker Desktop run, machine panels describe the Linux VM accessible to the exporter, not Windows host resource usage.

## Part C logs

The API writes one JSON object per line to stdout through Pino. Docker's `json-file` logging driver wraps and stores those lines; the API container keeps at most three 10 MB log files. Filebeat watches Docker container start/stop events through the Docker socket, selects the API using the `pennywise.service=api` label, reads its Docker log files, removes the Docker wrapper, and decodes the inner Pino JSON into Elasticsearch fields. The Filebeat config is `filebeat/filebeat.yml`. Elasticsearch stores searchable logs in `elasticsearch-data`; Kibana is the UI for searching them. The stack does not log expense titles, notes, or request bodies. Authorization headers, cookies, and malformed request bodies are redacted from error logs.

To inspect logs:

1. Open Kibana at [http://localhost:5601](http://localhost:5601). Choose **Discover** and create a data view named `pennywise-logs-*` with `@timestamp` as the time field.
2. To make an error log, send malformed JSON to the API from PowerShell: `Invoke-WebRequest -Method Post -Uri http://localhost:8080/api/expenses -ContentType 'application/json' -Body '{'`. The API returns an error and logs it without recording the request body.
3. Search in Kibana with `msg : "request failed"` or `level : 50`. Open the matching event, copy its `request_id`, then search with `request_id : "<copied-id>"` to isolate that request.

The stored application event includes `time`, `service`, numeric Pino `level`, `msg`, and `request_id`, plus Docker container metadata. Normal `docker compose down` keeps Elasticsearch's indexed logs and Filebeat's registry state in named volumes; Docker may rotate its original container logs after the configured size limit. `docker compose down -v` removes the indexed data, metrics history, Grafana state, and Filebeat registry. Elasticsearch/Kibana/Filebeat use the same pinned Elastic version. Filebeat's container parser unwraps Docker's JSON log envelope before its NDJSON parser decodes Pino's JSON line.
