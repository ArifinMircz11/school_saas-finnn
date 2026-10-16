import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { sessionSchema, classSchema, sectionSchema, subjectSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

// ---------- SESSIONS ----------
export async function listSessions(req: Request, res: Response) {
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: schoolOf(req), deletedAt: null }, orderBy: { startDate: 'desc' } });
  return ok(res, sessions, 'Sessions fetched');
}
export async function createSession(req: Request, res: Response) {
  const body = sessionSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const session = await prisma.academicSession.create({ data: { schoolId, name: body.name, startDate: new Date(body.startDate), endDate: new Date(body.endDate), isActive: body.isActive || false } });
  if (body.isActive) {
    await prisma.academicSession.updateMany({ where: { schoolId, id: { not: session.id } }, data: { isActive: false } });
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SESSION', module: 'ACADEMIC' });
  return created(res, session, 'Session created');
}
export async function setActiveSession(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const target = await prisma.academicSession.findFirst({ where: { id: req.params.id, schoolId, deletedAt: null } });
  if (!target) throw new ApiError(404, 'Academic session not found');
  await prisma.$transaction(async (tx) => {
    await tx.academicSession.updateMany({ where: { schoolId, id: { not: target.id } }, data: { isActive: false } });
    await tx.academicSession.update({ where: { id: target.id }, data: { isActive: true } });
  });
  const session = await prisma.academicSession.findUnique({ where: { id: target.id } });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ACTIVATE_SESSION', module: 'ACADEMIC', details: { sessionId: target.id } });
  return ok(res, session, 'Session activated');
}

// ---------- CLASSES ----------
export async function listClasses(req: Request, res: Response) {
  const classes = await prisma.class.findMany({
    where: { schoolId: schoolOf(req) },
    include: { sections: true, _count: { select: { students: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return ok(res, classes, 'Classes fetched');
}
export async function createClass(req: Request, res: Response) {
  const body = classSchema.parse(req.body);
  const cls = await prisma.class.create({ data: { schoolId: schoolOf(req), name: body.name } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_CLASS', module: 'ACADEMIC' });
  return created(res, cls, 'Class created');
}

// ---------- SECTIONS ----------
export async function createSection(req: Request, res: Response) {
  const body = sectionSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId } });
  if (!cls) throw new ApiError(404, 'Class not found');
  const section = await prisma.section.create({ data: { schoolId, classId: body.classId, name: body.name } });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SECTION', module: 'ACADEMIC' });
  return created(res, section, 'Section created');
}

// ---------- SUBJECTS ----------
export async function listSubjects(req: Request, res: Response) {
  const subjects = await prisma.subject.findMany({ where: { schoolId: schoolOf(req) }, include: { _count: true }, orderBy: { name: 'asc' } });
  return ok(res, subjects, 'Subjects fetched');
}
export async function createSubject(req: Request, res: Response) {
  const body = subjectSchema.parse(req.body);
  const subject = await prisma.subject.create({ data: { schoolId: schoolOf(req), name: body.name, code: body.code } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_SUBJECT', module: 'ACADEMIC' });
  return created(res, subject, 'Subject created');
}

// ---------- DASHBOARD BOOTSTRAP (classes + sections + subjects) ----------
export async function getAcademicProfile(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const sessions = await prisma.academicSession.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' } });
  const classes = await prisma.class.findMany({ where: { schoolId }, include: { sections: true } });
  const subjects = await prisma.subject.findMany({ where: { schoolId } });
  return ok(res, { sessions, classes, subjects }, 'Academic profile fetched');
}
