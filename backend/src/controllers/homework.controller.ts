import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { homeworkSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { notifySection } from '../services/notification.service';
import { uploadToStorage } from '../middleware/upload';

/** Teacher creates homework for their section/subject. */
export async function createHomework(req: Request, res: Response) {
  const body = homeworkSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const teacher = await prisma.teacher.findFirst({ where: { userId: req.auth!.sub } });
  if (!teacher) throw new ApiError(403, 'Teacher account required');
  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework') : null;
  const homework = await prisma.homework.create({
    data: { schoolId, teacherId: teacher.id, sectionId: body.sectionId, subjectId: body.subjectId!, title: body.title, description: body.description, attachmentUrl, dueDate: new Date(body.dueDate), published: true },
  });
  if (body.sectionId) {
    await notifySection(schoolId, body.sectionId, 'New Homework', `New homework assigned: ${body.title}`);
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_HOMEWORK', module: 'HOMEWORK' });
  return created(res, homework, 'Homework created');
}

export async function listHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { sectionId } = req.query as { sectionId?: string };
  const where: any = { schoolId, published: true };
  if (sectionId) where.sectionId = sectionId;
  const homework = await prisma.homework.findMany({ where, include: { subject: true, teacher: true, section: true, submissions: { include: { student: true } } }, orderBy: { createdAt: 'desc' } });
  return ok(res, homework, 'Homework fetched');
}

/** Student submits homework. */
export async function submitHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub } });
  if (!student) throw new ApiError(403, 'Student account required');
  const hw = await prisma.homework.findUnique({ where: { id: req.params.id } });
  if (!hw || hw.schoolId !== schoolId) throw new ApiError(404, 'Homework not found');
  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework-submissions') : null;
  const existing = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: hw.id, studentId: student.id } } });
  const submission = existing
    ? await prisma.homeworkSubmission.update({ where: { id: existing.id }, data: { content: req.body.content || null, attachmentUrl, submittedAt: new Date() } })
    : await prisma.homeworkSubmission.create({ data: { homeworkId: hw.id, studentId: student.id, content: req.body.content || null, attachmentUrl, submittedAt: new Date() } });
  return created(res, submission, 'Homework submitted');
}

/** Teacher grades a submission. */
export async function gradeHomework(req: Request, res: Response) {
  const body = req.body;
  const submission = await prisma.homeworkSubmission.findUnique({ where: { id: req.params.id }, include: { homework: { include: { teacher: true } } } });
  if (!submission || submission.homework.teacher.userId !== req.auth!.sub) throw new ApiError(403, 'Not your homework');
  const updated = await prisma.homeworkSubmission.update({ where: { id: submission.id }, data: { marks: body.marks ?? submission.marks, feedback: body.feedback ?? submission.feedback } });
  return ok(res, updated, 'Submission graded');
}