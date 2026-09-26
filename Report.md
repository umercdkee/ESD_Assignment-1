# Pennywise Observability Report

**Course:** Enterprise Software Development, Fall 2026  
**Project:** Pennywise personal expense tracker  
**Student:** Muhammad Umer Siddiqui


## Part A — Project

### Problem, users, and solution

People who want to understand their day-to-day spending need a quick way to record expenses and review where their money goes. Pennywise is a personal expense tracker for an individual who wants a simple overview rather than a complex accounting system.

The React dashboard lets the user add, edit, and delete expenses; search and filter transactions; view monthly spending and category summaries; and export filtered activity to CSV. The Express API validates expense data and provides the frontend with expense and category endpoints. The API stores data in Supabase when configured. Without Supabase credentials, it runs in a sample-data mode backed by memory; changes in that mode reset when the API restarts.

### How to try the application

The Docker Compose setup starts the frontend, API, and observability services:

```powershell
docker compose up --build
```

Open the application at `http://localhost:8080`. The UI forwards API calls through Nginx to Express. To use persistent expenses, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the local `.env` file and run `supabase/schema.sql` in the Supabase SQL editor. Do not commit `.env` or use a Supabase service-role key.

The monitoring interfaces are Prometheus at `http://localhost:9090`, Grafana at `http://localhost:3000`, and Kibana at `http://localhost:5601`. Grafana's initial local login is `admin` / `admin`; it prompts for a password change. Elasticsearch and Kibana have security disabled for this local coursework setup and their ports are bound to localhost. They must not be exposed publicly. To fit the 8 GB development laptop, Elasticsearch has a 1.5 GB container limit and a 512 MB Java heap; Kibana has a 1 GB container limit and a 512 MB Node.js heap.

API routes include `GET /api/health`, `GET /api/expenses`, `POST /api/expenses`, `PUT /api/expenses/:id`, `DELETE /api/expenses/:id`, and `GET /metrics`.

## Part B — Metrics

### Collection and dashboard design

The API uses `prom-client` and exposes its registry at `/metrics`. Prometheus scrapes the API and Node Exporter every five seconds, then stores samples in its named data volume with a 15-day retention limit. Grafana uses Prometheus as its data source and provisions the `Pennywise Observability` dashboard from `grafana/provisioning/dashboards/pennywise.json`.

The project uses all four required metric types across the application: counters for events that accumulate, a gauge for the current stored-expense count, a histogram for request-duration distributions, and a summary for application-side latency quantiles. These types are used where they fit; the assignment does not require four of every type for both technical and business metrics.

### Application metrics

| Metric | Purpose | Type | Unit | Labels | Where and how it is recorded |
|---|---|---|---|---|---|
| `pennywise_http_requests_total` | Counts completed HTTP responses and helps identify errors by status | Counter | requests | `method`, bounded `route`, `status_code`, plus registry label `service` | Defined in `server/src/metrics.js`; incremented by the response-finish middleware in `server/src/index.js` |
| `pennywise_http_request_duration_seconds` | Tracks the distribution of request latency and supports Prometheus percentile calculation | Histogram | seconds | `method`, bounded `route`, `status_code`, plus `service`; bucket boundaries: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5 seconds | Defined in `server/src/metrics.js`; each completed request's duration is observed in `server/src/index.js` |
| `pennywise_http_request_duration_summary_seconds` | Reports application-side p50, p95, and p99 request duration quantiles | Summary | seconds | `method`, bounded `route`, `status_code`, `quantile`, plus `service` | Defined in `server/src/metrics.js`; observations are recorded alongside the histogram in `server/src/index.js`; configured as a rolling ten-minute window |
| `pennywise_expenses_created_total` | Counts successfully created expenses as a business measure | Counter | expenses | `category`, plus `service` | Defined in `server/src/metrics.js`; incremented in the successful `POST /api/expenses` handler in `server/src/index.js` |
| `pennywise_expenses_stored` | Shows the current number of stored expenses | Gauge | expenses | `service` | Defined in `server/src/metrics.js`; updated by store operations in `server/src/store.js` when expenses are read, created, or deleted. An edit does not change the record count. |
| `pennywise_*` default runtime metrics | Provides Node.js process and runtime health data | Various Prometheus types | Varies by metric | Usually `service` | Collected by `prom-client` through `collectDefaultMetrics()` in `server/src/metrics.js` |

