import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword } from '../utils/password';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { createUserSchema, updateUserSchema, setUserRolesSchema, setUserPermissionsSchema } from '../validators';
import { SUPER_ADMIN_ONLY_PERMISSIONS } from '../config/permissions';
import crypto from 'crypto';

const PRINCIPAL_DEFAULT_PERMISSIONS = [
  'students.view', 'teachers.view', 'attendance.view', 'results.view', 'admissions.view', 'admissions.review',
  'fees.view', 'certificates.view', 'homework.view', 'exams.view', 'notices.view',
  'reports.view', 'notifications.view',
  'principal.analytics.view', 'principal.attendance.analytics.view', 'principal.academic.performance.view',
  'principal.teacher.performance.view', 'principal.admissions.approve', 'principal.results.approve',
  'principal.results.publish', 'principal.leave.approve', 'principal.certificates.approve',
  'principal.fees.overview.view', 'principal.reports.view', 'principal.approvals.manage',
];

/** Permissions a TEACHER needs so their dashboard (attendance, marks, homework,
 *  results) has no dead ends. Granted automatically when a teacher is created. */
export const TEACHER_DEFAULT_PERMISSIONS = [
  'students.view', 'teachers.view', 'attendance.view', 'attendance.mark', 'attendance.update',
  'homework.view', 'homework.create', 'homework.grade', 'exams.view', 'results.view',
  'results.enter', 'results.publish', 'timetable.view', 'notices.view', 'notifications.view',
];

/** Permissions a STUDENT needs to view their own data without dead ends.
 *  Granted automatically when a student account is created. */
export const STUDENT_DEFAULT_PERMISSIONS = [
  'students.view', 'attendance.view', 'homework.view', 'exams.view',
  'results.view', 'timetable.view', 'notices.view', 'notifications.view',
  'documents.view', 'certificates.view',
];

/** Permissions a SCHOOL_ADMIN needs to actually run their school dashboard.
 *  Includes 'users.manage' so a legitimately-promoted school admin can manage
 *  their own school's users (create teacher/principal/student accounts) — the
 *  route-level users.manage guard is what blocks everyone else. Deliberately
 *  excludes the SUPER_ADMIN_ONLY permissions. Granted automatically when a
 *  SCHOOL_ADMIN account is created. */
export const SCHOOL_ADMIN_DEFAULT_PERMISSIONS = [
  'students.view', 'students.create', 'students.update', 'students.delete',
  'parents.view', 'parents.create', 'parents.update',
  'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete',
  'fees.view', 'fees.create', 'fees.collect', 'fees.refund', 'fees.assign',
  'attendance.view', 'attendance.mark', 'attendance.update',
  'homework.view', 'homework.create', 'homework.grade',
  'exams.view', 'exams.create', 'results.view', 'results.enter', 'results.publish',
  'timetable.view', 'timetable.manage',
  'academic.manage',
  'documents.view', 'documents.upload', 'documents.download', 'documents.verify',
  'certificates.view', 'certificates.generate',
  'notices.view', 'notices.create',
  'admissions.view', 'admissions.review',
  'users.manage',
  'reports.view', 'reports.export',
  'settings.manage',
  'notifications.view', 'tickets.view', 'tickets.manage',
  'audit.view',
  'principal.analytics.view', 'principal.attendance.analytics.view',
  'principal.academic.performance.view', 'principal.teacher.performance.view',
  'principal.admissions.approve', 'principal.results.approve', 'principal.results.publish',
  'principal.leave.approve', 'principal.certificates.approve',
  'principal.fees.overview.view', 'principal.reports.view', 'principal.approvals.manage',
];

/** Grant the standard teacher permission set to a user (idempotent). */
async function grantTeacherDefaults(userId: string) {
  const perms = await prisma.permission.findMany({ where: { key: { in: TEACHER_DEFAULT_PERMISSIONS } }, select: { id: true } });
  const existing = await prisma.userPermission.findMany({ where: { userId }, select: { permissionId: true } });
  const existingIds = new Set(existing.map((e) => e.permissionId));
  const toCreate = perms.filter((p) => !existingIds.has(p.id)).map((p) => ({ userId, permissionId: p.id, granted: true }));
  if (toCreate.length) await prisma.userPermission.createMany({ data: toCreate });
  return toCreate.length;
}
export { grantTeacherDefaults };

