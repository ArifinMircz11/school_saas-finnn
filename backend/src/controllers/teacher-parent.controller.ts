import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { teacherSchema, parentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { schoolOf } from './student.controller';
import { grantTeacherDefaults } from './user.controller';

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
  const sectionIds = [...new Set(body.sectionIds || [])];
  const subjectIds = [...new Set(body.subjectIds || [])];
  const [sections, subjects] = await Promise.all([
    sectionIds.length ? prisma.section.findMany({ where: { id: { in: sectionIds }, schoolId }, select: { id: true } }) : [],
    subjectIds.length ? prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId }, select: { id: true } }) : [],
  ]);
  if (sections.length !== sectionIds.length) throw new ApiError(404, 'One or more sections were not found in this school');
  if (subjects.length !== subjectIds.length) throw new ApiError(404, 'One or more subjects were not found in this school');
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const teacherCount = await prisma.teacher.count({ where: { schoolId } });
  if (school && teacherCount >= school.maxTeachers) throw new ApiError(400, 'Teacher limit reached');
  const tempHash = body.email ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  let createdUserId: string | undefined;
  const teacher = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (body.email) {
      const email = body.email.toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (user && user.schoolId !== schoolId) throw new ApiError(409, 'Email is already assigned to another school');
      if (!user) {
        user = await tx.user.create({ data: { schoolId, email, firstName: body.firstName, lastName: body.lastName, passwordHash: tempHash!, roles: { create: [{ role: 'TEACHER' }] } } });
      }
      userId = user.id;
      createdUserId = user.id;
    }
    return tx.teacher.create({
      data: {
        schoolId, userId, firstName: body.firstName, lastName: body.lastName,
        phone: body.phone, designation: body.designation, empCode: `TCH-${Math.floor(100000 + Math.random() * 899999)}`,
        sections: sectionIds.length ? { create: sectionIds.map((sectionId) => ({ sectionId })) } : undefined,
        subjects: subjectIds.length ? { create: subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
      },
    });
  });
  if (createdUserId) await grantTeacherDefaults(createdUserId);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_TEACHER', module: 'TEACHERS' });
  return created(res, teacher, 'Teacher created');
}

export async function listParents(req: Request, res: Response) {
  const parents = await prisma.parent.findMany({
    where: { schoolId: schoolOf(req) }, include: { children: { include: { student: true } } }, orderBy: { firstName: 'asc' },
  });
  return ok(res, parents, 'Parents fetched');
}

export async function createParent(req: Request, res: Response) {
  const body = parentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const studentIds = [...new Set(body.studentIds || [])];
  if (studentIds.length) {
    const students = await prisma.student.findMany({ where: { id: { in: studentIds }, schoolId, deletedAt: null }, select: { id: true } });
    if (students.length !== studentIds.length) throw new ApiError(404, 'One or more students were not found in this school');
  }
  const parent = await prisma.parent.create({
    data: {
      schoolId, firstName: body.firstName, lastName: body.lastName, phone: body.phone,
      children: studentIds.length ? { create: studentIds.map((studentId) => ({ studentId, relationship: 'PARENT', isPrimary: false })) } : undefined,
    },
    include: { children: { include: { student: true } } },
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_PARENT', module: 'PARENTS' });
  return ok(res, parent, "Parent (guardian) created — parents log in with the student credentials");
}

export async function listStaff(req: Request, res: Response) {
  const staff = await prisma.staff.findMany({ where: { schoolId: schoolOf(req) }, orderBy: { firstName: 'asc' } });
  return ok(res, staff, 'Staff fetched');
}
