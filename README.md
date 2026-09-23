# Pennywise — personal expense tracker

Pennywise is a small full-stack app for people who want a clear, low-friction view of everyday spending. Add expenses, group them into categories, search and filter activity, see a monthly summary, and export a CSV.

## What works

- Responsive React dashboard with monthly spending, top category, transaction history, category breakdown, search, filters, CSV export, and add/delete actions.
- Express API with validated expense endpoints and a Supabase-backed store.
- Starts in sample-data memory mode without credentials so the app can be explored immediately. Memory data resets when the API restarts.
- Structured JSON request/error logs with request IDs, plus a `/metrics` endpoint and initial Prometheus instruments.

## Run locally

Requirements: Node.js 18 or newer and npm.

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

Stop with `docker compose down`. Rebuild after changing source with `docker compose up --build`. The app does not store data in Docker: for persistent expenses, configure Supabase and apply `supabase/schema.sql` as described above. The Supabase key is passed only to the API container; do not use a service role key.

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