/** Grant the standard student permission set to a user (idempotent). */
async function grantStudentDefaults(userId: string) {
  const perms = await prisma.permission.findMany({ where: { key: { in: STUDENT_DEFAULT_PERMISSIONS } }, select: { id: true } });
  const existing = await prisma.userPermission.findMany({ where: { userId }, select: { permissionId: true } });
  const existingIds = new Set(existing.map((e) => e.permissionId));
  const toCreate = perms.filter((p) => !existingIds.has(p.id)).map((p) => ({ userId, permissionId: p.id, granted: true }));
  if (toCreate.length) await prisma.userPermission.createMany({ data: toCreate });
  return toCreate.length;
}
export { grantStudentDefaults };

/** Grant the standard school-admin permission set to a user (idempotent). */
async function grantSchoolAdminDefaults(userId: string) {
  const perms = await prisma.permission.findMany({ where: { key: { in: SCHOOL_ADMIN_DEFAULT_PERMISSIONS } }, select: { id: true } });
  const existing = await prisma.userPermission.findMany({ where: { userId }, select: { permissionId: true } });
  const existingIds = new Set(existing.map((e) => e.permissionId));
  const toCreate = perms.filter((p) => !existingIds.has(p.id)).map((p) => ({ userId, permissionId: p.id, granted: true }));
  if (toCreate.length) await prisma.userPermission.createMany({ data: toCreate });
  return toCreate.length;
}

/** Grant the standard principal permission set to a user (idempotent). */
async function grantPrincipalDefaults(userId: string) {
  const perms = await prisma.permission.findMany({ where: { key: { in: PRINCIPAL_DEFAULT_PERMISSIONS } }, select: { id: true } });
  const existing = await prisma.userPermission.findMany({ where: { userId }, select: { permissionId: true } });
  const existingIds = new Set(existing.map((e) => e.permissionId));
  const toCreate = perms.filter((p) => !existingIds.has(p.id)).map((p) => ({ userId, permissionId: p.id, granted: true }));
  if (toCreate.length) await prisma.userPermission.createMany({ data: toCreate });
}

export async function listUsers(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const where: any = { deletedAt: null };
  if (!isSuper) where.schoolId = schoolOf(req);
  else if (req.query.schoolId) where.schoolId = req.query.schoolId as string;
  if (req.query.q) {
    where.OR = [
      { email: { contains: req.query.q as string, mode: 'insensitive' } },
      { firstName: { contains: req.query.q as string, mode: 'insensitive' } },
      { lastName: { contains: req.query.q as string, mode: 'insensitive' } },
    ];
  }
  const users = await prisma.user.findMany({
    where,
    include: { roles: true, permissions: { include: { permission: { select: { key: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, users, 'Users fetched');
}

export async function createUser(req: Request, res: Response) {
  const body = createUserSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');

  const roles: string[] = Array.isArray(body.roles) && body.roles.length ? body.roles : ['STAFF'];
  const permissionKeys: string[] = Array.isArray(body.permissionKeys) ? body.permissionKeys : [];

  // Escalation guards: only a SUPER_ADMIN may create another SUPER_ADMIN, and
  // only a SUPER_ADMIN may grant platform-level permissions.
  if (!isSuper && roles.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'Only a SUPER_ADMIN can assign the SUPER_ADMIN role');
  }
  if (!isSuper && permissionKeys.some((k) => SUPER_ADMIN_ONLY_PERMISSIONS.includes(k))) {
    throw new ApiError(403, 'Forbidden: only a SUPER_ADMIN may grant platform-level permissions');
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) throw new ApiError(409, 'User already exists');
  const passwordHash = await hashPassword(body.password);

  // Tenant: school users may only create accounts within their own school.
  const schoolId = isSuper ? (body.schoolId || null) : schoolOf(req);
  const user = await prisma.user.create({
    data: {
      schoolId,
      email: body.email.toLowerCase(), firstName: body.firstName, lastName: body.lastName ?? '',
      phone: body.phone, passwordHash, emailVerified: true,
      roles: { create: roles.map((role: string) => ({ role: role as any })) },
      permissions: permissionKeys.length
        ? { create: (await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } })).map((p) => ({ permissionId: p.id, granted: true })) }
        : undefined,
    },
  });
  if (roles.includes('PRINCIPAL') && user.schoolId) {
    await prisma.principalProfile.create({ data: { schoolId: user.schoolId, userId: user.id, title: body.title } });
    await grantPrincipalDefaults(user.id);
  }
  if (roles.includes('TEACHER')) await grantTeacherDefaults(user.id);
  if (roles.includes('STUDENT')) await grantStudentDefaults(user.id);
  if (roles.includes('SCHOOL_ADMIN')) await grantSchoolAdminDefaults(user.id);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_USER', module: 'USERS', details: { id: user.id, roles } });
  return created(res, { id: user.id, email: user.email }, 'User created');
}

export async function updateUser(req: Request, res: Response) {
  const body = updateUserSchema.parse(req.body);
  // Tenant guard: a school user may only modify accounts that belong to their school.
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const tenantSchoolId = isSuper ? null : schoolOf(req);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, schoolId: true } });
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== tenantSchoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  const data: any = {};
  if (body.firstName) data.firstName = body.firstName;
  if (body.lastName) data.lastName = body.lastName;
  if (body.phone) data.phone = body.phone;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (body.password) data.passwordHash = await hashPassword(body.password);
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  await auditLog({ userId: req.auth?.sub, schoolId: user.schoolId, ip: req.ip, action: 'UPDATE_USER', module: 'USERS' });
  return ok(res, { id: user.id }, 'User updated');
}

