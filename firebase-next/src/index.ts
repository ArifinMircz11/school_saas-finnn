import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

const projectId = process.env.FIREBASE_NEXT_PROJECT_ID;
const databaseId = process.env.FIREBASE_NEXT_DATABASE_ID;
const port = Number(process.env.FIREBASE_NEXT_PORT || 5100);
const allowedOrigins = (process.env.FIREBASE_NEXT_CLIENT_URLS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!projectId || !databaseId) {
  throw new Error('FIREBASE_NEXT_PROJECT_ID and FIREBASE_NEXT_DATABASE_ID must be configured.');
}

const appName = 'school-saas-firebase-next';
const existing = getApps().find((item) => item.name === appName);
const firebaseApp = existing || initializeApp({
  credential: applicationDefault(),
  projectId,
}, appName);
const db: Firestore = getFirestore(firebaseApp, databaseId);

type AuthenticatedRequest = Request & {
  principal?: { uid: string; tenantId: string; roles: string[] };
};

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    await db.collection('_system').doc('health').get();
    res.status(200).json({ ok: true, service: 'firebase-next', databaseId });
  } catch {
    res.status(503).json({ ok: false, service: 'firebase-next', message: 'Firestore connection check failed.' });
  }
});

async function requireFirebaseIdentity(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Bearer Firebase ID token required.' });

  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(match[1], true);
    const tenantId = typeof decoded.tenantId === 'string' ? decoded.tenantId : '';
    const roles = Array.isArray(decoded.roles) ? decoded.roles.filter((role): role is string => typeof role === 'string') : [];
    if (!tenantId || !roles.length) {
      return res.status(403).json({ error: 'Required tenantId and roles custom claims are missing.' });
    }
    req.principal = { uid: decoded.uid, tenantId, roles };
    return next();
  } catch {
    return res.status(401).json({ error: 'Firebase ID token is invalid or expired.' });
  }
}

const collectionSchema = z.enum([
  'students',
  'teachers',
  'classes',
  'attendance',
  'notices',
  'homework',
  'exams',
  'feeRecords',
]);
const recordSchema = z.record(z.unknown()).refine(
  (record) => !('tenantId' in record) && !('id' in record),
  'tenantId and id are server-managed fields.',
);

app.get('/v1/:collection', requireFirebaseIdentity, async (req: AuthenticatedRequest, res) => {
  const parsed = collectionSchema.safeParse(req.params.collection);
  if (!parsed.success) return res.status(404).json({ error: 'Collection is not exposed by this API.' });
  try {
    const snapshot = await db.collection(parsed.data)
      .where('tenantId', '==', req.principal!.tenantId)
      .limit(100)
      .get();
    res.json({
      data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      limit: 100,
    });
  } catch {
    res.status(500).json({ error: 'Could not read records from the configured Firestore database.' });
  }
});

app.post('/v1/:collection', requireFirebaseIdentity, async (req: AuthenticatedRequest, res) => {
  const parsedCollection = collectionSchema.safeParse(req.params.collection);
  if (!parsedCollection.success) return res.status(404).json({ error: 'Collection is not exposed by this API.' });
  const parsedRecord = recordSchema.safeParse(req.body);
  if (!parsedRecord.success) return res.status(400).json({ error: 'Invalid record. id and tenantId are server-managed.' });

  try {
    const now = new Date().toISOString();
    const ref = await db.collection(parsedCollection.data).add({
      ...parsedRecord.data,
      tenantId: req.principal!.tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy: req.principal!.uid,
    });
    return res.status(201).json({ id: ref.id, tenantId: req.principal!.tenantId });
  } catch {
    return res.status(500).json({ error: 'Could not create record in the configured Firestore database.' });
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error && err.message === 'Origin not allowed') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Firebase Next API listening on port ${port}; project=${projectId}; database=${databaseId}`);
});