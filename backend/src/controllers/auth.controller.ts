import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok } from '../utils/response';
import { hashPassword, verifyPassword, generateRandomCode } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import crypto from 'crypto';
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { sendEmail } from '../services/notification.service';

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    include: { roles: true, teacher: true, student: true, parent: true, staff: true, principal: true },
  });
  if (!user || user.deletedAt) throw new ApiError(401, 'Invalid credentials');
  if (!user.isActive) throw new ApiError(403, 'Account is disabled');

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  const permRows = await prisma.userPermission.findMany({
    where: { userId: user.id, granted: true },
    include: { permission: true },
  });
  const permissions = permRows.map((p) => p.permission.key);
  const roles = user.roles.map((r) => r.role);

  const accessToken = signAccessToken({ sub: user.id, schoolId: user.schoolId, roles, permissions });
  const refreshToken = signRefreshToken(user.id);
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshHash,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditLog({ userId: user.id, schoolId: user.schoolId, ip: req.ip, action: 'LOGIN', module: 'AUTH' });

  return ok(res, {
    user: {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      roles, permissions, schoolId: user.schoolId,
      teacherId: user.teacher?.id, studentId: user.student?.id, parentId: user.parent?.id,
      principalId: user.principal?.id,
      avatarUrl: user.avatarUrl,
    },
    accessToken, refreshToken,
  }, 'Login successful');
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw new ApiError(401, 'Missing refresh token');
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token revoked or expired');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { roles: true } });
  if (!user || !user.isActive || user.deletedAt) throw new ApiError(401, 'Account inactive');
  const permRows = await prisma.userPermission.findMany({ where: { userId: user.id, granted: true }, include: { permission: true } });
  const permissions = permRows.map((p) => p.permission.key);
  const roles = user.roles.map((r) => r.role);
  const accessToken = signAccessToken({ sub: user.id, schoolId: user.schoolId, roles, permissions });
  return ok(res, { accessToken }, 'Token refreshed');
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revokedAt: new Date() } });
  }
  return ok(res, null, 'Logged out');
}