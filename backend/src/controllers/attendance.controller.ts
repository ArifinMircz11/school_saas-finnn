import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { markAttendanceSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

/** Teacher marks attendance for a section on a date. */
export async function markAttendance(req: Request, res: Response) {
  const body = markAttendanceSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const date = new Date(body.date);
  date.setHours(0, 0, 0, 0);
  let count = 0;
  for (const rec of body.records) {
    const student = await prisma.student.findUnique({ where: { id: rec.studentId } });
    if (!student || student.schoolId !== schoolId) continue;
    const existing = await prisma.attendance.findUnique({ where: { studentId_date: { studentId: rec.studentId, date } } });
    if (existing) {
      await prisma.attendance.update({ where: { id: existing.id }, data: { status: rec.status, remarks: rec.remarks, markedBy: req.auth?.sub } });
    } else {
      await prisma.attendance.create({ data: { schoolId, studentId: rec.studentId, date, status: rec.status, remarks: rec.remarks, markedBy: req.auth?.sub } });
    }
    count++;
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'MARK_ATTENDANCE', module: 'ATTENDANCE', details: { date: body.date, count } });
  return ok(res, { marked: count }, 'Attendance marked');
}

export async function getAttendance(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { date, sectionId, studentId } = req.query as { date?: string; sectionId?: string; studentId?: string };
  const where: any = { schoolId };
  if (sectionId && studentId) throw new ApiError(400, 'Provide either sectionId or studentId, not both');
  if (studentId) {
    where.studentId = studentId;
  } else if (sectionId) {
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section || section.schoolId !== schoolId) throw new ApiError(404, 'Section not found');
    where.student = { sectionId };
  }
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    where.date = d;
  }
  const records = await prisma.attendance.findMany({ where, include: { student: { include: { class: true, section: true } } }, orderBy: { date: 'desc' } });
  return ok(res, records, 'Attendance fetched');
}

export async function attendanceSummary(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const studentId = req.query.studentId as string | undefined;
  const where: any = { schoolId };
  if (studentId) where.studentId = studentId;
  const records = await prisma.attendance.findMany({ where, select: { status: true } });
  const total = records.length;
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const percent = total ? Math.round((present / total) * 100) : 0;
  return ok(res, { total, present, absents: total - present, iconapp: 0, percent }, 'Attendance summary fetched');
}