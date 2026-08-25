import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';
import { schoolOf } from './student.controller';
import { uploadToStorage } from '../middleware/upload';

/** Public admission form - allows anyone to apply to an active school. */
export async function submitAdmission(req: Request, res: Response) {
  const body = req.body;
  const school = await prisma.school.findFirst({ where: { code: body.schoolCode, status: 'ACTIVE' } });
  if (!school) throw new ApiError(404, 'School not found or inactive');
  const applicationNo = `APP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const admission = await prisma.admission.create({
    data: {
      schoolId: school.id, applicationNo, firstName: body.firstName, lastName: body.lastName,
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
  let parentUser: unknown = null;
  // Pre-compute the temp parent hash outside the transaction (slow bcrypt).
  const parentTempHash = admission.parentEmail ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  const student = await prisma.$transaction(async (tx) => {
    let parentId: string | undefined;
    if (admission.parentEmail) {
      const email = admission.parentEmail.toLowerCase();
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: { schoolId, email, firstName: admission.parentName || 'Parent', lastName: admission.lastName, passwordHash: parentTempHash!, roles: { create: [{ role: 'PARENT' }] } },
        });
      }
      parentUser = user;
      const existingParent = await tx.parent.findUnique({ where: { userId: user.id } });
      if (existingParent) parentId = existingParent.id;
      else {
        const p = await tx.parent.create({ data: { schoolId, userId: user.id, firstName: admission.parentName || 'Parent', lastName: admission.lastName } });
        parentId = p.id;
      }
    }
    const st = await tx.student.create({
      data: { schoolId, firstName: admission.firstName, lastName: admission.lastName, gender: admission.gender || 'OTHER', dob: admission.dob || new Date(), admissionNo, classId: admission.classId },
    });
    if (parentId) await tx.studentParent.create({ data: { studentId: st.id, parentId, relationship: 'PARENT', isPrimary: true } });
    return st;
  });
  return { student, parentUserId: (parentUser as any)?.id };
}