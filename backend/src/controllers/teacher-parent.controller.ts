import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { teacherSchema, parentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { schoolOf } from './student.controller';

// ---------- TEACHERS ----------
export async function listTeachers(req: Request, res: Response) {
  const teachers = await prisma.teacher.findMany({
    where: { schoolId: schoolOf(req) },
    include: { sections: { include: { section: true } }, subjects: { include: { subject: true } } },
    orderBy: { firstName: 'asc' },
  });
  return ok(res, teachers, 'Teachers fetched');
}

export async function createTeacher(req: Request, res: Response) {
  const body = teacherSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const teacherCount = await prisma.teacher.count({ where: { schoolId } });
  if (school && teacherCount >= school.maxTeachers) throw new ApiError(400, 'Teacher limit reached');

  // Generate the temp password hashes up-front (bcrypt is slow and must not
  // hold the interactive transaction open past the hosted-Postgres timeout).
  const tempHash = body.email ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  const teacher = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (body.email) {
      const email = body.email.toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({ data: { schoolId, email, firstName: body.firstName, lastName: body.lastName, passwordHash: tempHash!, roles: { create: [{ role: 'TEACHER' }] } } });
      }
      userId = user.id;
    }
    return tx.teacher.create({
      data: {
        schoolId, userId, firstName: body.firstName, lastName: body.lastName,
        phone: body.phone, designation: body.designation, empCode: `TCH-${Math.floor(100000 + Math.random() * 899999)}`,
        sections: body.sectionIds ? { create: body.sectionIds.map((sid) => ({ sectionId: sid })) } : undefined,
        subjects: body.subjectIds ? { create: body.subjectIds.map((sid) => ({ subjectId: sid })) } : undefined,
      },
    });
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_TEACHER', module: 'TEACHERS' });
  return created(res, teacher, 'Teacher created');
}

// ---------- PARENTS ----------
export async function listParents(req: Request, res: Response) {
  const parents = await prisma.parent.findMany({
    where: { schoolId: schoolOf(req) }, include: { children: { include: { student: true } } }, orderBy: { firstName: 'asc' },
  });
  return ok(res, parents, 'Parents fetched');
}

export async function createParent(req: Request, res: Response) {
  const body = parentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  // Generate the temp password hash up-front (slow bcrypt outside the txn).
  const tempHash = body.email ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  const parent = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (body.email) {
      const email = body.email.toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({ data: { schoolId, email, firstName: body.firstName, lastName: body.lastName, passwordHash: tempHash!, roles: { create: [{ role: 'PARENT' }] } } });
      }
      userId = user.id;
    }
    return tx.parent.create({
      data: {
        schoolId, userId, firstName: body.firstName, lastName: body.lastName, phone: body.phone,
        children: body.studentIds ? { create: body.studentIds.map((sid) => ({ studentId: sid, relationship: 'PARENT', isPrimary: false })) } : undefined,
      },
    });
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_PARENT', module: 'PARENTS' });
  return ok(res, parent, 'Parent created');
}

// ---------- STAFF ----------
export async function listStaff(req: Request, res: Response) {
  const staff = await prisma.staff.findMany({ where: { schoolId: schoolOf(req) }, orderBy: { firstName: 'asc' } });
  return ok(res, staff, 'Staff fetched');
}