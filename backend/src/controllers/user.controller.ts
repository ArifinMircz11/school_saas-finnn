import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword } from '../utils/password';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { createUserSchema, updateUserSchema, setUserRolesSchema, setUserPermissionsSchema } from '../validators';
import { SUPER_ADMIN_ONLY_PERMISSIONS } from '../config/permissions';
import { findUserByEmail, findUserById, getUserPermissions, getUserRoles, updateUser as updateUserDocument } from '../repositories/firestore-auth.repository';

type Doc = Record<string, any>;

function publicUser(user: Doc): Doc {
  const { _docPath, ...data } = user;
  return data;
}

const PRINCIPAL_DEFAULT_PERMISSIONS = [
  'students.view', 'teachers.view', 'attendance.view', 'results.view', 'admissions.view', 'admissions.review',
  'fees.view', 'certificates.view', 'homework.view', 'exams.view', 'notices.view', 'reports.view', 'notifications.view',
  'principal.analytics.view', 'principal.attendance.analytics.view', 'principal.academic.performance.view',
  'principal.teacher.performance.view', 'principal.admissions.approve', 'principal.results.approve',
  'principal.results.publish', 'principal.leave.approve', 'principal.certificates.approve',
  'principal.fees.overview.view', 'principal.reports.view', 'principal.approvals.manage',
];
export const TEACHER_DEFAULT_PERMISSIONS = [
  'students.view', 'teachers.view', 'attendance.view', 'attendance.mark', 'attendance.update',
  'homework.view', 'homework.create', 'homework.grade', 'exams.view', 'results.view', 'results.enter',
  'results.publish', 'timetable.view', 'notices.view', 'notifications.view',
];
export const STUDENT_DEFAULT_PERMISSIONS = [
  'students.view', 'attendance.view', 'homework.view', 'exams.view', 'results.view', 'timetable.view',
  'notices.view', 'notifications.view', 'documents.view', 'certificates.view',
];
export const SCHOOL_ADMIN_DEFAULT_PERMISSIONS = [
  'students.view', 'students.create', 'students.update', 'students.delete', 'parents.view', 'parents.create',
  'parents.update', 'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete', 'fees.view',
  'fees.create', 'fees.collect', 'fees.refund', 'fees.assign', 'attendance.view', 'attendance.mark',
  'attendance.update', 'homework.view', 'homework.create', 'homework.grade', 'exams.view', 'exams.create',
  'results.view', 'results.enter', 'results.publish', 'timetable.view', 'timetable.manage', 'academic.manage',
  'documents.view', 'documents.upload', 'documents.download', 'documents.verify', 'certificates.view',
  'certificates.generate', 'notices.view', 'notices.create', 'admissions.view', 'admissions.review',
  'users.manage', 'reports.view', 'reports.export', 'settings.manage', 'notifications.view', 'tickets.view',
  'tickets.manage', 'audit.view', 'principal.analytics.view', 'principal.attendance.analytics.view',
  'principal.academic.performance.view', 'principal.teacher.performance.view', 'principal.admissions.approve',
  'principal.results.approve', 'principal.results.publish', 'principal.leave.approve',
  'principal.certificates.approve', 'principal.fees.overview.view', 'principal.reports.view',
  'principal.approvals.manage',
];

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collectionFor(schoolId: string | null | undefined, name: string) {
  const db = dbOrThrow();
  return schoolId
    ? db.collection('schools').doc(schoolId).collection(name)
    : db.collection(`system_${name}`);
}

function toDoc(snapshot: any): Doc {
  return { ...snapshot.data(), id: snapshot.id, _docPath: snapshot.ref.path };
}

async function rowsForUser(collectionName: string, userId: string): Promise<Doc[]> {
  const db = dbOrThrow();
  const [tenant, system] = await Promise.all([
    db.collectionGroup(collectionName).where('userId', '==', userId).get(),
    db.collection(`system_${collectionName}`).where('userId', '==', userId).get(),
  ]);
  return [...tenant.docs, ...system.docs].map(toDoc);
}

async function permissionDocuments(keys?: string[]): Promise<Doc[]> {
  const snapshot = await dbOrThrow().collection('system_permissions').get();
  let rows = snapshot.docs.map(toDoc);
  if (keys) rows = rows.filter((row) => keys.includes(row.key));
  return rows;
}

async function grantDefaults(userId: string, keys: string[]) {
  const user = await findUserById(userId);
  if (!user) return 0;
  const [permissions, existing] = await Promise.all([
    permissionDocuments(keys),
    rowsForUser('userPermissions', userId),
  ]);
  const existingIds = new Set(existing.map((row) => row.permissionId));
  const missing = permissions.filter((permission) => !existingIds.has(permission.id));
  const db = dbOrThrow();
  for (let start = 0; start < missing.length; start += 450) {
    const batch = db.batch();
    missing.slice(start, start + 450).forEach((permission) => {
      const id = randomUUID();
      batch.create(collectionFor(user.schoolId, 'userPermissions').doc(id), {
        id, userId, permissionId: permission.id, granted: true,
      });
    });
    await batch.commit();
  }
  return missing.length;
}

