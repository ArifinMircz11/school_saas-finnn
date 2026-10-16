import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { examSchema, examSubjectSchema, enterMarksSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { sendNotification } from '../services/notification.service';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function all(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function one(schoolId: string, name: string, id?: string | null): Promise<Doc | null> {
  if (!id) return null;
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as Doc : null;
}

async function byField(schoolId: string, name: string, field: string, value: unknown): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

async function hydrateExamSubject(schoolId: string, item: Doc) {
  return { ...item, subject: await one(schoolId, 'subjects', item.subjectId) };
}

async function hydrateResult(schoolId: string, result: Doc, includeStudent = true) {
  const [exam, examSubject, student] = await Promise.all([
    one(schoolId, 'exams', result.examId),
    one(schoolId, 'examSubjects', result.examSubjectId),
    includeStudent ? one(schoolId, 'students', result.studentId) : Promise.resolve(null),
  ]);
  const subject = examSubject ? await one(schoolId, 'subjects', examSubject.subjectId) : null;
  return {
    ...result,
    ...(includeStudent ? { student: student ? {
      id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNo: student.admissionNo,
    } : null } : {}),
    exam,
    examSubject: examSubject ? { ...examSubject, subject } : null,
  };
}

// ---------- EXAMS ----------
export async function listExams(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const exams = (await all(schoolId, 'exams')).sort((a, b) => millis(b.startDate) - millis(a.startDate));
  const result = await Promise.all(exams.map(async (exam) => {
    const [subjects, session] = await Promise.all([
      byField(schoolId, 'examSubjects', 'examId', exam.id),
      one(schoolId, 'academicSessions', exam.sessionId),
    ]);
    return { ...exam, subjects: await Promise.all(subjects.map((item) => hydrateExamSubject(schoolId, item))), session };
  }));
  return ok(res, result, 'Exams fetched');
}

export async function createExam(req: Request, res: Response) {
  const body = examSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const id = randomUUID();
  const exam = {
    id, schoolId, name: body.name, sessionId: body.sessionId ?? null,
    startDate: new Date(body.startDate), endDate: new Date(body.endDate), createdAt: new Date(),
  };
  await collection(schoolId, 'exams').doc(id).create(exam);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_EXAM', module: 'EXAMS' });
  return created(res, exam, 'Exam created');
}

// ---------- EXAM SUBJECTS ----------
export async function addExamSubject(req: Request, res: Response) {
  const body = examSubjectSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const exam = await one(schoolId, 'exams', body.examId);
  if (!exam) throw new ApiError(404, 'Exam not found');
  if (!(await one(schoolId, 'subjects', body.subjectId))) throw new ApiError(404, 'Subject not found');

  const existing = (await byField(schoolId, 'examSubjects', 'examId', body.examId))
    .find((item) => item.subjectId === body.subjectId);
  const data = {
    examId: body.examId, subjectId: body.subjectId, maxMarks: body.maxMarks,
    passMarks: body.passMarks, date: body.date ? new Date(body.date) : existing?.date ?? null,
  };
  if (existing) {
    await collection(schoolId, 'examSubjects').doc(existing.id).update(data);
    return created(res, { ...existing, ...data }, 'Exam subject added');
  }
  const id = randomUUID();
  const record = { id, ...data };
  await collection(schoolId, 'examSubjects').doc(id).create(record);
  return created(res, record, 'Exam subject added');
}

// ---------- MARKS ----------
export async function listMarks(req: Request, res: Response) {
  const { examId, examSubjectId } = req.query as { examId?: string; examSubjectId?: string };
  const schoolId = schoolOf(req);
  let marks = await all(schoolId, 'examResults');
  if (examId) marks = marks.filter((item) => item.examId === examId);
  if (examSubjectId) marks = marks.filter((item) => item.examSubjectId === examSubjectId);
  return ok(res, await Promise.all(marks.map((item) => hydrateResult(schoolId, item))), 'Marks fetched');
}

export async function enterMarks(req: Request, res: Response) {
  const body = enterMarksSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const examSubject = await one(schoolId, 'examSubjects', body.examSubjectId);
  const exam = examSubject ? await one(schoolId, 'exams', examSubject.examId) : null;
  if (!examSubject || !exam) throw new ApiError(404, 'Exam subject not found');

  for (const mark of body.marks) {
    if (Number(mark.marksObtained) > Number(examSubject.maxMarks)) throw new ApiError(400, 'Marks exceed max for a student');
    const student = await one(schoolId, 'students', mark.studentId);
    if (!student) throw new ApiError(404, 'Student not found');
    const existing = (await byField(schoolId, 'examResults', 'examSubjectId', body.examSubjectId))
      .find((item) => item.studentId === mark.studentId);
    if (existing) {
      await collection(schoolId, 'examResults').doc(existing.id).update({ marksObtained: String(mark.marksObtained), published: false });
    } else {
      const id = randomUUID();
      await collection(schoolId, 'examResults').doc(id).create({
        id, schoolId, examId: exam.id, examSubjectId: examSubject.id, studentId: mark.studentId,
        marksObtained: String(mark.marksObtained), enteredBy: req.auth?.sub ?? null,
        published: false, createdAt: new Date(),
      });
    }
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ENTER_MARKS', module: 'EXAMS' });
  return ok(res, { entered: body.marks.length }, 'Marks entered');
}

export async function publishResults(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { examId } = req.body as { examId: string };
  const exam = await one(schoolId, 'exams', examId);
  if (!exam) throw new ApiError(404, 'Exam not found');
  const examSubjects = await byField(schoolId, 'examSubjects', 'examId', examId);
  const results = await all(schoolId, 'examResults');
  const ids = new Set(examSubjects.map((item) => item.id));
  const toPublish = results.filter((item) => ids.has(item.examSubjectId) && item.published !== true);
  for (let start = 0; start < toPublish.length; start += 450) {
    const batch = dbOrThrow().batch();
    toPublish.slice(start, start + 450).forEach((item) => batch.update(collection(schoolId, 'examResults').doc(item.id), { published: true }));
    await batch.commit();
  }
  const students = await all(schoolId, 'students');
  for (const student of students) {
    if (!student.userId) continue;
    await sendNotification({ schoolId, userId: student.userId, type: 'RESULT', title: 'Results Published', message: 'Exam results are now available.' });
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'PUBLISH_RESULTS', module: 'EXAMS' });
  return ok(res, null, 'Results published');
}

export async function studentResults(req: Request, res: Response) {
  const { studentId, examId, publishedOnly } = req.query as { studentId?: string; examId?: string; publishedOnly?: string };
  const schoolId = schoolOf(req);
  let results = await all(schoolId, 'examResults');
  const isStudentRole = req.auth?.roles.includes('STUDENT');
  if (isStudentRole && !studentId) {
    const students = await byField(schoolId, 'students', 'userId', req.auth!.sub);
    const student = students[0];
    if (!student) throw new ApiError(404, 'Student not found');
    const links = await all(schoolId, 'studentParents');
    const parentIds = links.filter((item) => item.studentId === student.id).map((item) => item.parentId);
    const siblingIds = parentIds.length
      ? links.filter((item) => parentIds.includes(item.parentId)).map((item) => item.studentId).filter((id) => id !== student.id)
      : [];
    const ids = new Set([student.id, ...siblingIds]);
    results = results.filter((item) => ids.has(item.studentId));
  } else if (isStudentRole && studentId) {
    const student = await one(schoolId, 'students', studentId);
    if (!student) throw new ApiError(404, 'Student not found');
    results = results.filter((item) => item.studentId === studentId);
  }
  if (examId) results = results.filter((item) => item.examId === examId);
  if (publishedOnly === 'true') results = results.filter((item) => item.published === true);
  results.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, await Promise.all(results.map((item) => hydrateResult(schoolId, item))), 'Results fetched');
}
