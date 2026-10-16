import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { studentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';
import { grantStudentDefaults } from './user.controller';
import crypto from 'crypto';

export function schoolOf(req: Request): string {
  const schoolId = req.auth?.schoolId;
  if (!req.auth) throw new ApiError(401, 'Authentication required');
  if (typeof schoolId !== 'string' || schoolId.trim().length === 0) {
    throw new ApiError(403, 'School context required for this operation');
  }
  return schoolId;
}

async function linkedStudentIdsForParent(userId: string, schoolId: string): Promise<string[]> {
  const parent = await prisma.parent.findFirst({ where: { userId, schoolId }, select: { id: true } });
  if (!parent) throw new ApiError(404, 'Parent record not found');
  const links = await prisma.studentParent.findMany({
    where: { parentId: parent.id, student: { schoolId, deletedAt: null } },
    select: { studentId: true },
  });
  const ids = [...new Set(links.map((link) => link.studentId))];
  if (!ids.length) throw new ApiError(404, 'No linked students found');
  return ids;
}

// ---------- STUDENTS ----------
export async function listStudents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { classId, sectionId, q } = req.query as { classId?: string; sectionId?: string; q?: string };
  const where: any = { schoolId, deletedAt: null };
  if (req.auth?.roles.includes('STUDENT')) {
    where.userId = req.auth.sub;
  } else {
    if (req.auth?.roles.includes('PARENT')) {
      where.id = { in: await linkedStudentIdsForParent(req.auth.sub, schoolId) };
    }
    if (classId) where.classId = classId;
    if (sectionId) where.sectionId = sectionId;
    if (q) where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { admissionNo: { contains: q, mode: 'insensitive' } },
    ];
  }
  const students = await prisma.student.findMany({
    where, include: { class: true, section: true, parents: { include: { parent: true } } }, orderBy: { admissionNo: 'asc' },
  });
  return ok(res, students, 'Students fetched');
}

export async function getStudent(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const where: any = { id: req.params.id, schoolId, deletedAt: null };
  if (req.auth?.roles.includes('STUDENT')) where.userId = req.auth.sub;
  if (req.auth?.roles.includes('PARENT')) {
    const linkedIds = await linkedStudentIdsForParent(req.auth.sub, schoolId);
    if (!linkedIds.includes(req.params.id)) throw new ApiError(404, 'Student not found');
  }
  const student = await prisma.student.findFirst({
    where,
    include: { class: true, section: true, parents: { include: { parent: true } }, fees: { include: { structure: true, payments: true } }, documents: true, attendance: { take: 30, orderBy: { date: 'desc' } } },
  });
  if (!student) throw new ApiError(404, 'Student not found');
  return ok(res, student, 'Student fetched');
}

export async function createStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  if (body.classId) {
    const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId } });
    if (!cls) throw new ApiError(404, 'Class not found');
  }
  if (body.sectionId) {
    if (!body.classId) throw new ApiError(400, 'A class is required when assigning a section');
    const section = await prisma.section.findFirst({ where: { id: body.sectionId, schoolId, classId: body.classId } });
    if (!section) throw new ApiError(404, 'Section not found in this class');
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const studentCount = await prisma.student.count({ where: { schoolId, deletedAt: null } });
  if (school && studentCount >= school.maxStudents) throw new ApiError(400, 'Student limit reached for this school');

  const admissionNo = generateAdmissionNo();
  // Every student gets a UNIQUE login (even siblings). Parents log in with
  // the student's credentials — no shared family account.
  const password = body.password || crypto.randomBytes(16).toString('base64').slice(0, 12);
  const passwordHash = await hashPassword(password);
  // Unique email per student (siblings never share). Uses admission number by default,
  // or the student's own email if explicitly provided.
  const studentEmail = body.email && !body.parentEmail
    ? body.email.toLowerCase()
    : `${admissionNo.toLowerCase()}@student.${schoolId}.local`;
  const student = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email: studentEmail }, select: { id: true } });
    if (existingUser) throw new ApiError(409, 'A user with this email already exists');
    const user = await tx.user.create({
      data: { schoolId, email: studentEmail, firstName: body.firstName, lastName: body.lastName, passwordHash, roles: { create: [{ role: 'STUDENT' }] } },
    });
    const s = await tx.student.create({
      data: {
        schoolId, firstName: body.firstName, lastName: body.lastName,
        gender: body.gender, dob: new Date(body.dob), classId: body.classId, sectionId: body.sectionId,
        bloodGroup: body.bloodGroup, address: body.address, photoUrl: body.photoUrl, admissionNo, userId: user.id,
      },
    });
    // Guardian contact info stored as data only (no separate login account).
    if (body.parentEmail || body.parentPhone || body.parentName) {
      const parent = await tx.parent.create({
        data: { schoolId, firstName: body.parentName || 'Guardian', lastName: '', phone: body.parentPhone || null },
      });
      await tx.studentParent.create({ data: { studentId: s.id, parentId: parent.id, relationship: 'PARENT', isPrimary: true } });
    }
    return s;
  });
  // Grant STUDENT default permissions so the portal has no dead ends.
  const createdUser = await prisma.user.findUnique({ where: { email: studentEmail }, select: { id: true } });
  if (createdUser) await grantStudentDefaults(createdUser.id);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_STUDENT', module: 'STUDENTS', details: { id: student.id } });
  return created(res, { ...student }, 'Student created — one family login created (parents use the student\'s credentials)');
}

export async function updateStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const existing = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const targetClassId = body.classId ?? existing.classId ?? undefined;
  const targetSectionId = body.sectionId !== undefined
    ? body.sectionId
    : (body.classId && body.classId !== existing.classId ? null : existing.sectionId ?? null);
  if (targetClassId) {
    const cls = await prisma.class.findFirst({ where: { id: targetClassId, schoolId } });
    if (!cls) throw new ApiError(404, 'Class not found');
  }
  if (targetSectionId) {
    if (!targetClassId) throw new ApiError(400, 'A class is required when assigning a section');
    const section = await prisma.section.findFirst({ where: { id: targetSectionId, schoolId, classId: targetClassId } });
    if (!section) throw new ApiError(404, 'Section not found in this class');
  }
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: { firstName: body.firstName, lastName: body.lastName, gender: body.gender, dob: new Date(body.dob), classId: targetClassId, sectionId: targetSectionId, bloodGroup: body.bloodGroup, address: body.address, photoUrl: body.photoUrl },
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
