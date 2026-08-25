import { prisma } from '../config/database';
import type { Request } from 'express';

export interface AuditContext {
  userId?: string;
  schoolId?: string | null;
  ip?: string;
  action: string;
  module: string;
  details?: unknown;
}

export async function auditLog(ctx: AuditContext) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        schoolId: ctx.schoolId ?? null,
        action: ctx.action,
        module: ctx.module,
        details: ctx.details as object | undefined,
        ip: ctx.ip,
      },
    });
  } catch (e) {
    console.error('Audit log write failed', e);
  }
}

/** Build an auditLog caller bound to a request's authenticated identity. */
export function auditFromRequest(req: Request) {
  const auth = (req as any).auth as { sub: string; schoolId: string | null } | undefined;
  return (module: string, action: string, details?: unknown) =>
    auditLog({
      userId: auth?.sub,
      schoolId: auth?.schoolId ?? null,
      ip: req.ip,
      action,
      module,
      details,
    });
}