export async function setUserRoles(req: Request, res: Response) {
  const { roles } = setUserRolesSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  // Escalation guard: only a SUPER_ADMIN can assign the SUPER_ADMIN role.
  if (!isSuper && roles.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'Only a SUPER_ADMIN can assign the SUPER_ADMIN role');
  }
  // Tenant isolation.
  const tenantSchoolId = isSuper ? null : schoolOf(req);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, schoolId: true } });
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== tenantSchoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  await prisma.$transaction(async (tx) => {
    await tx.userRoleAssignment.deleteMany({ where: { userId: req.params.id } });
    if (roles.length) {
      await tx.userRoleAssignment.createMany({ data: roles.map((role) => ({ userId: req.params.id, role: role as any, assignedBy: req.auth!.sub })) });
    }
  });
  // keep a principal profile (and default grants) in sync when the role is granted
  if (roles.includes('PRINCIPAL')) {
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, select: { schoolId: true, principal: true } });
    if (u?.schoolId && !u.principal) {
      await prisma.principalProfile.create({ data: { schoolId: u.schoolId, userId: req.params.id } });
    }
    await grantPrincipalDefaults(req.params.id);
  }
  if (roles.includes('SCHOOL_ADMIN')) await grantSchoolAdminDefaults(req.params.id);
  if (roles.includes('TEACHER')) await grantTeacherDefaults(req.params.id);
  if (roles.includes('STUDENT')) await grantStudentDefaults(req.params.id);
  await auditLog({ userId: req.auth?.sub, schoolId: tenantSchoolId || req.auth?.schoolId, ip: req.ip, action: 'SET_USER_ROLES', module: 'USERS', details: { roles } });
  return ok(res, null, 'Roles updated');
}

// ---------- PERMISSIONS ----------
export async function listPermissions(req: Request, res: Response) {
  const perms = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
  return ok(res, perms, 'Permissions fetched');
}

export async function setUserPermissions(req: Request, res: Response) {
  const { permissionKeys } = setUserPermissionsSchema.parse(req.body);
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  // Escalation guard: only a SUPER_ADMIN may grant platform-level permissions.
  if (!isSuper && permissionKeys.some((k) => SUPER_ADMIN_ONLY_PERMISSIONS.includes(k))) {
    throw new ApiError(403, 'Forbidden: only a SUPER_ADMIN may grant platform-level permissions');
  }
  const tenantSchoolId = isSuper ? null : schoolOf(req);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, schoolId: true } });
  if (!target) throw new ApiError(404, 'User not found');
  if (!isSuper && target.schoolId !== tenantSchoolId) throw new ApiError(403, 'Forbidden: you may only manage users in your own school');
  const perms = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: req.params.id } });
    if (perms.length) {
      await tx.userPermission.createMany({
        data: perms.map((p) => ({ userId: req.params.id, permissionId: p.id, granted: true })),
      });
    }
  });
  await auditLog({ userId: req.auth?.sub, schoolId: tenantSchoolId || req.auth?.schoolId, ip: req.ip, action: 'SET_PERMISSIONS', module: 'USERS' });
  return ok(res, null, 'Permissions updated');
}

/** Seed the Permission table with the central catalog. */
export async function seedPermissions(req: Request, res: Response) {
  if (!req.auth?.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Forbidden');
  const { ALL_PERMISSIONS } = await import('../config/permissions');
  let count = 0;
  for (const key of ALL_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { key } });
    if (!existing) {
      await prisma.permission.create({ data: { key } });
      count++;
    }
  }
  return ok(res, { created: count }, 'Permissions seeded');
}