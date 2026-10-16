import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { timetableSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

export async function createTimetableEntry(req: Request, res: Response) {
  const body = timetableSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const section = await prisma.section.findUnique({ where: { id: body.sectionId } });
  if (!section || section.schoolId !== schoolId) throw new ApiError(404, 'Section not found');
  const subject = await prisma.subject.findUnique({ where: { id: body.subjectId } });
  if (!subject || subject.schoolId !== schoolId) throw new ApiError(404, 'Subject not found');
  const teacher = await prisma.teacher.findUnique({ where: { id: body.teacherId } });
  if (!teacher || teacher.schoolId !== schoolId) throw new ApiError(404, 'Teacher not found');
  // Conflict check: teacher or section already booked at this timeslot.
  const conflict = await prisma.timetable.findFirst({
    where: { schoolId, day: body.day, OR: [
      { teacherId: body.teacherId, startTime: body.startTime },
      { sectionId: body.sectionId, startTime: body.startTime },
    ] },
  });
  if (conflict) {
    const entry = await prisma.timetable.create({ data: { schoolId, sectionId: body.sectionId, subjectId: body.subjectId, teacherId: body.teacherId, day: body.day, startTime: body.startTime, endTime: body.endTime } });
    return created(res, entry, 'Timetable entry created (conflict allowed after warning)');
  }
  const entry = await prisma.timetable.create({ data: { schoolId, sectionId: body.sectionId, subjectId: body.subjectId, teacherId: body.teacherId, day: body.day, startTime: body.startTime, endTime: body.endTime } });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_TIMETABLE', module: 'TIMETABLE' });
  return created(res, entry, 'Timetable entry created');
}

export async function getTimetable(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { sectionId, teacherId, day, studentId } = req.query as { sectionId?: string; teacherId?: string; day?: string; studentId?: string };
  const where: any = { schoolId };
  if (day) where.day = day;
  if (req.auth?.roles.includes('STUDENT')) {
    const student = await prisma.student.findFirst({ where: { userId: req.auth.sub, schoolId, deletedAt: null }, select: { id: true, sectionId: true } });
    if (!student) throw new ApiError(404, 'Student not found');
    if (studentId && studentId !== student.id) throw new ApiError(404, 'Student not found');
    if (sectionId && sectionId !== student.sectionId) throw new ApiError(404, 'Timetable not found');
    if (teacherId) throw new ApiError(403, 'Students cannot query another teacher timetable');
    where.sectionId = student.sectionId || '__no_section__';
  } else if (req.auth?.roles.includes('TEACHER')) {
    const teacher = await prisma.teacher.findFirst({ where: { userId: req.auth.sub, schoolId, deletedAt: null }, select: { id: true } });
    if (!teacher) throw new ApiError(404, 'Teacher not found');
    if (teacherId && teacherId !== teacher.id) throw new ApiError(404, 'Timetable not found');
    where.teacherId = teacher.id;
    if (sectionId) where.sectionId = sectionId;
  } else {
    if (sectionId) {
      if (!await prisma.section.findFirst({ where: { id: sectionId, schoolId }, select: { id: true } })) throw new ApiError(404, 'Section not found');
      where.sectionId = sectionId;
    }
    if (teacherId) {
      if (!await prisma.teacher.findFirst({ where: { id: teacherId, schoolId }, select: { id: true } })) throw new ApiError(404, 'Teacher not found');
      where.teacherId = teacherId;
    }
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { sectionId: true } });
      if (!student) throw new ApiError(404, 'Student not found');
      where.sectionId = student.sectionId || '__no_section__';
    }
  }
  const entries = await prisma.timetable.findMany({
    where, include: { section: { include: { class: true } }, subject: true, teacher: true },
    orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
  });
  const grouped = entries.reduce((acc: any, e) => {
    (acc[e.day] = acc[e.day] || []).push(e);
    return acc;
  }, {});
  return ok(res, { entries, grouped }, 'Timetable fetched');
}