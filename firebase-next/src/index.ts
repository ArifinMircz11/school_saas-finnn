import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
}));

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

const rolesByCollection: Record<z.infer<typeof collectionSchema>, { read: string[]; write: string[] }> = {
  students: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN'] },
  teachers: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN'] },
  classes: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN', 'PRINCIPAL'] },
  attendance: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'] },
  notices: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN', 'PRINCIPAL'] },
  homework: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'] },
  exams: { read: ['SCHOOL_ADMIN', 'PRINCIPAL'], write: ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'] },
  feeRecords: { read: ['SCHOOL_ADMIN'], write: ['SCHOOL_ADMIN'] },
};

const recordSchemas = {
  students: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    admissionNumber: z.string().trim().min(1).max(50).optional(),
    classId: z.string().trim().min(1).max(128).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).optional(),
  }).strict(),
  teachers: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().email().max(254).optional(),
    employeeCode: z.string().trim().min(1).max(50).optional(),
    subjectIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  }).strict(),
  classes: z.object({
    name: z.string().trim().min(1).max(100),
    section: z.string().trim().max(50).optional(),
    academicYear: z.string().trim().min(4).max(20).optional(),
  }).strict(),
  attendance: z.object({
    studentId: z.string().trim().min(1).max(128),
    date: z.string().datetime({ offset: true }),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']),
    note: z.string().trim().max(1000).optional(),
  }).strict(),
  notices: z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    audience: z.enum(['ALL', 'STUDENTS', 'TEACHERS', 'PARENTS']).default('ALL'),
    published: z.boolean().default(false),
  }).strict(),
  homework: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).optional(),
    classId: z.string().trim().min(1).max(128),
    dueAt: z.string().datetime({ offset: true }).optional(),
  }).strict(),
  exams: z.object({
    title: z.string().trim().min(1).max(200),
    classId: z.string().trim().min(1).max(128).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
  }).strict(),
  feeRecords: z.object({
    studentId: z.string().trim().min(1).max(128),
    amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['DUE', 'PARTIAL', 'PAID', 'WAIVED']).default('DUE'),
    dueAt: z.string().datetime({ offset: true }).optional(),
  }).strict(),
};
app.get('/v1/:collection', requireFirebaseIdentity, async (req: AuthenticatedRequest, res) => {
  const parsed = collectionSchema.safeParse(req.params.collection);
  if (!parsed.success) return res.status(404).json({ error: 'Collection is not exposed by this API.' });
  if (!rolesByCollection[parsed.data].read.some((role) => req.principal!.roles.includes(role))) {
    return res.status(403).json({ error: 'Your role cannot read records in this collection.' });
  }
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
  if (!rolesByCollection[parsedCollection.data].write.some((role) => req.principal!.roles.includes(role))) {
    return res.status(403).json({ error: 'Your role cannot create records in this collection.' });
  }
  const parsedRecord = recordSchemas[parsedCollection.data].safeParse(req.body);
  if (!parsedRecord.success) {
    return res.status(400).json({
      error: 'Record validation failed.',
      issues: parsedRecord.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

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