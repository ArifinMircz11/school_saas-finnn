import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { timetableSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function getDoc(schoolId: string, name: string, id: string) {
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as any : null;
}

async function listDocs(schoolId: string, name: string) {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
}

async function hydrateEntry(schoolId: string, entry: any) {
  const [section, subject, teacher] = await Promise.all([
    getDoc(schoolId, 'sections', entry.sectionId),
    getDoc(schoolId, 'subjects', entry.subjectId),
    getDoc(schoolId, 'teachers', entry.teacherId),
  ]);
  const cls = section?.classId ? await getDoc(schoolId, 'classes', section.classId) : null;
  return { ...entry, section: section ? { ...section, class: cls } : null, subject, teacher };
}

export async function createTimetableEntry(req: Request, res: Response) {
  const body = timetableSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const [section, subject, teacher] = await Promise.all([
    getDoc(schoolId, 'sections', body.sectionId),
    getDoc(schoolId, 'subjects', body.subjectId),
    getDoc(schoolId, 'teachers', body.teacherId),
  ]);
  if (!section) throw new ApiError(404, 'Section not found');
  if (!subject) throw new ApiError(404, 'Subject not found');
  if (!teacher) throw new ApiError(404, 'Teacher not found');

  // Preserve the existing warning behavior: conflicts are allowed but surfaced in the response message.
  const entries = await listDocs(schoolId, 'timetables');
  const conflict = entries.some((entry) => entry.day === body.day && entry.startTime === body.startTime
    && (entry.teacherId === body.teacherId || entry.sectionId === body.sectionId));
  const id = randomUUID();
  const entry = {
    id, schoolId, sectionId: body.sectionId, subjectId: body.subjectId, teacherId: body.teacherId,
    day: body.day, startTime: body.startTime, endTime: body.endTime, createdAt: new Date(),
  };
  await collection(schoolId, 'timetables').doc(id).create(entry);
  if (conflict) return created(res, entry, 'Timetable entry created (conflict allowed after warning)');
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_TIMETABLE', module: 'TIMETABLE' });
  return created(res, entry, 'Timetable entry created');
}

export async function getTimetable(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { sectionId, teacherId, day, studentId } = req.query as { sectionId?: string; teacherId?: string; day?: string; studentId?: string };
  let entries = await listDocs(schoolId, 'timetables');
  if (sectionId) entries = entries.filter((entry) => entry.sectionId === sectionId);
  if (teacherId) entries = entries.filter((entry) => entry.teacherId === teacherId);
  if (day) entries = entries.filter((entry) => entry.day === day);
  if (studentId) {
    const student = await getDoc(schoolId, 'students', studentId);
    if (!student) throw new ApiError(404, 'Student not found');
    entries = entries.filter((entry) => entry.sectionId === student.sectionId || entry.sectionId === student.classId);
  }
  const hydrated = await Promise.all(entries.map((entry) => hydrateEntry(schoolId, entry)));
  hydrated.sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.startTime).localeCompare(String(b.startTime)));
  const grouped = hydrated.reduce((acc: any, entry) => {
    (acc[entry.day] = acc[entry.day] || []).push(entry);
    return acc;
  }, {});
  return ok(res, { entries: hydrated, grouped }, 'Timetable fetched');
}
