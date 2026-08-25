import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { examSchema, examSubjectSchema, enterMarksSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { sendNotification } from '../services/notification.service';

// ---------- EXAMS ----------
export async function listExams(req: Request, res: Response) {
  const exams = await prisma.exam.findMany({ where: { schoolId: schoolOf(req) }, include: { subjects: { include: { subject: true } }, session: true }, orderBy: { startDate: 'desc' } });
  return ok(res, exams, 'Exams fetched');
}
export async function createExam(req: Request, res: Response) {
  const body = examSchema.parse(req.body);
  const exam = await prisma.exam.create({ data: { schoolId: schoolOf(req), name: body.name, sessionId: body.sessionId, startDate: new Date(body.startDate), endDate: new Date(body.endDate) } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_EXAM', module: 'EXAMS' });
  return created(res, exam, 'Exam created');
}

// ---------- EXAM SUBJECTS ----------
export async function addExamSubject(req: Request, res: Response) {
  const body = examSubjectSchema.parse(req.body);
  const exam = await prisma.exam.findUnique({ where: { id: body.examId } });
  if (!exam || exam.schoolId !== schoolOf(req)) throw new ApiError(404, 'Exam not found');
  const existing = await prisma.examSubject.findUnique({ where: { examId_subjectId: { examId: body.examId, subjectId: body.subjectId } } });
  const record = existing
    ? await prisma.examSubject.update({ where: { id: existing.id }, data: { maxMarks: body.maxMarks, passMarks: body.passMarks, date: body.date ? new Date(body.date) : undefined } })
    : await prisma.examSubject.create({ data: { examId: body.examId, subjectId: body.subjectId, maxMarks: body.maxMarks, passMarks: body.passMarks, date: body.date ? new Date(body.date) : undefined } });
  return created(res, record, 'Exam subject added');
}
// ---------- MARKS ----------
export async function listMarks(req: Request, res: Response) {
  const { examId, examSubjectId } = req.query as { examId?: string; examSubjectId?: string };
  const where: any = {};
  if (examId) where.examId = examId;
  if (examSubjectId) where.examSubjectId = examSubjectId;
  const marks = await prisma.examResult.findMany({ where, include: { student: true, exam: true, examSubject: { include: { subject: true } } } });
  return ok(res, marks, 'Marks fetched');
}

export async function enterMarks(req: Request, res: Response) {
  const body = enterMarksSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const es = await prisma.examSubject.findUnique({ where: { id: body.examSubjectId } });
  if (!es) throw new ApiError(404, 'Exam subject not found');
  for (const m of body.marks) {
    if (Number(m.marksObtained) > es.maxMarks) throw new ApiError(400, 'Marks exceed max for a student');
    const existing = await prisma.examResult.findUnique({ where: { examSubjectId_studentId: { examSubjectId: body.examSubjectId, studentId: m.studentId } } });
    if (existing) {
      await prisma.examResult.update({ where: { id: existing.id }, data: { marksObtained: m.marksObtained, published: false } });
    } else {
      await prisma.examResult.create({ data: { schoolId, examId: es.examId, examSubjectId: es.id, studentId: m.studentId, marksObtained: m.marksObtained, enteredBy: req.auth?.sub } });
    }
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ENTER_MARKS', module: 'EXAMS' });
  return ok(res, { entered: body.marks.length }, 'Marks entered');
}

export async function publishResults(req: Request, res: Response) {
  const { examId } = req.body as { examId: string };
  const examSubjects = await prisma.examSubject.findMany({ where: { examId }, select: { id: true } });
  for (const es of examSubjects) {
    await prisma.examResult.updateMany({ where: { examSubjectId: es.id }, data: { published: true } });
  }
  const students = await prisma.student.findMany({ where: { schoolId: schoolOf(req) }, select: { userId: true } });
  for (const s of students) {
    if (!s.userId) continue;
    await sendNotification({ schoolId: schoolOf(req), userId: s.userId, type: 'RESULT', title: 'Results Published', message: 'Exam results are now available.' });
  }
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'PUBLISH_RESULTS', module: 'EXAMS' });
  return ok(res, null, 'Results published');
}

export async function studentResults(req: Request, res: Response) {
  const { studentId, examId, publishedOnly } = req.query as { studentId?: string; examId?: string; publishedOnly?: string };
  const schoolId = schoolOf(req);
  const where: any = { schoolId };
  const isStudentRole = req.auth?.roles.includes('STUDENT');
  if (isStudentRole) {
    const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub } });
    if (!student) throw new ApiError(404, 'Student not found');
    where.studentId = student.id;
  } else if (studentId) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
    where.studentId = studentId;
  }
  if (examId) where.examId = examId;
  if (publishedOnly === 'true') where.published = true;
  const results = await prisma.examResult.findMany({
    where, include: { exam: true, examSubject: { include: { subject: true } }, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, results, 'Results fetched');
}