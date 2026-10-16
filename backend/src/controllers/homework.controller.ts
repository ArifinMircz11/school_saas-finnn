import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { homeworkSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { notifySection } from '../services/notification.service';
import { uploadToStorage } from '../middleware/upload';

export async function createHomework(req: Request, res: Response) {
  const body = homeworkSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const teacher = await prisma.teacher.findFirst({ where: { userId: req.auth!.sub, schoolId } });
  if (!teacher) throw new ApiError(403, 'Teacher account required');
  if (body.sectionId) {
    const section = await prisma.section.findFirst({ where: { id: body.sectionId, schoolId } });
    if (!section) throw new ApiError(404, 'Section not found');
  }
  const subject = await prisma.subject.findFirst({ where: { id: body.subjectId!, schoolId } });
  if (!subject) throw new ApiError(404, 'Subject not found');
  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework') : null;
  const homework = await prisma.homework.create({
    data: { schoolId, teacherId: teacher.id, sectionId: body.sectionId, subjectId: body.subjectId!, title: body.title, description: body.description, attachmentUrl, dueDate: new Date(body.dueDate), published: true },
  });
  if (body.sectionId) await notifySection(schoolId, body.sectionId, 'New Homework', `New homework assigned: ${body.title}`);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_HOMEWORK', module: 'HOMEWORK' });
  return created(res, homework, 'Homework created');
}

export async function listHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { sectionId } = req.query as { sectionId?: string };
  const where: any = { schoolId, published: true };
  let submissions: any = { include: { student: true } };
  if (req.auth?.roles.includes('STUDENT')) {
    const student = await prisma.student.findFirst({ where: { userId: req.auth.sub, schoolId, deletedAt: null }, select: { id: true, sectionId: true } });
    if (!student) throw new ApiError(404, 'Student not found');
    if (sectionId && sectionId !== student.sectionId) throw new ApiError(404, 'Homework not found');
    if (student.sectionId) where.sectionId = student.sectionId;
    else where.sectionId = '__no_section__';
    submissions = { where: { studentId: student.id }, include: { student: true } };
  } else if (req.auth?.roles.includes('TEACHER')) {
    const teacher = await prisma.teacher.findFirst({ where: { userId: req.auth.sub, schoolId }, select: { id: true } });
    if (!teacher) throw new ApiError(404, 'Teacher not found');
    where.teacherId = teacher.id;
    if (sectionId) {
      const section = await prisma.section.findFirst({ where: { id: sectionId, schoolId }, select: { id: true } });
      if (!section) throw new ApiError(404, 'Section not found');
      where.sectionId = sectionId;
    }
  } else if (sectionId) {
    const section = await prisma.section.findFirst({ where: { id: sectionId, schoolId }, select: { id: true } });
    if (!section) throw new ApiError(404, 'Section not found');
    where.sectionId = sectionId;
  }
  const homework = await prisma.homework.findMany({ where, include: { subject: true, teacher: true, section: true, submissions }, orderBy: { createdAt: 'desc' } });
  return ok(res, homework, 'Homework fetched');
}

export async function submitHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub, schoolId, deletedAt: null } });
  if (!student) throw new ApiError(403, 'Student account required');
  const hw = await prisma.homework.findFirst({ where: { id: req.params.id, schoolId } });
  if (!hw) throw new ApiError(404, 'Homework not found');
  const attachmentUrl = req.file ? await uploadToStorage(req.file.path, 'homework-submissions') : null;
  const existing = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: hw.id, studentId: student.id } } });
  const submission = existing
    ? await prisma.homeworkSubmission.update({ where: { id: existing.id }, data: { content: req.body.content || null, attachmentUrl, submittedAt: new Date() } })
    : await prisma.homeworkSubmission.create({ data: { homeworkId: hw.id, studentId: student.id, content: req.body.content || null, attachmentUrl, submittedAt: new Date() } });
  return created(res, submission, 'Homework submitted');
}

export async function gradeHomework(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const body = req.body;
  const submission = await prisma.homeworkSubmission.findUnique({ where: { id: req.params.id }, include: { homework: { include: { teacher: true } } } });
  if (!submission || submission.homework.schoolId !== schoolId || submission.homework.teacher.userId !== req.auth!.sub) {
    throw new ApiError(404, 'Homework submission not found');
  }
  const updated = await prisma.homeworkSubmission.update({ where: { id: submission.id }, data: { marks: body.marks ?? submission.marks, feedback: body.feedback ?? submission.feedback } });
  return ok(res, updated, 'Submission graded');
}
