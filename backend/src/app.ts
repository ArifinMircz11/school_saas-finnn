import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import config from './config';
import router from './routes';
import { errorHandler, notFound } from './utils/response';
import { apiLimiter } from './middleware/rateLimiter';
import { requireAuth, requireRole } from './middleware/auth';

export const app = express();

app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.nodeEnv === 'production' ? { maxAge: 31536000 } : false,
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.clientUrls.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
  credentials: true,
}));

app.use(compression() as unknown as import('express').RequestHandler);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Apply API rate limiting before every API endpoint, including health diagnostics.
app.use('/api', apiLimiter);

app.get('/api/firestore-health', requireAuth, requireRole('SUPER_ADMIN'), async (_req: Request, res: Response) => {
  const { testFirestoreConnection } = await import('./config/firestore');
  const result = await testFirestoreConnection();
  res.status(result.success ? 200 : 503).json(result);
});

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);