export async function grantTeacherDefaults(userId: string) {
  return grantDefaults(userId, TEACHER_DEFAULT_PERMISSIONS);
}
export async function grantStudentDefaults(userId: string) {
  return grantDefaults(userId, STUDENT_DEFAULT_PERMISSIONS);
}
export async function grantSchoolAdminDefaults(userId: string) {
  return grantDefaults(userId, SCHOOL_ADMIN_DEFAULT_PERMISSIONS);
}
export async function grantPrincipalDefaults(userId: string) {
  return grantDefaults(userId, PRINCIPAL_DEFAULT_PERMISSIONS);
}

async function accessData(userId: string) {
  const db = dbOrThrow();
  const [roles, permissionRows] = await Promise.all([
    getUserRoles(userId),
    rowsForUser('userPermissions', userId),
  ]);
  const granted = permissionRows.filter((row) => row.granted === true);
  const allPermissions = await permissionDocuments();
  const permissionById = new Map(allPermissions.map((permission) => [permission.id, permission]));
  const permissions = granted.map((row) => permissionById.get(row.permissionId))
    .filter((permission): permission is Doc => Boolean(permission))
    .map((permission) => ({ id: permission.id, permission: { key: permission.key }, granted: true, userId }));
  return { roles: roles.map((role) => ({ role })), permissions };
}

async function usersInScope(schoolId?: string | null): Promise<Doc[]> {
  const db = dbOrThrow();
  if (typeof schoolId === 'string') {
    const snapshot = await db.collection('schools').doc(schoolId).collection('users').get();
    return snapshot.docs.map(toDoc);
  }
  if (schoolId === null) {
    const snapshot = await db.collection('system_users').get();
    return snapshot.docs.map(toDoc);
  }
  const [tenant, system] = await Promise.all([
    db.collectionGroup('users').get(),
    db.collection('system_users').get(),
  ]);
  return [...tenant.docs, ...system.docs].map(toDoc);
}

async function roleRows(userId: string): Promise<Doc[]> {
  return rowsForUser('userRoleAssignments', userId);
}

async function replaceUserRoles(user: Doc, roles: string[], assignedBy: string) {
  const db = dbOrThrow();
  const existing = await roleRows(user.id);
  if (!existing.length && !roles.length) return;
  const batch = db.batch();
  existing.forEach((row) => row._docPath && batch.delete(db.doc(row._docPath)));
  roles.forEach((role) => {
    const id = randomUUID();
    batch.create(collectionFor(user.schoolId, 'userRoleAssignments').doc(id), { id, userId: user.id, role, assignedBy });
  });
  await batch.commit();
}

async function replaceUserPermissions(user: Doc, keys: string[]) {
  const db = dbOrThrow();
  const [existing, permissions] = await Promise.all([
    rowsForUser('userPermissions', user.id),
    permissionDocuments(keys),
  ]);
  if (!existing.length && !permissions.length) return;
  const batch = db.batch();
  existing.forEach((row) => row._docPath && batch.delete(db.doc(row._docPath)));
  permissions.forEach((permission) => {
    const id = randomUUID();
    batch.create(collectionFor(user.schoolId, 'userPermissions').doc(id), {
      id, userId: user.id, permissionId: permission.id, granted: true,
    });
  });
  await batch.commit();
}

async function getPrincipalProfile(schoolId: string, userId: string) {
  const snapshot = await collectionFor(schoolId, 'principalProfiles').where('userId', '==', userId).limit(1).get();
  return snapshot.empty ? null : toDoc(snapshot.docs[0]);
}

export async function listUsers(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const scopedSchoolId = isSuper ? (req.query.schoolId as string | undefined) : (req.auth!.schoolId ?? null);
  let users = await usersInScope(scopedSchoolId);
  users = users.filter((user) => user.deletedAt == null);
  if (req.query.q) {
    const query = String(req.query.q).toLowerCase();
    users = users.filter((user) => [user.email, user.firstName, user.lastName].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  users.sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
    return bDate - aDate;
  });
  const result = await Promise.all(users.map(async (user) => ({
    ...publicUser(user),
    ...(await accessData(user.id)),
  })));
  return ok(res, result, 'Users fetched');
}

