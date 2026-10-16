import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { sessionSchema, classSchema, sectionSchema, subjectSchema } from '../validators';
import { auditLog } from '../utils/audit';

type Doc = Record<string, any>;

function schoolOf(req: Request): string {
  const schoolId = req.auth?.schoolId;
  if (!schoolId) throw new ApiError(403, 'School context required');
  return schoolId;
}

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function listDocs(schoolId: string, name: string, field?: string, value?: unknown): Promise<Doc[]> {
  let query: FirebaseFirestore.Query = collection(schoolId, name);
  if (field) query = query.where(field, '==', value);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function findDoc(schoolId: string, name: string, id: string): Promise<Doc | null> {
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function createDoc(schoolId: string, name: string, data: Doc): Promise<Doc> {
  const id = randomUUID();
  const value = { ...data, id, schoolId };
  await collection(schoolId, name).doc(id).create(value);
  return value;
}

function dateValue(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
  return 0;
}

// ---------- SESSIONS ----------
export async function listSessions(req: Request, res: Response) {
  const sessions = (await listDocs(schoolOf(req), 'academicSessions'))
    .filter((item) => item.deletedAt == null)
    .sort((a, b) => dateValue(b.startDate) - dateValue(a.startDate));
  return ok(res, sessions, 'Sessions fetched');
}

export async function createSession(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const body = sessionSchema.parse(req.body);
  const session = await createDoc(schoolId, 'academicSessions', {
    name: body.name,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    isActive: body.isActive || false,
    createdAt: new Date(),
    deletedAt: null,
  });
  if (body.isActive) {
    const active = await collection(schoolId, 'academicSessions').where('isActive', '==', true).get();
    const previous = active.docs.filter((doc) => doc.id !== session.id);
    if (previous.length) {
      const batch = dbOrThrow().batch();
      previous.forEach((doc) => batch.update(doc.ref, { isActive: false }));
      await batch.commit();
    }
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SESSION', module: 'ACADEMIC' });
  return created(res, session, 'Session created');
}

export async function setActiveSession(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const target = await findDoc(schoolId, 'academicSessions', req.params.id);
  if (!target) throw new ApiError(404, 'Session not found');
  const sessions = await collection(schoolId, 'academicSessions').get();
  const batch = dbOrThrow().batch();
  sessions.docs.forEach((doc) => batch.update(doc.ref, { isActive: doc.id === req.params.id }));
  await batch.commit();
  return ok(res, { ...target, isActive: true }, 'Session activated');
}

// ---------- CLASSES ----------
async function classesWithRelations(schoolId: string): Promise<Doc[]> {
  const classes = await listDocs(schoolId, 'classes');
  return Promise.all(classes.map(async (cls) => {
    const [sections, students] = await Promise.all([
      listDocs(schoolId, 'sections', 'classId', cls.id),
      listDocs(schoolId, 'students', 'classId', cls.id),
    ]);
    return { ...cls, sections, _count: { students: students.length } };
  }));
}

export async function listClasses(req: Request, res: Response) {
  const classes = (await classesWithRelations(schoolOf(req)))
    .sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt));
  return ok(res, classes, 'Classes fetched');
}

export async function createClass(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const body = classSchema.parse(req.body);
  const duplicate = (await listDocs(schoolId, 'classes', 'name', body.name)).length > 0;
  if (duplicate) throw new ApiError(409, 'Class name already exists');
  const cls = await createDoc(schoolId, 'classes', { name: body.name, createdAt: new Date() });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_CLASS', module: 'ACADEMIC' });
  return created(res, cls, 'Class created');
}

// ---------- SECTIONS ----------
export async function createSection(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const body = sectionSchema.parse(req.body);
  const cls = await findDoc(schoolId, 'classes', body.classId);
  if (!cls) throw new ApiError(403, 'Tenant mismatch');
  const existingSections = await listDocs(schoolId, 'sections', 'classId', body.classId);
  if (existingSections.some((section) => section.name === body.name)) {
    throw new ApiError(409, 'Section name already exists in this class');
  }
  const section = await createDoc(schoolId, 'sections', {
    classId: body.classId,
    name: body.name,
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SECTION', module: 'ACADEMIC' });
  return created(res, section, 'Section created');
}

// ---------- SUBJECTS ----------
async function subjectsWithCounts(schoolId: string): Promise<Doc[]> {
  const subjects = await listDocs(schoolId, 'subjects');
  return Promise.all(subjects.map(async (subject) => {
    const [teachers, exams, timetables, homework] = await Promise.all([
      listDocs(schoolId, 'teacherSubjects', 'subjectId', subject.id),
      listDocs(schoolId, 'examSubjects', 'subjectId', subject.id),
      listDocs(schoolId, 'timetables', 'subjectId', subject.id),
      listDocs(schoolId, 'homework', 'subjectId', subject.id),
    ]);
    return { ...subject, _count: { teachers: teachers.length, exams: exams.length, timetables: timetables.length, homework: homework.length } };
  }));
}

export async function listSubjects(req: Request, res: Response) {
  const subjects = (await subjectsWithCounts(schoolOf(req))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return ok(res, subjects, 'Subjects fetched');
}

export async function createSubject(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const body = subjectSchema.parse(req.body);
  const duplicate = (await listDocs(schoolId, 'subjects', 'name', body.name)).length > 0;
  if (duplicate) throw new ApiError(409, 'Subject name already exists');
  const subject = await createDoc(schoolId, 'subjects', { name: body.name, code: body.code });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SUBJECT', module: 'ACADEMIC' });
  return created(res, subject, 'Subject created');
}

// ---------- DASHBOARD BOOTSTRAP (classes + sections + subjects) ----------
export async function getAcademicProfile(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [sessions, classes, subjects] = await Promise.all([
    listDocs(schoolId, 'academicSessions'),
    classesWithRelations(schoolId),
    listDocs(schoolId, 'subjects'),
  ]);
  sessions.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  return ok(res, { sessions, classes, subjects }, 'Academic profile fetched');
}