The HTTP `route` label uses Express route templates where available, keeping IDs out of the label values and limiting time-series cardinality. Unmatched routes are grouped under `unmatched` (with the `/api/expenses` collection route explicitly recognized).

### Node Exporter metrics

Prometheus also scrapes Node Exporter at `node-exporter:9100`. The `machine` target label is set to `docker-desktop-linux-vm`. On this Windows Docker Desktop setup, the exported machine data describes the Linux VM available to the containers, not the Windows host OS. The report and dashboard use that machine name to make the measurement target explicit.

| Example metric(s) | Purpose | Type | Unit | Important labels | Grafana view |
|---|---|---|---|---|---|
| `node_cpu_seconds_total` | CPU time by CPU core and mode; used to derive non-idle CPU percentage | Counter | CPU seconds | `cpu`, `mode`, `instance`, `machine` | CPU percentage over a rolling five-minute rate |
| `node_memory_MemTotal_bytes`, `node_memory_MemAvailable_bytes` | Total and available memory; used to derive memory use | Gauge | bytes | `instance`, `machine` | Percentage of memory used |
| `node_filesystem_size_bytes`, `node_filesystem_avail_bytes` | Filesystem capacity and available bytes | Gauge | bytes | `device`, `mountpoint`, `fstype`, `instance`, `machine` | Percentage used by filesystem; temporary and overlay filesystems are filtered out |
| `node_network_receive_bytes_total` | Received network traffic by interface | Counter | bytes | `device`, `instance`, `machine` | Receive rate in bytes per second over five minutes |

Node Exporter provides additional machine series beyond those shown in this table. The dashboard's network panel displays receive traffic; CPU, memory, and filesystem panels cover the other required machine resource areas.

### Grafana queries and what the charts show

The dashboard queries are also saved in `grafana/provisioning/dashboards/pennywise.json`.

| Chart | PromQL query | Interpretation and time window |
|---|---|---|
| API request rate by route | `sum by (route) (rate(pennywise_http_requests_total[5m]))` | Average requests per second for each route, using the last five minutes. |
| API 5xx rate by route | `sum by (route) (rate(pennywise_http_requests_total{status_code=~"5.."}[5m]))` | Server-error responses per second by route over the last five minutes. A zero/empty chart means no matching 5xx samples in the visible range. |
| API p95 latency | `histogram_quantile(0.95, sum by (le) (rate(pennywise_http_request_duration_seconds_bucket[1m])))` | Estimated 95th percentile request duration in seconds, calculated from histogram bucket rates over a rolling one-minute window. Roughly 95% of observed requests in that window were at or below this latency estimate. Slow observations can remain in this moving window for up to one minute after recovery begins. |
| Expense creations by category | `sum by (category) (increase(pennywise_expenses_created_total[1h]))` | Estimated successful creations in each category during the last hour. |
| Current expenses in storage | `pennywise_expenses_stored` | Latest gauge value for the number of records in the selected store. |
| Node CPU use | `100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{machine="docker-desktop-linux-vm",mode="idle"}[5m])))` | Approximate non-idle CPU percentage on the labeled Linux VM, over five minutes. |
| Node memory use | `100 * (1 - node_memory_MemAvailable_bytes{machine="docker-desktop-linux-vm"} / node_memory_MemTotal_bytes{machine="docker-desktop-linux-vm"})` | Approximate percentage of VM memory in use. |
| Node filesystem use | `100 * (1 - node_filesystem_avail_bytes{machine="docker-desktop-linux-vm",fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes{machine="docker-desktop-linux-vm",fstype!~"tmpfs|overlay|squashfs"})` | Percentage used for each included filesystem on the VM. |
| Node network receive rate | `sum by (device) (rate(node_network_receive_bytes_total{machine="docker-desktop-linux-vm",device!~"lo|veth.*"}[5m]))` | Received bytes per second by non-loopback/non-veth interface, over five minutes. |
| Application Summary p95 | `pennywise_http_request_duration_summary_seconds{quantile="0.95"}` | Application-side p95 in seconds over the Summary's rolling ten-minute window, separated by method, route, and status. |

