import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { getFirestoreInstance } from '../config/firestore';

export interface AuditContext {
  userId?: string;
  schoolId?: string | null;
  ip?: string;
  action: string;
  module: string;
  details?: unknown;
}

/**
 * Audit events are stored in the same Firestore layout as migrated records:
 * schools/{schoolId}/auditLogs for tenant events and system_auditLogs for
 * platform events without a school context.
 */
export async function auditLog(ctx: AuditContext) {
  try {
    const db = getFirestoreInstance();
    if (!db) {
      console.error('Audit log write skipped: Firestore is not configured.');
      return;
    }

    const data = {
      id: randomUUID(),
      userId: ctx.userId ?? null,
      schoolId: ctx.schoolId ?? null,
      action: ctx.action,
      module: ctx.module,
      details: ctx.details ?? null,
      ip: ctx.ip ?? null,
      createdAt: new Date(),
    };

    const schoolId = ctx.schoolId;
    const ref = schoolId
      ? db.collection('schools').doc(schoolId).collection('auditLogs').doc(data.id)
      : db.collection('system_auditLogs').doc(data.id);
    await ref.create(data);
  } catch {
    // Audit failures must not break the business request; never log event payloads or secrets.
    console.error('Audit log write failed.');
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
