import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError } from '../utils/response';
import { verifyAccessToken, AccessPayload } from '../utils/jwt';

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Express {
    interface Request {
      auth?: AccessPayload;
    }
  }
}

/**
 * Verify Bearer access token, attach identity + permissions to req.auth.
 * The schoolId comes from the token (set at login from the DB), never from the client.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing access token');
    }
    const token = header.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    // Confirm the user still exists and is active (so deactivated users lose access).
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new ApiError(401, 'Account inactive or deleted');
    }
    req.auth = payload;
    next();
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode || 401;
    const message = e instanceof Error ? e.message : 'Unauthorized';
    return _res.status(status).json({ success: false, message });
  }
}

/** Require at least one of the given roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const has = req.auth?.roles.some((r) => roles.includes(r));
    if (!has) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

/** Require a specific permission. */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const has = req.auth?.permissions.includes(permission);
    if (!has) {
      return res.status(403).json({ success: false, message: `Forbidden: missing permission ${permission}` });
    }
    next();
  };
}

/** Ensure the authenticated user's tenant matches the requested resource school.
 *  Super admins may cross tenants only when impersonation is enabled. */
export function requireSameSchool(schoolId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.roles.includes('SUPER_ADMIN')) {
      return next();
    }
    if (req.auth?.schoolId !== schoolId) {
      return res.status(403).json({ success: false, message: 'Tenant mismatch: forbidden' });
    }
    next();
  };
}