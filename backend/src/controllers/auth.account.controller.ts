import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { hashPassword, verifyPassword, generateRandomCode } from '../utils/password';
import { verifyAccessToken, signAccessToken } from '../utils/jwt';
import crypto from 'crypto';
import { registerSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema, changePasswordSchema } from '../validators';
import { sendEmail } from '../services/notification.service';
import { auditLog } from '../utils/audit';

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return ok(res, { steps: 'If the account exists, a reset token was generated.' });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.emailOtp.upsert({
    where: { email: user.email },
    create: { email: user.email, code: token, purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    update: { code: token, purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  await sendEmail(user.email, 'Reset your password', `<b>Use this token to reset your password: ${token}</b>`);
  return ok(res, { steps: 'If the account exists, a reset token was generated.' });
}

export async function resetPassword(req: Request, res: Response) {
  const body = resetPasswordSchema.parse(req.body);
  const found = await prisma.emailOtp.findFirst({ where: { code: body.token, purpose: 'PASSWORD_RESET' } });
  if (!found || found.expiresAt < new Date()) throw new ApiError(400, 'Invalid or expired reset token');
  const passwordHash = await hashPassword(body.password);
  await prisma.user.update({ where: { email: found.email }, data: { passwordHash } });
  await prisma.emailOtp.delete({ where: { id: found.id } });
  await prisma.refreshToken.updateMany({ where: { user: { email: found.email } }, data: { revokedAt: new Date() } });
  return ok(res, null, 'Password reset successful');
}

export async function requestEmailVerification(req: Request, res: Response) {
  const { email } = req.body || {};
  if (!email) throw new ApiError(400, 'Email required');
  const code = generateRandomCode(6);
  await prisma.emailOtp.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), code, purpose: 'EMAIL_VERIFICATION', expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    update: { code, purpose: 'EMAIL_VERIFICATION', expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  await sendEmail(email, 'Verify your email', `Your verification code is ${code}`);
  return ok(res, null, 'Verification code sent');
}

export async function verifyEmail(req: Request, res: Response) {
  const { email, code } = verifyEmailSchema.parse(req.body);
  const record = await prisma.emailOtp.findFirst({ where: { email: email.toLowerCase(), code, purpose: 'EMAIL_VERIFICATION' } });
  if (!record || record.expiresAt < new Date()) throw new ApiError(400, 'Invalid or expired code');
  await prisma.user.update({ where: { email: email.toLowerCase() }, data: { emailVerified: true } });
  await prisma.emailOtp.delete({ where: { id: record.id } });
  return ok(res, null, 'Email verified');
}

/**
 * Self-service password change for the *authenticated* user. This is the proper
 * endpoint for "change my own password" — it intentionally does NOT go through
 * the /users/:id admin route (which requires users.manage). Re-authenticates the
 * caller with their current password and revokes all of their refresh tokens so
 * existing sessions must re-login.
 */
export async function changePassword(req: Request, res: Response) {
  const body = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw new ApiError(404, 'User not found');

  const valid = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, 'Current password is incorrect');

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await auditLog({ userId: user.id, schoolId: user.schoolId, ip: req.ip, action: 'CHANGE_PASSWORD', module: 'AUTH' });
  return ok(res, null, 'Password updated. Please sign in again.');
}

export async function me(req: Request, res: Response) {
  const token = req.headers.authorization!.replace('Bearer ', '');
  const auth = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    include: { roles: true, teacher: true, student: true, parent: true, principal: true, school: { select: { id: true, name: true, logoUrl: true, status: true } } },
  });
  if (!user) throw new ApiError(404, 'User not found');
  const permRows = await prisma.userPermission.findMany({ where: { userId: user.id, granted: true }, include: { permission: true } });
  const permissions = permRows.map((p) => p.permission.key);
  return ok(res, {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    emailVerified: user.emailVerified, roles: user.roles.map((r) => r.role), permissions,
    schoolId: user.schoolId, school: user.school,
    teacherId: user.teacher?.id, studentId: user.student?.id, parentId: user.parent?.id,
    principalId: user.principal?.id,
    avatarUrl: user.avatarUrl,
  });
}