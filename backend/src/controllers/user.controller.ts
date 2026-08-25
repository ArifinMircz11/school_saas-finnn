import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword } from '../utils/password';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';

const PRINCIPAL_DEFAULT_PERMISSIONS = [
  'students.view', 'teachers.view', 'attendance.view', 'results.view', 'admissions.view', 'admissions.review',
  'fees.view', 'certificates.view', 'homework.view', 'exams.view', 'notices.view',
  'reports.view', 'notifications.view',
  'principal.analytics.view', 'principal.attendance.analytics.view', 'principal.academic.performance.view',
  'principal.teacher.performance.view', 'principal.admissions.approve', 'principal.results.approve',
  'principal.results.publish', 'principal.leave.approve', 'principal.certificates.approve',
  'principal.fees.overview.view', 'principal.reports.view', 'principal.approvals.manage',
];

/** Grant the standard principal permission set to a user (idempotent). */
async function grantPrincipalDefaults(userId: string) {
  const perms = await prisma.permission.findMany({ where: { key: { in: PRINCIPAL_DEFAULT_PERMISSIONS } }, select: { id: true, key: true } });
  const existing = await prisma.userPermission.findMany({ where: { userId }, select: { permissionId: true } });
  const existingIds = new Set(existing.map((e) => e.permissionId));
  const toCreate = perms.filter((p) => !existingIds.has(p.id)).map((p) => ({ userId, permissionId: p.id, granted: true }));
  if (toCreate.length) await prisma.userPermission.createMany({ data: toCreate });
  // record the school's configured principal permission policy on the profile too
  const profile = await prisma.principalProfile.findUnique({ where: { userId } });
  if (profile) {
    await prisma.principalPermission.createMany({
      data: perms.map((p) => ({ principalProfileId: profile.id, permission: p.key, granted: true })), skipDuplicates: true,
    });
  }
}

export async function listUsers(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const where: any = { deletedAt: null };
  if (!isSuper) where.schoolId = req.auth!.schoolId ?? null;
  else if (req.query.schoolId) where.schoolId = req.query.schoolId as string;
  if (req.query.q) {
    where.OR = [
      { email: { contains: req.query.q as string, mode: 'insensitive' } },
      { firstName: { contains: req.query.q as string, mode: 'insensitive' } },
      { lastName: { contains: req.query.q as string, mode: 'insensitive' } },
    ];
  }
  const users = await prisma.user.findMany({
    where, include: { roles: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, users, 'Users fetched');
}

export async function createUser(req: Request, res: Response) {
  const body = req.body;
  if (!body.email || !body.password || !body.firstName) throw new ApiError(400, 'email, password, firstName required');
  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) throw new ApiError(409, 'User already exists');
  const passwordHash = await hashPassword(body.password);
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : ['STAFF'];
  const user = await prisma.user.create({
    data: {
      schoolId: req.auth?.schoolId ?? body.schoolId ?? null,
      email: body.email.toLowerCase(), firstName: body.firstName, lastName: body.lastName,
      phone: body.phone, passwordHash, emailVerified: true,
      roles: { create: roles.map((role: string) => ({ role })) },
    },
  });
  if (roles.includes('PRINCIPAL') && user.schoolId) {
    await prisma.principalProfile.create({ data: { schoolId: user.schoolId, userId: user.id, title: body.title } });
    await grantPrincipalDefaults(user.id);
  }
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'CREATE_USER', module: 'USERS' });
  return created(res, { id: user.id, email: user.email }, 'User created');
}

export async function updateUser(req: Request, res: Response) {
  const data: any = {};
  if (req.body.firstName) data.firstName = req.body.firstName;
  if (req.body.lastName) data.lastName = req.body.lastName;
  if (req.body.phone) data.phone = req.body.phone;
  if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
  if (req.body.password) data.passwordHash = await hashPassword(req.body.password);
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  await auditLog({ userId: req.auth?.sub, schoolId: user.schoolId, ip: req.ip, action: 'UPDATE_USER', module: 'USERS' });
  return ok(res, { id: user.id }, 'User updated');
}

export async function setUserRoles(req: Request, res: Response) {
  const roles = req.body.roles as string[];
  if (!Array.isArray(roles)) throw new ApiError(400, 'roles array required');
  await prisma.$transaction(async (tx) => {
    await tx.userRoleAssignment.deleteMany({ where: { userId: req.params.id } });
    await tx.userRoleAssignment.createMany({ data: roles.map((role) => ({ userId: req.params.id, role: role as any, assignedBy: req.auth!.sub })) });
  });
  // keep a principal profile (and default grants) in sync when the role is granted
  if (roles.includes('PRINCIPAL')) {
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, select: { schoolId: true, principal: true } });
    if (u?.schoolId && !u.principal) {
      await prisma.principalProfile.create({ data: { schoolId: u.schoolId, userId: req.params.id } });
    }
    await grantPrincipalDefaults(req.params.id);
  }
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'SET_USER_ROLES', module: 'USERS', details: { roles } });
  return ok(res, null, 'Roles updated');
}

// ---------- PERMISSIONS ----------
export async function listPermissions(req: Request, res: Response) {
  const perms = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
  return ok(res, perms, 'Permissions fetched');
}

export async function setUserPermissions(req: Request, res: Response) {
  const { permissionKeys } = req.body as { permissionKeys: string[] };
  if (!Array.isArray(permissionKeys)) throw new ApiError(400, 'permissionKeys required');
  const perms = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: req.params.id } });
    if (perms.length) {
      await tx.userPermission.createMany({
        data: perms.map((p) => ({ userId: req.params.id, permissionId: p.id, granted: true })),
      });
    }
  });
  await auditLog({ userId: req.auth?.sub, schoolId: req.auth?.schoolId, ip: req.ip, action: 'SET_PERMISSIONS', module: 'USERS' });
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