import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok } from '../utils/response';
import { markAttendanceSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function tenantCollection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

function sameDay(left: any, right: Date): boolean {
  const time = millis(left);
  return Number.isFinite(time) && time >= right.getTime() && time < right.getTime() + 24 * 60 * 60 * 1000;
}

async function studentWithRelations(schoolId: string, studentId: string) {
  const db = dbOrThrow();
  const studentRef = tenantCollection(schoolId, 'students').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) return null;
  const student: any = { id: studentSnap.id, ...studentSnap.data() };
  const [classSnap, sectionSnap] = await Promise.all([
    student.classId ? tenantCollection(schoolId, 'classes').doc(student.classId).get() : Promise.resolve(null),
    student.sectionId ? tenantCollection(schoolId, 'sections').doc(student.sectionId).get() : Promise.resolve(null),
  ]);
  student.class = classSnap?.exists ? { id: classSnap.id, ...classSnap.data() } : null;
  student.section = sectionSnap?.exists ? { id: sectionSnap.id, ...sectionSnap.data() } : null;
  return student;
}

/** Teacher marks attendance for a section on a date. */
export async function markAttendance(req: Request, res: Response) {
  const body = markAttendanceSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const date = new Date(body.date);
  date.setHours(0, 0, 0, 0);
  let count = 0;
  const db = dbOrThrow();

  for (const rec of body.records) {
    const student = await tenantCollection(schoolId, 'students').doc(rec.studentId).get();
    if (!student.exists) continue;

    const existing = await tenantCollection(schoolId, 'attendances').where('studentId', '==', rec.studentId).get();
    const attendance = existing.docs.find((doc) => sameDay(doc.get('date'), date));
    if (attendance) {
      await attendance.ref.update({ status: rec.status, remarks: rec.remarks ?? null, markedBy: req.auth?.sub ?? null });
    } else {
      const id = randomUUID();
      await tenantCollection(schoolId, 'attendances').doc(id).create({
        id,
        schoolId,
        studentId: rec.studentId,
        date,
        status: rec.status,
        remarks: rec.remarks ?? null,
        markedBy: req.auth?.sub ?? null,
        createdAt: new Date(),
      });
    }
    count++;
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'MARK_ATTENDANCE', module: 'ATTENDANCE', details: { date: body.date, count } });
  return ok(res, { marked: count }, 'Attendance marked');
}

export async function getAttendance(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { date, sectionId, studentId } = req.query as { date?: string; sectionId?: string; studentId?: string };
  if (sectionId && studentId) throw new ApiError(400, 'Provide either sectionId or studentId, not both');

  let sectionStudentIds: Set<string> | null = null;
  if (sectionId) {
    const section = await tenantCollection(schoolId, 'sections').doc(sectionId).get();
    if (!section.exists) throw new ApiError(404, 'Section not found');
    const students = await tenantCollection(schoolId, 'students').where('sectionId', '==', sectionId).get();
    sectionStudentIds = new Set(students.docs.map((doc) => doc.id));
  }

  const snapshot = await tenantCollection(schoolId, 'attendances').get();
  let records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
  if (studentId) records = records.filter((record) => record.studentId === studentId);
  if (sectionStudentIds) records = records.filter((record) => sectionStudentIds!.has(record.studentId));
  if (date) {
    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    records = records.filter((record) => sameDay(record.date, selected));
  }

  records.sort((a, b) => millis(b.date) - millis(a.date));
  const withStudents = await Promise.all(records.map(async (record) => ({
    ...record,
    student: await studentWithRelations(schoolId, record.studentId),
  })));
  return ok(res, withStudents, 'Attendance fetched');
}

export async function attendanceSummary(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const studentId = req.query.studentId as string | undefined;
  const snapshot = await tenantCollection(schoolId, 'attendances').get();
  const records = snapshot.docs
    .map((doc) => doc.data())
    .filter((record: any) => !studentId || record.studentId === studentId);
  const total = records.length;
  const present = records.filter((record: any) => record.status === 'PRESENT').length;
  const percent = total ? Math.round((present / total) * 100) : 0;
  return ok(res, { total, present, absents: total - present, iconapp: 0, percent }, 'Attendance summary fetched');
}