The histogram p95 is used as the main latency chart because Prometheus can aggregate histogram buckets across instances before calculating a percentile. Its one-minute window makes the chart reflect recovery sooner while retaining multiple scrapes. The Summary p95 is an additional comparison/exploration; its precomputed quantiles are local to an application process, are not suitable for aggregation across API replicas, and use a ten-minute rolling window.


## Part C — Logs

### What is logged, why, and where

The API uses Pino for newline-delimited JSON logs. Startup logs include the service, port, storage mode, and a message confirming that the API is listening. `pino-http` records HTTP request/response events, including method, URL, status, duration, and `request_id`. Unexpected failures are logged by the Express error handler with the error object, the request ID, and `msg` set to `request failed`. These events help confirm startup, assess requests, and locate an error associated with a particular request.

Request IDs are generated or accepted from the incoming `x-request-id` header and returned in the response header. The API's request ID and error middleware are in `server/src/index.js`; logger level, timestamp format, service name, and redaction rules are in `server/src/logger.js`.

The logger does not intentionally log expense titles, notes, or request bodies. It redacts authorization headers, cookies, error bodies, and fields named `password` or `email`. The demo/test evidence should use only synthetic data. Logging request bodies would risk capturing personal expense details and is not needed to diagnose these API operations.

### How Filebeat collects and parses logs

The API writes logs to stdout. Docker's `json-file` logging driver stores each container output line inside a Docker JSON record. Filebeat uses the Docker socket to watch container lifecycle events and identify containers; a Compose label selects the Pennywise API. It reads the API's Docker log files from `/var/lib/docker/containers`.

`filebeat/filebeat.yml` configures two parsers in order:

1. The **container parser** removes Docker's outer JSON envelope and extracts the contained log line and timestamp.
2. The **NDJSON parser** decodes the Pino JSON line into searchable fields.

Filebeat adds Docker metadata and sends the events to Elasticsearch using the `pennywise-logs-YYYY.MM.dd` daily index naming pattern. Kibana searches those Elasticsearch indices. Logstash is optional and is not used here; Filebeat sends directly to Elasticsearch because this project only needs container-log parsing and indexing.

### Where logs live and retention

| Data | Location | Restart/deletion behavior |
|---|---|---|
| Original API container output | Docker Engine `json-file` logs | Up to three 10 MB files per API container. Docker rotates older files after the configured size/count limit. A normal API container restart keeps its container log files; `docker compose down` removes containers and therefore their original log files. |
| Parsed, searchable log events | Elasticsearch named volume `elasticsearch-data` | Survive container restarts and ordinary `docker compose down`. There is no automatic Elasticsearch index expiry configured; indexed documents remain until the volume is deleted. |
| Filebeat file-read/registry state | Named volume `filebeat-data` | Persists positions across Filebeat restarts so it can resume reading. Removing the volume deletes this state. |

`docker compose down -v` removes the named volumes, including Elasticsearch's indexed logs and Filebeat's registry. Docker's source log rotation is separate from Elasticsearch retention.


## Part D.1 — System design

### Architecture diagram

![Image description](images\systemdesign.png)

### Components and communication

The browser loads the React frontend from Nginx on port 8080. Nginx serves the built static files and proxies `/api` requests to the Express API. The API validates expense operations and communicates with Supabase when credentials and schema are configured; otherwise, it uses sample data held in memory.

For metrics, Prometheus periodically scrapes the API's `/metrics` endpoint and Node Exporter's `:9100` endpoint. Grafana sends PromQL queries to Prometheus and displays the returned time series. The Prometheus configuration and 15-day retention are in `prometheus/prometheus.yml` and `compose.yaml`.

For logs, Pino writes JSON to API stdout. Docker stores stdout using `json-file`; Filebeat watches Docker through the socket and reads the selected API container's files. Filebeat parses the Docker envelope and Pino JSON, then sends searchable events to Elasticsearch. Kibana queries Elasticsearch and presents the events in Discover.

### Data storage choices

