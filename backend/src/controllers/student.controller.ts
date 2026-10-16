import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { studentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword, generateAdmissionNo } from '../utils/password';
import { grantStudentDefaults } from './user.controller';
import { findUserByEmail, updateUser as updateUserDocument } from '../repositories/firestore-auth.repository';
import crypto from 'crypto';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

export function schoolOf(req: Request): string {
  const schoolId = req.auth?.schoolId;
  if (!req.auth) throw new ApiError(401, 'Authentication required');
  if (typeof schoolId !== 'string' || schoolId.trim().length === 0) {
    throw new ApiError(403, 'School context required for this operation');
  }
  return schoolId;
}

async function all(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function byField(schoolId: string, name: string, field: string, value: unknown): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function one(schoolId: string, name: string, id?: string | null): Promise<Doc | null> {
  if (!id) return null;
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

async function hydrateStudent(schoolId: string, student: Doc, detail = false): Promise<Doc> {
  const [cls, section, links, parents] = await Promise.all([
    one(schoolId, 'classes', student.classId),
    one(schoolId, 'sections', student.sectionId),
    byField(schoolId, 'studentParents', 'studentId', student.id),
    all(schoolId, 'parents'),
  ]);
  const hydratedParents = links.map((link) => ({
    ...link,
    parent: parents.find((parent) => parent.id === link.parentId) || null,
  }));
  const result: Doc = { ...student, class: cls, section, parents: hydratedParents };
  if (detail) {
    const [fees, documents, attendance] = await Promise.all([
      byField(schoolId, 'studentFees', 'studentId', student.id),
      byField(schoolId, 'studentDocuments', 'studentId', student.id),
      byField(schoolId, 'attendances', 'studentId', student.id),
    ]);
    result.fees = await Promise.all(fees.map(async (fee) => ({
      ...fee,
      structure: await one(schoolId, 'feeStructures', fee.structureId),
      payments: await byField(schoolId, 'feePayments', 'studentFeeId', fee.id),
    })));
    result.documents = documents;
    result.attendance = attendance.sort((a, b) => millis(b.date) - millis(a.date)).slice(0, 30);
  }
  return result;
}

// ---------- STUDENTS ----------
export async function listStudents(req: Request, res: Response) {
  const { classId, sectionId, q } = req.query as { classId?: string; sectionId?: string; q?: string };
  const schoolId = schoolOf(req);
  let students = (await all(schoolId, 'students')).filter((student) => student.deletedAt == null);
  if (classId) students = students.filter((student) => student.classId === classId);
  if (sectionId) students = students.filter((student) => student.sectionId === sectionId);
  if (q) {
    const query = q.toLowerCase();
    students = students.filter((student) =>
      [student.firstName, student.lastName, student.admissionNo].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  students.sort((a, b) => String(a.admissionNo).localeCompare(String(b.admissionNo)));
  return ok(res, await Promise.all(students.map((student) => hydrateStudent(schoolId, student))), 'Students fetched');
}

export async function getStudent(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const student = await one(schoolId, 'students', req.params.id);
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  return ok(res, await hydrateStudent(schoolId, student, true), 'Student fetched');
}

export async function createStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const db = dbOrThrow();
  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  const school = schoolSnap.exists ? schoolSnap.data() : null;
  const currentStudents = await all(schoolId, 'students');
  const studentCount = currentStudents.filter((student) => student.deletedAt == null).length;
  if (school && studentCount >= Number(school.maxStudents ?? 1000)) throw new ApiError(400, 'Student limit reached for this school');

  const admissionNo = generateAdmissionNo();
  const password = body.password || crypto.randomBytes(16).toString('base64').slice(0, 12);
  const passwordHash = await hashPassword(password);
  const studentEmail = body.email && !body.parentEmail
    ? body.email.toLowerCase()
    : `${admissionNo.toLowerCase()}@student.${schoolId}.local`;
  let user = await findUserByEmail(studentEmail);
  if (user && user.schoolId !== schoolId) throw new ApiError(409, 'Email already belongs to another school account');

  const batch = db.batch();
  if (!user) {
    const userId = randomUUID();
    user = {
      id: userId, schoolId, email: studentEmail, firstName: body.firstName, lastName: body.lastName,
      phone: null, passwordHash, avatarUrl: null, emailVerified: false, isActive: true,
      lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
      _docPath: `schools/${schoolId}/users/${userId}`,
    };
    batch.create(collection(schoolId, 'users').doc(userId), {
      id: userId, schoolId, email: studentEmail, firstName: body.firstName, lastName: body.lastName,
      phone: null, passwordHash, avatarUrl: null, emailVerified: false, isActive: true,
      lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const roleId = randomUUID();
    batch.create(collection(schoolId, 'userRoleAssignments').doc(roleId), {
      id: roleId, userId, role: 'STUDENT', assignedBy: req.auth?.sub ?? null,
    });
  } else {
    batch.update(db.doc(user._docPath!), {
      passwordHash, firstName: body.firstName, lastName: body.lastName, updatedAt: new Date(),
    });
  }

  const studentId = randomUUID();
  const student: Doc = {
    id: studentId, schoolId, firstName: body.firstName, lastName: body.lastName,
    gender: body.gender, dob: new Date(body.dob), classId: body.classId ?? null,
    sectionId: body.sectionId ?? null, bloodGroup: body.bloodGroup ?? null,
    address: body.address ?? null, photoUrl: body.photoUrl ?? null, admissionNo,
    userId: user.id, rollNo: null, enrollmentDate: new Date(), isActive: true,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  batch.create(collection(schoolId, 'students').doc(studentId), student);

  if (body.parentEmail || body.parentPhone || body.parentName) {
    const parentId = randomUUID();
    const linkId = randomUUID();
    batch.create(collection(schoolId, 'parents').doc(parentId), {
      id: parentId, schoolId, userId: null, firstName: body.parentName || 'Guardian',
      lastName: '', phone: body.parentPhone || null, occupation: null, createdAt: new Date(),
    });
    batch.create(collection(schoolId, 'studentParents').doc(linkId), {
      id: linkId, studentId, parentId, relationship: 'PARENT', isPrimary: true,
    });
  }
  await batch.commit();
  await grantStudentDefaults(user.id);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_STUDENT', module: 'STUDENTS', details: { id: student.id } });
  return created(res, student, 'Student created — one family login created (parents use the student\'s credentials)');
}

export async function updateStudent(req: Request, res: Response) {
  const body = studentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const existing = await one(schoolId, 'students', req.params.id);
  if (!existing || existing.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const patch = {
    firstName: body.firstName, lastName: body.lastName, gender: body.gender,
    dob: new Date(body.dob), classId: body.classId ?? null, sectionId: body.sectionId ?? null,
    bloodGroup: body.bloodGroup ?? null, address: body.address ?? null,
    photoUrl: body.photoUrl ?? null, updatedAt: new Date(),
  };
  await collection(schoolId, 'students').doc(req.params.id).update(patch);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'UPDATE_STUDENT', module: 'STUDENTS' });
  return ok(res, { ...existing, ...patch }, 'Student updated');
}

export async function deleteStudent(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const existing = await one(schoolId, 'students', req.params.id);
  if (!existing || existing.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const deletedAt = new Date();
  await collection(schoolId, 'students').doc(req.params.id).update({ deletedAt, updatedAt: new Date() });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'DELETE_STUDENT', module: 'STUDENTS' });
  return ok(res, null, 'Student soft-deleted');
}
