import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { sessionSchema, classSchema, sectionSchema, subjectSchema } from '../validators';
import { auditLog } from '../utils/audit';

function schoolOf(req: Request): string {
  return req.auth?.schoolId!;
}

// ---------- SESSIONS ----------
export async function listSessions(req: Request, res: Response) {
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: schoolOf(req), deletedAt: null }, orderBy: { startDate: 'desc' } });
  return ok(res, sessions, 'Sessions fetched');
}
export async function createSession(req: Request, res: Response) {
  const body = sessionSchema.parse(req.body);
  const session = await prisma.academicSession.create({ data: { schoolId: schoolOf(req), name: body.name, startDate: new Date(body.startDate), endDate: new Date(body.endDate), isActive: body.isActive || false } });
  if (body.isActive) {
    await prisma.academicSession.updateMany({ where: { schoolId: schoolOf(req), id: { not: session.id } }, data: { isActive: false } });
  }
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_SESSION', module: 'ACADEMIC' });
  return created(res, session, 'Session created');
}
export async function setActiveSession(req: Request, res: Response) {
  await prisma.academicSession.updateMany({ where: { schoolId: schoolOf(req) }, data: { isActive: false } });
  const session = await prisma.academicSession.update({ where: { id: req.params.id }, data: { isActive: true } });
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
  const cls = await prisma.class.findUnique({ where: { id: body.classId } });
  if (!cls || cls.schoolId !== schoolOf(req)) throw new ApiError(403, 'Tenant mismatch');
  const section = await prisma.section.create({ data: { schoolId: schoolOf(req), classId: body.classId, name: body.name } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_SECTION', module: 'ACADEMIC' });
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