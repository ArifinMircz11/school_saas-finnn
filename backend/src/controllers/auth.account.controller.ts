import { Request, Response } from 'express';
import { ApiError, ok } from '../utils/response';
import { hashPassword, verifyPassword, generateRandomCode } from '../utils/password';
import { verifyAccessToken } from '../utils/jwt';
import { registerSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema, changePasswordSchema } from '../validators';
import { sendEmail } from '../services/notification.service';
import { auditLog } from '../utils/audit';
import {
  dateFromFirestore,
  deleteEmailOtp,
  findEmailOtp,
  findSchoolById,
  findUserByEmail,
  findUserById,
  findUserProfile,
  getUserPermissions,
  getUserRoles,
  revokeUserRefreshTokens,
  updateUser,
  upsertEmailOtp,
} from '../repositories/firestore-auth.repository';

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await findUserByEmail(email.toLowerCase());
  if (!user) return ok(res, { steps: 'If the account exists, a reset token was generated.' });
  const token = require('crypto').randomBytes(32).toString('hex');
  await upsertEmailOtp(user.email, token, 'PASSWORD_RESET', new Date(Date.now() + 60 * 60 * 1000));
  await sendEmail(user.email, 'Reset your password', `<b>Use this token to reset your password: ${token}</b>`);
  return ok(res, { steps: 'If the account exists, a reset token was generated.' });
}

export async function resetPassword(req: Request, res: Response) {
  const body = resetPasswordSchema.parse(req.body);
  const found = await findEmailOtp({ code: body.token, purpose: 'PASSWORD_RESET' });
  if (!found || dateFromFirestore(found.expiresAt) < new Date()) throw new ApiError(400, 'Invalid or expired reset token');
  const user = await findUserByEmail(String(found.email));
  if (!user) throw new ApiError(400, 'Invalid or expired reset token');
  const passwordHash = await hashPassword(body.password);
  await updateUser(user, { passwordHash });
  await deleteEmailOtp(found);
  await revokeUserRefreshTokens(user.id);
  return ok(res, null, 'Password reset successful');
}

export async function requestEmailVerification(req: Request, res: Response) {
  const { email } = req.body || {};
  if (!email) throw new ApiError(400, 'Email required');
  const normalizedEmail = String(email).toLowerCase();
  const code = generateRandomCode(6);
  await upsertEmailOtp(normalizedEmail, code, 'EMAIL_VERIFICATION', new Date(Date.now() + 10 * 60 * 1000));
  await sendEmail(normalizedEmail, 'Verify your email', `Your verification code is ${code}`);
  return ok(res, null, 'Verification code sent');
}

export async function verifyEmail(req: Request, res: Response) {
  const { email, code } = verifyEmailSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase();
  const record = await findEmailOtp({ email: normalizedEmail, code, purpose: 'EMAIL_VERIFICATION' });
  if (!record || dateFromFirestore(record.expiresAt) < new Date()) throw new ApiError(400, 'Invalid or expired code');
  const user = await findUserByEmail(normalizedEmail);
  if (!user) throw new ApiError(404, 'User not found');
  await updateUser(user, { emailVerified: true });
  await deleteEmailOtp(record);
  return ok(res, null, 'Email verified');
}

/**
 * Self-service password change for the authenticated user. Re-authenticates
 * the caller with the current password and revokes existing refresh sessions.
 */
export async function changePassword(req: Request, res: Response) {
  const body = changePasswordSchema.parse(req.body);
  const user = await findUserById(req.auth!.sub);
  if (!user) throw new ApiError(404, 'User not found');

  const valid = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, 'Current password is incorrect');

  const passwordHash = await hashPassword(body.newPassword);
  await updateUser(user, { passwordHash });
  await revokeUserRefreshTokens(user.id);
  await auditLog({ userId: user.id, schoolId: user.schoolId ?? null, ip: req.ip, action: 'CHANGE_PASSWORD', module: 'AUTH' });
  return ok(res, null, 'Password updated. Please sign in again.');
}

export async function me(req: Request, res: Response) {
  const token = req.headers.authorization!.replace('Bearer ', '');
  const auth = verifyAccessToken(token);
  const user = await findUserById(auth.sub);
  if (!user) throw new ApiError(404, 'User not found');

  const [roles, permissions, teacher, student, parent, principal, school] = await Promise.all([
    getUserRoles(user.id),
    getUserPermissions(user.id),
    findUserProfile('teachers', user.id),
    findUserProfile('students', user.id),
    findUserProfile('parents', user.id),
    findUserProfile('principalProfiles', user.id),
    user.schoolId ? findSchoolById(user.schoolId) : Promise.resolve(null),
  ]);

  return ok(res, {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    emailVerified: user.emailVerified, roles, permissions,
    schoolId: user.schoolId ?? null, school,
    teacherId: teacher?.id, studentId: student?.id, parentId: parent?.id,
    principalId: principal?.id,
    avatarUrl: user.avatarUrl,
  });
}
