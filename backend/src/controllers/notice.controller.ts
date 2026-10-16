import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { noticeSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { notifyRole } from '../services/notification.service';

// ---------- NOTICES ----------
// PostgreSQL remains the sole source of truth until a separately approved migration
// includes backfill, reconciliation, cutover, and rollback procedures.
export async function listNotices(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const notices = await prisma.notice.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, notices, 'Notices fetched');
}

export async function createNotice(req: Request, res: Response) {
  const body = noticeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const notice = await prisma.notice.create({
    data: {
      schoolId,
      title: body.title,
      content: body.content,
      audience: body.audience || 'ALL',
    },
  });

  if (body.audience === 'TEACHERS') await notifyRole(schoolId, 'TEACHER', 'New Notice', body.title);
  else if (body.audience === 'STUDENTS') await notifyRole(schoolId, 'STUDENT', 'New Notice', body.title);
  else if (body.audience === 'PARENTS') await notifyRole(schoolId, 'PARENT', 'New Notice', body.title);

  await auditLog({
    userId: req.auth?.sub,
    schoolId,
    ip: req.ip,
    action: 'CREATE_NOTICE',
    module: 'NOTICES',
  });
  return created(res, notice, 'Notice created');
}

// ---------- NOTIFICATIONS ----------
export async function myNotifications(req: Request, res: Response) {
  const userId = req.auth!.sub;
  const { unreadOnly } = req.query as { unreadOnly?: string };
  const where: any = { userId };
  if (unreadOnly === 'true') where.read = false;
  const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  return ok(res, notifications, 'Notifications fetched');
}
export async function unreadCount(req: Request, res: Response) {
  const count = await prisma.notification.count({ where: { userId: req.auth!.sub, read: false } });
  return ok(res, { count }, 'Unread count fetched');
}
export async function markRead(req: Request, res: Response) {
  const id = req.params.id;
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== req.auth!.sub) throw new ApiError(404, 'Notification not found');
  await prisma.notification.update({ where: { id }, data: { read: true } });
  return ok(res, null, 'Notification marked read');
}
export async function markAllRead(req: Request, res: Response) {
  await prisma.notification.updateMany({ where: { userId: req.auth!.sub, read: false }, data: { read: true } });
  return ok(res, null, 'All notifications marked read');
}
