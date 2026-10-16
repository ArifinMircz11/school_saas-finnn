import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';
import { schoolOf } from './student.controller';
import { uploadToStorage } from '../middleware/upload';
import { admissionSchema } from '../validators';
import crypto from 'crypto';

/** Public admission form - allows anyone to apply to an active school. */
export async function submitAdmission(req: Request, res: Response) {
  const body = admissionSchema.parse(req.body);
  const school = await prisma.school.findFirst({ where: { code: body.schoolCode, status: 'ACTIVE' } });
  if (!school) throw new ApiError(404, 'School not found or inactive');
  if (body.classId) {
    const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: school.id } });
    if (!cls) throw new ApiError(404, 'Class not found for the selected school');
  }
  const applicationNo = `APP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const admission = await prisma.admission.create({
    data: {
      schoolId: school.id, applicationNo, firstName: body.firstName, lastName: body.lastName || '',
      dob: body.dob ? new Date(body.dob) : null, gender: body.gender, classId: body.classId,
      parentName: body.parentName, parentEmail: body.parentEmail, parentPhone: body.parentPhone,
    },
  });
  return created(res, { applicationNo: admission.applicationNo, id: admission.id }, 'Admission submitted');
}

export async function listAdmissions(req: Request, res: Response) {
  const { status } = req.query as { status?: string };
  const where: any = { schoolId: schoolOf(req) };
  if (status) where.status = status.toUpperCase();
  const admissions = await prisma.admission.findMany({ where, include: { documents: true, class: true }, orderBy: { createdAt: 'desc' } });
  return ok(res, admissions, 'Admissions fetched');
}

export async function reviewAdmission(req: Request, res: Response) {
  const { status } = req.body as { status: string };
  const admission = await prisma.admission.findUnique({ where: { id: req.params.id }, include: { documents: true } });
  if (!admission || admission.schoolId !== schoolOf(req)) throw new ApiError(404, 'Admission not found');
  if (status === 'APPROVED') {
    if (admission.classId && !await prisma.class.findFirst({ where: { id: admission.classId, schoolId: admission.schoolId } })) {
      throw new ApiError(409, 'Admission class is no longer valid for this school');
    }
    const result = await convertAdmissionToStudent(admission);
    await prisma.admission.update({ where: { id: admission.id }, data: { status: 'CONVERTED' } });
    await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'ADMISSION_APPROVED', module: 'ADMISSIONS' });
    return ok(res, result, 'Admission approved and student created');
  }
  await prisma.admission.update({ where: { id: admission.id }, data: { status } });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: `ADMISSION_${status}`, module: 'ADMISSIONS' });
  return ok(res, null, `Admission ${status.toLowerCase()}`);
}

/** Upload a document for an admission application. */
export async function uploadAdmissionDocument(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, 'Document file required');
  const admission = await prisma.admission.findUnique({ where: { id: req.params.id } });
  if (!admission) throw new ApiError(404, 'Admission not found');
  const url = await uploadToStorage(req.file.path, `admissions/${admission.id}`);
  const doc = await prisma.admissionDocument.create({
    data: { admissionId: admission.id, type: req.body.type || 'OTHER', url, verified: req.auth?.roles.some((r) => r === 'SCHOOL_ADMIN') || false },
  });
  return created(res, doc, 'Document uploaded');
}

async function convertAdmissionToStudent(admission: any) {
  const schoolId = admission.schoolId;
  const admissionNo = generateAdmissionNo();
      // Each student gets a UNIQUE login (even siblings share same parent email —
  // this login is the student's own, never the parent's).
  const password = crypto.randomBytes(16).toString('base64').slice(0, 12);
  const passwordHash = await hashPassword(password);
  // Always generate a unique email per student (admission-number based).
  const studentEmail = `${admissionNo.toLowerCase()}@student.${admission.schoolId}.local`;
  const student = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: studentEmail } });
    if (!user) {
      user = await tx.user.create({
        data: { schoolId, email: studentEmail, firstName: admission.firstName, lastName: admission.lastName, passwordHash, roles: { create: [{ role: 'STUDENT' }] } },
      });
    } else {
      // Generated student emails must never be reused to overwrite an existing identity.
      throw new ApiError(409, 'Generated student account already exists; retry admission conversion');
    }
    const st = await tx.student.create({
      data: { schoolId, firstName: admission.firstName, lastName: admission.lastName, gender: admission.gender || 'OTHER', dob: admission.dob || new Date(), admissionNo, classId: admission.classId, userId: user.id },
    });
    // Guardian contact info stored as data only (no separate login account).
    const parent = await tx.parent.create({
      data: { schoolId, firstName: admission.parentName || 'Guardian', lastName: admission.lastName, phone: admission.parentPhone || null },
    });
    await tx.studentParent.create({ data: { studentId: st.id, parentId: parent.id, relationship: 'PARENT', isPrimary: true } });
    // Grant STUDENT permissions.
    const { grantStudentDefaults } = await import('./user.controller');
    await grantStudentDefaults(user.id);
    return st;
  });
  return { student };
}