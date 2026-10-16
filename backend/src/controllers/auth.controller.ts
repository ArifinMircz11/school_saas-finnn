import { Request, Response } from 'express';
import { ApiError, ok } from '../utils/response';
import { verifyPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import crypto from 'crypto';
import { loginSchema } from '../validators';
import { auditLog } from '../utils/audit';
import {
  createRefreshToken,
  dateFromFirestore,
  findRefreshTokenByHash,
  findUserByEmail,
  findUserById,
  findUserProfile,
  getUserPermissions,
  getUserRoles,
  publicUser,
  revokeRefreshTokensByHash,
  updateUser,
} from '../repositories/firestore-auth.repository';

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const user = await findUserByEmail(body.email.toLowerCase());
  if (!user || user.deletedAt) throw new ApiError(401, 'Invalid credentials');
  if (!user.isActive) throw new ApiError(403, 'Account is disabled');

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  const [roles, permissions, teacher, student, parent, principal] = await Promise.all([
    getUserRoles(user.id),
    getUserPermissions(user.id),
    findUserProfile('teachers', user.id),
    findUserProfile('students', user.id),
    findUserProfile('parents', user.id),
    findUserProfile('principalProfiles', user.id),
  ]);

  const accessToken = signAccessToken({ sub: user.id, schoolId: user.schoolId ?? null, roles, permissions });
  const refreshToken = signRefreshToken(user.id);
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await createRefreshToken(user.id, user.schoolId ?? null, {
    tokenHash: refreshHash,
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
  });
  await updateUser(user, { lastLoginAt: new Date() });
  await auditLog({ userId: user.id, schoolId: user.schoolId ?? null, ip: req.ip, action: 'LOGIN', module: 'AUTH' });

  return ok(res, {
    user: {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      roles, permissions, schoolId: user.schoolId ?? null,
      teacherId: teacher?.id, studentId: student?.id, parentId: parent?.id,
      principalId: principal?.id,
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
  const stored = await findRefreshTokenByHash(hash);
  if (!stored || stored.revokedAt || dateFromFirestore(stored.expiresAt) < new Date()) {
    throw new ApiError(401, 'Refresh token revoked or expired');
  }
  const user = await findUserById(payload.sub);
  if (!user || !user.isActive || user.deletedAt) throw new ApiError(401, 'Account inactive');

  const [roles, permissions] = await Promise.all([
    getUserRoles(user.id),
    getUserPermissions(user.id),
  ]);
  const accessToken = signAccessToken({ sub: user.id, schoolId: user.schoolId ?? null, roles, permissions });
  return ok(res, { accessToken }, 'Token refreshed');
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await revokeRefreshTokensByHash(hash);
  }
  return ok(res, null, 'Logged out');
}
