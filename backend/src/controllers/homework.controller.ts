import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { homeworkSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { notifySection } from '../services/notification.service';
import { uploadToStorage } from '../middleware/upload';

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

async function findByField(schoolId: string, name: string, field: string, value: unknown) {
  const snapshot = await collection(schoolId, name).where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
}

async function hydrateHomework(schoolId: string, homework: any) {
  const [subject, teacher, section, submissions] = await Promise.all([
    getDoc(schoolId, 'subjects', homework.subjectId),
    getDoc(schoolId, 'teachers', homework.teacherId),
    homework.sectionId ? getDoc(schoolId, 'sections', homework.sectionId) : Promise.resolve(null),
    findByField(schoolId, 'homeworkSubmissions', 'homeworkId', homework.id),
  ]);
  const hydratedSubmissions = await Promise.all(submissions.map(async (submission) => ({
    ...submission,
    student: await getDoc(schoolId, 'students', submission.studentId),
  })));
  return { ...homework, subject, teacher, section, submissions: hydratedSubmissions };
}

/** Teacher creates homework for their section/subject. */
export async function createHomework(req: Request, res: Response) {
  const body = homeworkSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const teachers = await findByField(schoolId, 'teachers', 'userId', req.auth!.sub);
  const teacher = teachers[0];
  if (!teacher) throw new ApiError(403, 'Teacher account required');

  const subject = await getDoc(schoolId, 'subjects', body.subjectId!);
  if (!subject) throw new ApiError(404, 'Subject not found');
  if (body.sectionId && !(await getDoc(schoolId, 'sections', body.sectionId))) {
    throw new ApiError(404, 'Section not found');
  }
  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework') : null;
  const id = randomUUID();
  const homework = {
    id, schoolId, teacherId: teacher.id, sectionId: body.sectionId ?? null, subjectId: body.subjectId!,
    title: body.title, description: body.description ?? null, attachmentUrl,
    dueDate: new Date(body.dueDate), published: true, createdAt: new Date(),
  };
  await collection(schoolId, 'homeworks').doc(id).create(homework);
  if (body.sectionId) await notifySection(schoolId, body.sectionId, 'New Homework', `New homework assigned: ${body.title}`);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_HOMEWORK', module: 'HOMEWORK' });
  return created(res, homework, 'Homework created');
}

export async function listHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { sectionId } = req.query as { sectionId?: string };
  let homework = (await listDocs(schoolId, 'homeworks')).filter((item) => item.published === true);
  if (sectionId) homework = homework.filter((item) => item.sectionId === sectionId);
  homework.sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
  return ok(res, await Promise.all(homework.map((item) => hydrateHomework(schoolId, item))), 'Homework fetched');
}

/** Student submits homework. */
export async function submitHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const students = await findByField(schoolId, 'students', 'userId', req.auth!.sub);
  const student = students[0];
  if (!student) throw new ApiError(403, 'Student account required');
  const hw = await getDoc(schoolId, 'homeworks', req.params.id);
  if (!hw || hw.schoolId !== schoolId) throw new ApiError(404, 'Homework not found');

  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework-submissions') : null;
  const existing = (await findByField(schoolId, 'homeworkSubmissions', 'homeworkId', hw.id))
    .find((item) => item.studentId === student.id);
  const now = new Date();
  if (existing) {
    const patch = { content: req.body.content || null, attachmentUrl, submittedAt: now };
    await collection(schoolId, 'homeworkSubmissions').doc(existing.id).update(patch);
    return created(res, { ...existing, ...patch }, 'Homework submitted');
  }
  const id = randomUUID();
  const submission = {
    id, homeworkId: hw.id, studentId: student.id, content: req.body.content || null,
    attachmentUrl, submittedAt: now, marks: null, feedback: null,
  };
  await collection(schoolId, 'homeworkSubmissions').doc(id).create(submission);
  return created(res, submission, 'Homework submitted');
}

/** Teacher grades a submission. */
export async function gradeHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const submission = await getDoc(schoolId, 'homeworkSubmissions', req.params.id);
  if (!submission) throw new ApiError(404, 'Submission not found');
  const homework = await getDoc(schoolId, 'homeworks', submission.homeworkId);
  const teacher = homework ? await getDoc(schoolId, 'teachers', homework.teacherId) : null;
  if (!homework || teacher?.userId !== req.auth!.sub) throw new ApiError(403, 'Not your homework');

  const body = req.body || {};
  const patch = {
    marks: body.marks ?? submission.marks,
    feedback: body.feedback ?? submission.feedback,
  };
  await collection(schoolId, 'homeworkSubmissions').doc(submission.id).update(patch);
  return ok(res, { ...submission, ...patch }, 'Submission graded');
}