export async function createUser(req: Request, res: Response) {
  const body = createUserSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const roles: string[] = Array.isArray(body.roles) && body.roles.length ? body.roles : ['STAFF'];
  const permissionKeys: string[] = Array.isArray(body.permissionKeys) ? body.permissionKeys : [];
  if (!isSuper && roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Only a SUPER_ADMIN can assign the SUPER_ADMIN role');
  if (!isSuper && permissionKeys.some((key) => SUPER_ADMIN_ONLY_PERMISSIONS.includes(key))) {
    throw new ApiError(403, 'Forbidden: only a SUPER_ADMIN may grant platform-level permissions');
  }

  const email = body.email.toLowerCase();
  if (await findUserByEmail(email)) throw new ApiError(409, 'User already exists');
  const passwordHash = await hashPassword(body.password);
  const schoolId = isSuper ? (body.schoolId || null) : (req.auth?.schoolId ?? null);
  const id = randomUUID();
  const user: Doc = {
    id, schoolId, email, firstName: body.firstName, lastName: body.lastName ?? '',
    phone: body.phone ?? null, passwordHash, emailVerified: true, isActive: true,
    avatarUrl: null, lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  await collectionFor(schoolId, 'users').doc(id).create(user);
  const persistedUser = { ...user, _docPath: schoolId ? `schools/${schoolId}/users/${id}` : `system_users/${id}` };
  await replaceUserRoles(persistedUser, roles, req.auth!.sub);
  if (permissionKeys.length) await replaceUserPermissions(persistedUser, permissionKeys);
  if (roles.includes('PRINCIPAL') && schoolId) {
    const profileId = randomUUID();
    await collectionFor(schoolId, 'principalProfiles').doc(profileId).create({
      id: profileId, schoolId, userId: id, title: body.title ?? null, createdAt: new Date(),
    });
    await grantPrincipalDefaults(id);
  }
  if (roles.includes('TEACHER')) await grantTeacherDefaults(id);
  if (roles.includes('STUDENT')) await grantStudentDefaults(id);
  if (roles.includes('SCHOOL_ADMIN')) await grantSchoolAdminDefaults(id);
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'CREATE_USER', module: 'USERS', details: { id, roles } });
  return created(res, { id, email }, 'User created');
}

export async function updateUser(req: Request, res: Response) {
  const body = updateUserSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const target = await findUserById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== req.auth?.schoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  const data: Doc = {};
  if (body.firstName) data.firstName = body.firstName;
  if (body.lastName) data.lastName = body.lastName;
  if (body.phone) data.phone = body.phone;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (body.password) data.passwordHash = await hashPassword(body.password);
  data.updatedAt = new Date();
  await updateUserDocument(target, data);
  await auditLog({ userId: req.auth?.sub, schoolId: target.schoolId ?? null, ip: req.ip, action: 'UPDATE_USER', module: 'USERS' });
  return ok(res, { id: target.id }, 'User updated');
}

export async function setUserRoles(req: Request, res: Response) {
  const { roles } = setUserRolesSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  if (!isSuper && roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Only a SUPER_ADMIN can assign the SUPER_ADMIN role');
  const target = await findUserById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== req.auth?.schoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  await replaceUserRoles(target, roles, req.auth!.sub);
  if (roles.includes('PRINCIPAL') && target.schoolId) {
    const existing = await getPrincipalProfile(target.schoolId, target.id);
    if (!existing) {
      const id = randomUUID();
      await collectionFor(target.schoolId, 'principalProfiles').doc(id).create({ id, schoolId: target.schoolId, userId: target.id, createdAt: new Date() });
    }
    await grantPrincipalDefaults(target.id);
  }
  if (roles.includes('SCHOOL_ADMIN')) await grantSchoolAdminDefaults(target.id);
  if (roles.includes('TEACHER')) await grantTeacherDefaults(target.id);
  if (roles.includes('STUDENT')) await grantStudentDefaults(target.id);
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'SET_USER_ROLES', module: 'USERS', details: { roles } });
  return ok(res, null, 'Roles updated');
}

export async function listPermissions(req: Request, res: Response) {
  const permissions = await permissionDocuments();
  permissions.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return ok(res, permissions.map(({ _docPath, ...permission }) => permission), 'Permissions fetched');
}

export async function setUserPermissions(req: Request, res: Response) {
  const { permissionKeys } = setUserPermissionsSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  if (!isSuper && permissionKeys.some((key) => SUPER_ADMIN_ONLY_PERMISSIONS.includes(key))) {
    throw new ApiError(403, 'Forbidden: only a SUPER_ADMIN may grant platform-level permissions');
  }
  const target = await findUserById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== req.auth?.schoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  await replaceUserPermissions(target, permissionKeys);
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'SET_PERMISSIONS', module: 'USERS' });
  return ok(res, null, 'Permissions updated');
}

/** Seed the platform permission catalog in Firestore. */
export async function seedPermissions(req: Request, res: Response) {
  if (!req.auth?.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Forbidden');
  const { ALL_PERMISSIONS } = await import('../config/permissions');
  const existing = await permissionDocuments();
  const keys = new Set(existing.map((permission) => permission.key));
  const db = dbOrThrow();
  let count = 0;
  for (const key of ALL_PERMISSIONS) {
    if (keys.has(key)) continue;
    const id = randomUUID();
    await db.collection('system_permissions').doc(id).create({ id, key, description: null });
    count++;
  }
  return ok(res, { created: count }, 'Permissions seeded');
}
