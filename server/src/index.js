import './config.js';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import { logger } from './logger.js';
import { expensesCreated, httpDuration, httpDurationSummary, httpRequests, registry } from './metrics.js';
import { createExpense, deleteExpense, listExpenses, supabase, updateExpense } from './store.js';

const app = express();
const port = Number(process.env.PORT) || 3001;
const categories = ['Food', 'Transport', 'Housing', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'];
const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(100),
  amount: z.coerce.number().finite().positive().max(1_000_000),
  category: z.enum(categories),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional().default(''),
});

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    },
  },
}));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customProps: (req) => ({ request_id: req.id }),
}));

// Use the matched route template as a label to keep Prometheus cardinality bounded.
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path === '/api/expenses' ? '/api/expenses' : 'unmatched', status_code: String(res.statusCode) };
    httpRequests.inc(labels);
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    httpDuration.observe(labels, durationSeconds);
    httpDurationSummary.observe(labels, durationSeconds);
  });
  next();
});

// Attach logging and metrics before parsing so malformed JSON gets observed too.
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: supabase ? 'supabase' : 'memory' }));
app.get('/api/categories', (_req, res) => res.json(categories));
app.get('/api/expenses', async (_req, res, next) => {
  try { res.json(await listExpenses()); } catch (error) { next(error); }
});
app.post('/api/expenses', async (req, res, next) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the expense details.', details: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })) });
  try {
    const expense = await createExpense(parsed.data);
    expensesCreated.inc({ category: expense.category });
    return res.status(201).json(expense);
  } catch (error) { return next(error); }
});
app.put('/api/expenses/:id', async (req, res, next) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the expense details.', details: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })) });
  try {
    const expense = await updateExpense(req.params.id, parsed.data);
    if (!expense) return res.status(404).json({ error: 'Expense not found.' });
    return res.json(expense);
  } catch (error) { return next(error); }
});
app.delete('/api/expenses/:id', async (req, res, next) => {
  try {
    const deleted = await deleteExpense(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Expense not found.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
app.get('/metrics', async (_req, res, next) => {
  try { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); } catch (error) { next(error); }
});
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, req, res, _next) => {
  req.log?.error({ err: error, request_id: req.id }, 'request failed');
  if (res.headersSent) return;
  return res.status(500).json({ error: 'Something went wrong. Please try again.', request_id: req.id });
});

app.listen(port, () => logger.info({ port, storage: supabase ? 'supabase' : 'memory' }, 'api listening'));
