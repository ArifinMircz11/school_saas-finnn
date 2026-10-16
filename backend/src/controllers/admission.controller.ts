import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';
import { schoolOf } from './student.controller';
import { uploadToStorage } from '../middleware/upload';
import { admissionSchema } from '../validators';
import crypto from 'crypto';
import { findUserByEmail } from '../repositories/firestore-auth.repository';
import { grantStudentDefaults } from './user.controller';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function all(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function one(schoolId: string, name: string, id?: string | null): Promise<Doc | null> {
  if (!id) return null;
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as Doc : null;
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

/** Public admission form - allows anyone to apply to an active school. */
export async function submitAdmission(req: Request, res: Response) {
  const body = admissionSchema.parse(req.body);
  const schools = await dbOrThrow().collection('schools').where('code', '==', body.schoolCode).get();
  const school = schools.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Doc))
    .find((item) => item.status === 'ACTIVE' && item.deletedAt == null);
  if (!school) throw new ApiError(404, 'School not found or inactive');
  const applicationNo = `APP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const id = randomUUID();
  const admission = {
    id, schoolId: school.id, applicationNo, firstName: body.firstName, lastName: body.lastName || '',
    dob: body.dob ? new Date(body.dob) : null, gender: body.gender, classId: body.classId ?? null,
    parentName: body.parentName, parentEmail: body.parentEmail ?? null, parentPhone: body.parentPhone ?? null,
    status: 'PENDING', createdAt: new Date(), updatedAt: new Date(),
  };
  await collection(school.id, 'admissions').doc(id).create(admission);
  return created(res, { applicationNo: admission.applicationNo, id: admission.id }, 'Admission submitted');
}

export async function listAdmissions(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { status } = req.query as { status?: string };
  let admissions = await all(schoolId, 'admissions');
  if (status) admissions = admissions.filter((item) => String(item.status).toUpperCase() === status.toUpperCase());
  admissions.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, await Promise.all(admissions.map(async (admission) => ({
    ...admission,
    documents: (await all(schoolId, 'admissionDocuments')).filter((doc) => doc.admissionId === admission.id),
    class: await one(schoolId, 'classes', admission.classId),
  }))), 'Admissions fetched');
}

export async function reviewAdmission(req: Request, res: Response) {
  const { status } = req.body as { status: string };
  const schoolId = schoolOf(req);
  const admission = await one(schoolId, 'admissions', req.params.id);
  if (!admission || admission.schoolId !== schoolId) throw new ApiError(404, 'Admission not found');
  if (status === 'APPROVED') {
    const result = await convertAdmissionToStudent(admission);
    await collection(schoolId, 'admissions').doc(admission.id).update({ status: 'CONVERTED', updatedAt: new Date() });
    await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ADMISSION_APPROVED', module: 'ADMISSIONS' });
    return ok(res, result, 'Admission approved and student created');
  }
  await collection(schoolId, 'admissions').doc(admission.id).update({ status, updatedAt: new Date() });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: `ADMISSION_${status}`, module: 'ADMISSIONS' });
  return ok(res, null, `Admission ${status.toLowerCase()}`);
}

/** Upload a document for an admission application. */
export async function uploadAdmissionDocument(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, 'Document file required');
  const snapshot = await dbOrThrow().collectionGroup('admissions').where('id', '==', req.params.id).limit(1).get();
  const admissionDoc = snapshot.docs[0];
  if (!admissionDoc) throw new ApiError(404, 'Admission not found');
  const admission = { id: admissionDoc.id, ...admissionDoc.data() } as Doc;
  const schoolId = String(admission.schoolId || admissionDoc.ref.parent.parent?.id || '');
  if (!schoolId) throw new ApiError(404, 'Admission not found');
  const url = await uploadToStorage(req.file.path, `admissions/${admission.id}`);
  const id = randomUUID();
  const doc = {
    id, admissionId: admission.id, type: req.body.type || 'OTHER', url,
    verified: req.auth?.roles.some((role) => role === 'SCHOOL_ADMIN') || false, createdAt: new Date(),
  };
  await collection(schoolId, 'admissionDocuments').doc(id).create(doc);
  return created(res, doc, 'Document uploaded');
}

async function convertAdmissionToStudent(admission: Doc) {
  const schoolId = admission.schoolId;
  const admissionNo = generateAdmissionNo();
  const password = crypto.randomBytes(16).toString('base64').slice(0, 12);
  const passwordHash = await hashPassword(password);
  const studentEmail = `${admissionNo.toLowerCase()}@student.${schoolId}.local`;
  let user = await findUserByEmail(studentEmail);
  if (user && user.schoolId !== schoolId) throw new ApiError(409, 'Generated student email conflicts with another school');
  const db = dbOrThrow();
  const batch = db.batch();
  let userId: string;
  if (!user) {
    userId = randomUUID();
    const roleId = randomUUID();
    const userData = {
      id: userId, schoolId, email: studentEmail, firstName: admission.firstName, lastName: admission.lastName || '',
      phone: null, passwordHash, avatarUrl: null, emailVerified: false, isActive: true,
      lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    batch.create(collection(schoolId, 'users').doc(userId), userData);
    batch.create(collection(schoolId, 'userRoleAssignments').doc(roleId), {
      id: roleId, userId, role: 'STUDENT', assignedBy: null,
    });
  } else {
    userId = user.id;
    batch.update(db.doc(user._docPath!), {
      passwordHash, firstName: admission.firstName, lastName: admission.lastName || '', updatedAt: new Date(),
    });
  }

  const studentId = randomUUID();
  const student = {
    id: studentId, schoolId, firstName: admission.firstName, lastName: admission.lastName || '',
    gender: admission.gender || 'OTHER', dob: admission.dob || new Date(), admissionNo,
    classId: admission.classId ?? null, sectionId: null, userId,
    bloodGroup: null, address: null, photoUrl: null, rollNo: null,
    enrollmentDate: new Date(), isActive: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  batch.create(collection(schoolId, 'students').doc(studentId), student);
  const parentId = randomUUID();
  const linkId = randomUUID();
  batch.create(collection(schoolId, 'parents').doc(parentId), {
    id: parentId, schoolId, userId: null, firstName: admission.parentName || 'Guardian',
    lastName: admission.lastName || '', phone: admission.parentPhone || null, occupation: null, createdAt: new Date(),
  });
  batch.create(collection(schoolId, 'studentParents').doc(linkId), {
    id: linkId, studentId, parentId, relationship: 'PARENT', isPrimary: true,
  });
  await batch.commit();
  await grantStudentDefaults(userId);
  return { student };
}
