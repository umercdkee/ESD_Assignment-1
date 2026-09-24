import pino from 'pino';

// Keep request and error logs structured so Part C can collect them directly.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'pennywise-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'err.body', 'body', 'password', 'email'],
});
