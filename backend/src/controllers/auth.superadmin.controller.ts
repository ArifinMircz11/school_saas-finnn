import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword } from '../utils/password';
import { signAccessToken } from '../utils/jwt';
import { registerSchema } from '../validators';
import { auditLog } from '../utils/audit';

export async function bootstrapSuperAdmin(req: Request, res: Response) {
  const body = registerSchema.parse(req.body);
  const existing = await prisma.user.findFirst({ where: { roles: { some: { role: 'SUPER_ADMIN' } } } });
  if (existing) throw new ApiError(400, 'A super admin already exists');
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(), firstName: body.firstName, lastName: body.lastName,
      phone: body.phone, passwordHash, emailVerified: true,
      roles: { create: [{ role: 'SUPER_ADMIN' }] },
    },
  });
  return created(res, { id: user.id, email: user.email }, 'Super admin created');
}

export async function loginAs(req: Request, res: Response) {
  // Impersonation: only super admin, fully audited.
  if (!req.auth?.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Forbidden');
  const targetUserId = (req.body || {}).userId as string;
  if (!targetUserId) throw new ApiError(400, 'userId required');
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, include: { roles: true } });
  if (!target || !target.isActive) throw new ApiError(404, 'Target user not found');
  const permRows = await prisma.userPermission.findMany({ where: { userId: target.id, granted: true }, include: { permission: true } });
  const permissions = permRows.map((p) => p.permission.key);
  const accessToken = signAccessToken({
    sub: target.id, schoolId: target.schoolId,
    roles: target.roles.map((r) => r.role), permissions,
  });
  await auditLog({
    userId: req.auth.sub, schoolId: target.schoolId, ip: req.ip,
    action: 'IMPERSONATE', module: 'AUTH', details: { target: target.id },
  });
  return ok(res, { accessToken, userId: target.id, schoolId: target.schoolId }, 'Impersonation token issued');
}