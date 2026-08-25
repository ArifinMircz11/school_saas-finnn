import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { studentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';

export function schoolOf(req: Request): string {
  return req.auth?.schoolId!;
}

// ---------- STUDENTS ----------
export async function listStudents(req: Request, res: Response) {
  const { classId, sectionId, q } = req.query as { classId?: string; sectionId?: string; q?: string };
  const where: any = { schoolId: schoolOf(req), deletedAt: null };
  if (classId) where.classId = classId;
  if (sectionId) where.sectionId = sectionId;
  if (q) where.OR = [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
    { admissionNo: { contains: q, mode: 'insensitive' } },
  ];
  const students = await prisma.student.findMany({
    where, include: { class: true, section: true, parents: { include: { parent: true } } }, orderBy: { admissionNo: 'asc' },
  });
  return ok(res, students, 'Students fetched');
}

export async function getStudent(req: Request, res: Response) {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { class: true, section: true, parents: { include: { parent: true } }, fees: { include: { structure: true, payments: true } }, documents: true, attendance: { take: 30, orderBy: { date: 'desc' } } },
  });
  if (!student || student.schoolId !== schoolOf(req)) throw new ApiError(404, 'Student not found');
  return ok(res, student, 'Student fetched');
}

export async function createStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const studentCount = await prisma.student.count({ where: { schoolId, deletedAt: null } });
  if (school && studentCount >= school.maxStudents) throw new ApiError(400, 'Student limit reached for this school');

  const admissionNo = generateAdmissionNo();
  let parentUser: unknown = null;
  // Pre-compute the temp parent hash outside the transaction (slow bcrypt).
  const parentTempHash = body.parentEmail ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  const student = await prisma.$transaction(async (tx) => {
    const s = await tx.student.create({
      data: {
        schoolId, firstName: body.firstName, lastName: body.lastName,
        gender: body.gender, dob: new Date(body.dob), classId: body.classId, sectionId: body.sectionId,
        bloodGroup: body.bloodGroup, address: body.address, photoUrl: body.photoUrl, admissionNo,
      },
    });
    if (body.parentEmail) {
      const email = body.parentEmail.toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({ data: { schoolId, email, firstName: body.parentName || 'Parent', lastName: '', passwordHash: parentTempHash!, roles: { create: [{ role: 'PARENT' }] } } });
      }
      let parent = await tx.parent.findUnique({ where: { userId: user.id } });
      if (!parent) parent = await tx.parent.create({ data: { schoolId, userId: user.id, firstName: body.parentName || 'Parent', lastName: '' } });
      await tx.studentParent.create({ data: { studentId: s.id, parentId: parent.id, relationship: 'PARENT', isPrimary: true } });
      parentUser = user;
    }
    return s;
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_STUDENT', module: 'STUDENTS', details: { id: student.id } });
  return created(res, { ...student, parentUser }, 'Student created');
}

export async function updateStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const existing = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.schoolId !== schoolOf(req)) throw new ApiError(404, 'Student not found');
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: { firstName: body.firstName, lastName: body.lastName, gender: body.gender, dob: new Date(body.dob), classId: body.classId, sectionId: body.sectionId, bloodGroup: body.bloodGroup, address: body.address, photoUrl: body.photoUrl },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'UPDATE_STUDENT', module: 'STUDENTS' });
  return ok(res, student, 'Student updated');
}

export async function deleteStudent(req: Request, res: Response) {
  const existing = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.schoolId !== schoolOf(req)) throw new ApiError(404, 'Student not found');
  await prisma.student.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'DELETE_STUDENT', module: 'STUDENTS' });
  return ok(res, null, 'Student soft-deleted');
}