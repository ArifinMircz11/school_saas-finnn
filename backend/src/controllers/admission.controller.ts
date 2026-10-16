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
  const status = String(req.body?.status || '').toUpperCase();
  const schoolId = schoolOf(req);
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new ApiError(400, 'Status must be APPROVED or REJECTED');
  const admission = await prisma.admission.findFirst({ where: { id: req.params.id, schoolId }, include: { documents: true } });
  if (!admission) throw new ApiError(404, 'Admission not found');
  if (admission.status !== 'PENDING') throw new ApiError(409, 'Only pending admissions can be reviewed');

  if (status === 'APPROVED') {
    const result = await convertAdmissionToStudent(admission);
    await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ADMISSION_APPROVED', module: 'ADMISSIONS' });
    return ok(res, result, 'Admission approved and student created');
  }

  const updated = await prisma.admission.updateMany({
    where: { id: admission.id, schoolId, status: 'PENDING' },
    data: { status: 'REJECTED' },
  });
  if (updated.count !== 1) throw new ApiError(409, 'Admission was already reviewed');
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ADMISSION_REJECTED', module: 'ADMISSIONS' });
  return ok(res, null, 'Admission rejected');
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
  const password = crypto.randomBytes(16).toString('base64').slice(0, 12);
  const passwordHash = await hashPassword(password);
  const studentEmail = admissionNo.toLowerCase() + '@student.' + schoolId + '.local';

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.admission.updateMany({
      where: { id: admission.id, schoolId, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count !== 1) throw new ApiError(409, 'Admission was already reviewed');

    if (admission.classId) {
      const cls = await tx.class.findFirst({ where: { id: admission.classId, schoolId } });
      if (!cls) throw new ApiError(409, 'Admission class is no longer valid for this school');
    }
    const existingUser = await tx.user.findUnique({ where: { email: studentEmail }, select: { id: true } });
    if (existingUser) throw new ApiError(409, 'Generated student account already exists; retry admission conversion');

    const user = await tx.user.create({
      data: { schoolId, email: studentEmail, firstName: admission.firstName, lastName: admission.lastName, passwordHash, roles: { create: [{ role: 'STUDENT' }] } },
    });
    const student = await tx.student.create({
      data: { schoolId, firstName: admission.firstName, lastName: admission.lastName, gender: admission.gender || 'OTHER', dob: admission.dob || new Date(), admissionNo, classId: admission.classId, userId: user.id },
    });
    const parent = await tx.parent.create({
      data: { schoolId, firstName: admission.parentName || 'Guardian', lastName: admission.lastName, phone: admission.parentPhone || null },
    });
    await tx.studentParent.create({ data: { studentId: student.id, parentId: parent.id, relationship: 'PARENT', isPrimary: true } });
    await tx.admission.update({ where: { id: admission.id }, data: { status: 'CONVERTED' } });
    return { student, userId: user.id };
  });

  const { grantStudentDefaults } = await import('./user.controller');
  await grantStudentDefaults(result.userId);
  return { student: result.student };
}
