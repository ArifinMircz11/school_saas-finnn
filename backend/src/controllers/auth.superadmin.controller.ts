import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword } from '../utils/password';
import { signAccessToken } from '../utils/jwt';
import { registerSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { findUserByEmail, findUserById, getUserPermissions, getUserRoles } from '../repositories/firestore-auth.repository';

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

export async function bootstrapSuperAdmin(req: Request, res: Response) {
  const body = registerSchema.parse(req.body);
  const db = dbOrThrow();
  const [tenantRoles, systemRoles] = await Promise.all([
    db.collectionGroup('userRoleAssignments').where('role', '==', 'SUPER_ADMIN').limit(1).get(),
    db.collection('system_userRoleAssignments').where('role', '==', 'SUPER_ADMIN').limit(1).get(),
  ]);
  if (!tenantRoles.empty || !systemRoles.empty) throw new ApiError(400, 'A super admin already exists');

  const existingEmail = await findUserByEmail(body.email.toLowerCase());
  if (existingEmail) throw new ApiError(409, 'Email already exists');

  const passwordHash = await hashPassword(body.password);
  const id = randomUUID();
  const roleId = randomUUID();
  const user = {
    id,
    schoolId: null,
    email: body.email.toLowerCase(),
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone ?? null,
    passwordHash,
    emailVerified: true,
    isActive: true,
    avatarUrl: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const batch = db.batch();
  batch.create(db.collection('system_users').doc(id), user);
  batch.create(db.collection('system_userRoleAssignments').doc(roleId), {
    id: roleId,
    userId: id,
    role: 'SUPER_ADMIN',
    assignedBy: null,
  });
  await batch.commit();
  return created(res, { id: user.id, email: user.email }, 'Super admin created');
}

export async function loginAs(req: Request, res: Response) {
  // Impersonation remains restricted to a super-admin role and is fully audited.
  if (!req.auth?.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Forbidden');
  const targetUserId = (req.body || {}).userId as string;
  if (!targetUserId) throw new ApiError(400, 'userId required');

  const target = await findUserById(targetUserId);
  if (!target || !target.isActive) throw new ApiError(404, 'Target user not found');
  const [roles, permissions] = await Promise.all([
    getUserRoles(target.id),
    getUserPermissions(target.id),
  ]);
  const accessToken = signAccessToken({
    sub: target.id,
    schoolId: target.schoolId ?? null,
    roles,
    permissions,
  });
  await auditLog({
    userId: req.auth.sub,
    schoolId: target.schoolId ?? null,
    ip: req.ip,
    action: 'IMPERSONATE',
    module: 'AUTH',
    details: { target: target.id },
  });
  return ok(res, { accessToken, userId: target.id, schoolId: target.schoolId ?? null }, 'Impersonation token issued');
}