Expenses belong in Supabase when persistent storage is needed; this keeps business data outside the disposable API container. The no-credential sample-data mode makes the app easy to explore but resets when the API restarts. Prometheus and Elasticsearch use named Docker volumes so their metric and log histories survive ordinary container restarts and `docker compose down`. Filebeat's registry volume preserves its read positions. Grafana also has a named volume, while its dashboard and datasource definitions are provisioned from repository configuration. Docker rotates its original API logs at three files of 10 MB each; Elasticsearch currently has no automatic log expiry. `docker compose down -v` deletes the named volumes and their data.

The Elasticsearch and Kibana ports are bound to localhost and security is disabled for the local assignment stack. This is a development arrangement, not a public deployment configuration.

### Failure behavior

| Component that stops | Expected effect and recovery behavior |
|---|---|
| Nginx/web | Users cannot load the frontend through port 8080. The API and monitoring services may continue operating. Restarting the web service restores access. |
| Express API | The frontend cannot load or change expenses. Prometheus marks the API target unavailable and receives no new API metrics; no new API logs are produced. Existing Prometheus/Elasticsearch history remains in its volumes. |
| Supabase | API reads/writes that rely on Supabase can fail. The monitoring stack can continue. The app only falls back to memory when Supabase is not configured at startup, not automatically when a configured Supabase service becomes unavailable. |
| Prometheus | Scrapes stop while it is down, creating a gap in metric history. The API continues to serve requests and expose its in-process metrics. Prometheus resumes from its persisted volume when restarted. |
| Grafana | Dashboards are unavailable, but Prometheus continues collecting. Grafana can query the retained data again after restart. |
| Node Exporter | Machine-resource samples stop and Node Exporter target becomes unavailable. API metrics remain collectable. |
| Filebeat | New application logs are not shipped while it is down. Docker retains source logs subject to its rotation limit; Filebeat's registry volume lets it resume from saved state after restart. |
| Elasticsearch | Kibana cannot search indexed logs and Filebeat cannot complete delivery while Elasticsearch is unavailable. The application itself can continue running. |
| Kibana | The search UI is unavailable; Elasticsearch can continue storing log events and Filebeat can continue shipping them. |



### Design notes and limitations

The services are separated so the expense application does not depend on Grafana, Prometheus, Filebeat, Elasticsearch, or Kibana to serve normal requests. The observability tools can stop independently; their main impact is loss of visibility or a gap in collected data. Persistent named volumes protect metric and indexed-log history from ordinary container recreation, while explicit retention limits keep the local Prometheus and Docker log stores bounded.

One environment-specific limitation is that Node Exporter on Docker Desktop measures the Linux VM available to containers, not the Windows host. The target is labelled `docker-desktop-linux-vm` in Prometheus. 

## Part D.2 — Tracing

### Tracing Logs
A log first appears as raw output as in the screenshot below.
![Image description](images\rawlog.png)
Filebeat then captures it in the form visible here
![Image description](images\filebeatlog.png)
Elasticsearch then stores it. Part of the way it is stored is given in this snapshot:
![Image description](images\elasticsearchlog.png)
Kibana finally shows the logs in a tabular, readable form as shown below:
![Image description](images\kibanalog.png)

### Tracing Metrics
Metrics are first exposed at the /metrics endpoint as shown below
![Image description](images\rawmetric.png)
Prometheus scrapes them at set intervals and stores them as shown below 
![Image description](images\prometheusmetric.png)
Finally, Grafana visualizes them.
![Image description](images\grafanametric.png)

## Part E.1 — Reproduce a slow-request problem

### Fault and repeatable test

The experiment injects a 500 ms delay into every explicitly marked `GET /api/health` request during the fault stage. The fault middleware is in `server/src/index.js`. It is disabled unless `DEMO_FAULT_INJECTION=true` is set in the API container, and it only affects requests carrying `x-demo-fault: add-delay`. The delay is configurable with `DEMO_DELAY_MS` and capped at five seconds. The default Compose configuration keeps the experiment disabled.

The script `scripts/experiment-slow-requests.mjs`, invoked with `npm run experiment:slow-requests`, runs three repeatable stages: baseline, fault-injected, and recovery. Each stage runs for at least one minute, with one health request approximately every second. Prometheus scrapes every five seconds, so each stage spans about twelve scrape intervals. The script prints each stage's UTC start time, HTTP status, observed client latency, request ID, and a count of requests over 400 ms. `API_BASE_URL` can override `http://localhost:8080`.

