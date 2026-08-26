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
 *
 * Every 401 response carries a machine-readable `code` so clients can decide
 * whether a token refresh is worthwhile:
 *   TOKEN_MISSING    – no / malformed Authorization header
 *   TOKEN_EXPIRED    – access token past its TTL (client SHOULD transparently refresh)
 *   TOKEN_INVALID    – malformed / wrong-signature token (do NOT endlessly refresh)
 *   ACCOUNT_INACTIVE – user deactivated/deleted (do NOT refresh)
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing access token', undefined, 'TOKEN_MISSING');
    }
    const token = header.replace('Bearer ', '');

    let payload: AccessPayload;
    try {
      payload = verifyAccessToken(token);
    } catch (e) {
      // jsonwebtoken throws TokenExpiredError (name === 'TokenExpiredError') for
      // expiry and JsonWebTokenError for everything else (malformed, bad signature).
      if ((e as { name?: string }).name === 'TokenExpiredError') {
        throw new ApiError(401, 'Access token expired', undefined, 'TOKEN_EXPIRED');
      }
      throw new ApiError(401, 'Invalid or malformed access token', undefined, 'TOKEN_INVALID');
    }

    // Confirm the user still exists and is active (so deactivated users lose access).
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new ApiError(401, 'Account inactive or deleted', undefined, 'ACCOUNT_INACTIVE');
    }
    req.auth = payload;
    next();
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode || 401;
    const message = e instanceof Error ? e.message : 'Unauthorized';
    const code = (e as { code?: string }).code || 'UNAUTHORIZED';
    return _res.status(status).json({ success: false, message, code });
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

/** Require a specific permission.
 *
 *  A SUPER_ADMIN bypasses the permission check: super admins are bootstrapped
 *  without Permission rows (their JWT has `permissions: []`), so a plain
 *  `permissions.includes(permission)` guard would lock them out of every
 *  permission-gated route. The SUPER_ADMIN role is the platform owner and can
 *  only ever be granted by another SUPER_ADMIN (enforced in user.controller),
 *  so granting it implicit access is safe. */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = req.auth?.roles ?? [];
    const isSuperAdmin = roles.includes('SUPER_ADMIN');
    const has = isSuperAdmin || (req.auth?.permissions ?? []).includes(permission);
    if (!has) {
      return res.status(403).json({ success: false, message: `Forbidden: missing permission ${permission}` });
    }
    next();
  };
}

// NOTE: There is intentionally NO requireSameSchool() middleware. Tenant isolation
// is enforced inside every controller via schoolOf(req), which reads the school id
// from the trusted JWT (set at login from the DB, never from the client), and each
// controller re-checks the target :id resource against that school id
// (e.g. `if (student.schoolId !== schoolOf(req)) throw 404`). No route in this app
// uses a :schoolId path param, so a route-level tenant guard would add nothing.