For a local run, add `DEMO_FAULT_INJECTION=true` and `DEMO_DELAY_MS=500` to `.env`, preserving any existing settings, then recreate the API and run the workload:

```powershell
docker compose up -d --build api
npm run experiment:slow-requests
```

Return the setting to `DEMO_FAULT_INJECTION=false` and recreate the API after capturing results:

```powershell
docker compose up -d api
```

This is a controlled local fault. It does not change normal requests because the fault must be enabled and the request must carry the experiment header. The script sends only health checks and does not create or modify expenses.

### Expected metric and log changes

Before running the script, the expected behavior is low `/api/health` latency with successful 200 responses. During the injected stage, every marked call incurs the added delay; this should increase the histogram's higher latency buckets and its p95 estimate, while request rate and status code remain roughly steady. The request middleware continues logging each completion with its response time and request ID. During recovery, the script stops sending the fault header, so latency should return near baseline after the last slow sample leaves the histogram query's one-minute window. The Summary p95 can remain elevated for up to ten minutes because it uses a longer rolling window.

In Grafana Explore, select a time range covering all three stages and query the `/api/health` histogram p95:

```promql
histogram_quantile(0.95, sum by (le) (rate(pennywise_http_request_duration_seconds_bucket{route="/api/health"}[1m])))
```

Below are zoomed in snapshots of the Grafana visualizations before, during, and after the bugs.
![Image description](images\experiment1.png)
![Image description](images\experiment2.png)
![Image description](images\experiment3.png)

## Part E.2 — Demonstrate metric cardinality

### Bounded experiment

`server/src/metrics.js` defines the separate `pennywise_demo_requests_total` counter only when `CARDINALITY_DEMO_ENABLED=true`. The `/api/demo/cardinality` route increments it only when enabled. Setting `CARDINALITY_DEMO_REQUEST_ID_LABEL=true` adds the generated HTTP `request_id` as a metric label. This test counter is separate from the application's normal metrics, which do not use request IDs as labels.

The script `scripts/experiment-cardinality.mjs`, invoked with `npm run experiment:cardinality`, is capped at 100 requests. It sends requests in batches of 20, waits for a Prometheus scrape after each batch, and prints the series count. Prometheus scrapes every five seconds. For the high-cardinality phase, set these values in `.env` and recreate the API:

```dotenv
CARDINALITY_DEMO_ENABLED=true
CARDINALITY_DEMO_REQUEST_ID_LABEL=true
```

```powershell
docker compose up -d --build api
npm run experiment:cardinality
```

The Prometheus query is:

```promql
count(pennywise_demo_requests_total)
```

With the label enabled, expected active-series counts at the checkpoints are 20, 40, 60, 80, and 100. Each unique label value creates another series for the same metric name.

For the comparison, keep the demo enabled but remove the label by setting `CARDINALITY_DEMO_REQUEST_ID_LABEL=false`. Recreate the API and repeat the same script:

```dotenv
CARDINALITY_DEMO_ENABLED=true
CARDINALITY_DEMO_REQUEST_ID_LABEL=false
```

```powershell
docker compose up -d api
npm run experiment:cardinality
```

The series count should remain 1 while its counter value increases. The script waits for the previous active series to clear from instant queries after a scrape; historical samples remain in Prometheus storage until retention expires. After collecting both phases, set `CARDINALITY_DEMO_ENABLED=false` and recreate the API. The demo endpoint returns 404 and the counter is no longer exported.

### Why request IDs belong in logs

Prometheus creates a series for every unique combination of metric name and label values. A request ID is unique per request, so using it as a label creates one series per request. At larger traffic volumes, this grows Prometheus's in-memory index and disk usage and makes queries more expensive. Request IDs are useful in logs, where they can be searched without creating a series per request. This demonstration stops at 100 IDs; do not increase it to stress or crash Prometheus.

### Results to record

| Requests sent | Count with `request_id` label | Count without `request_id` label |
|---:|---:|---:|
| 20 | 20 | 1 |
| 40 | 40 | 1 |
| 60 | 60 | 1 |
| 80 | 80 | 1 |
| 100 | 100 | 1 |

