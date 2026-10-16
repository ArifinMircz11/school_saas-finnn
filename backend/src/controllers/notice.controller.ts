import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { noticeSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { notifyRole } from '../services/notification.service';

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function tenantCollection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
}

// ---------- NOTICES ----------
export async function listNotices(req: Request, res: Response) {
  const snapshot = await tenantCollection(schoolOf(req), 'notices').get();
  const notices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, notices, 'Notices fetched');
}

export async function createNotice(req: Request, res: Response) {
  const body = noticeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const id = randomUUID();
  const notice = {
    id,
    schoolId,
    title: body.title,
    content: body.content,
    audience: body.audience || 'ALL',
    createdAt: new Date(),
  };
  await tenantCollection(schoolId, 'notices').doc(id).create(notice);

  if (body.audience === 'TEACHERS') await notifyRole(schoolId, 'TEACHER', 'New Notice', body.title);
  else if (body.audience === 'STUDENTS') await notifyRole(schoolId, 'STUDENT', 'New Notice', body.title);
  else if (body.audience === 'PARENTS') await notifyRole(schoolId, 'PARENT', 'New Notice', body.title);

  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_NOTICE', module: 'NOTICES' });
  return created(res, notice, 'Notice created');
}

// ---------- NOTIFICATIONS ----------
export async function myNotifications(req: Request, res: Response) {
  const userId = req.auth!.sub;
  const { unreadOnly } = req.query as { unreadOnly?: string };
  let query: any = dbOrThrow().collectionGroup('notifications').where('userId', '==', userId);
  if (unreadOnly === 'true') query = query.where('read', '==', false);
  const snapshot = await query.get();
  const notifications = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => millis(b.createdAt) - millis(a.createdAt))
    .slice(0, 100);
  return ok(res, notifications, 'Notifications fetched');
}

export async function unreadCount(req: Request, res: Response) {
  const snapshot = await dbOrThrow().collectionGroup('notifications')
    .where('userId', '==', req.auth!.sub).get();
  const count = snapshot.docs.filter((doc: any) => doc.get('read') === false).length;
  return ok(res, { count }, 'Unread count fetched');
}

export async function markRead(req: Request, res: Response) {
  const snapshot = await dbOrThrow().collectionGroup('notifications').where('id', '==', req.params.id).limit(1).get();
  const notif = snapshot.docs[0];
  if (!notif || notif.get('userId') !== req.auth!.sub) throw new ApiError(404, 'Notification not found');
  await notif.ref.update({ read: true });
  return ok(res, null, 'Notification marked read');
}

export async function markAllRead(req: Request, res: Response) {
  const snapshot = await dbOrThrow().collectionGroup('notifications').where('userId', '==', req.auth!.sub).get();
  const unread = snapshot.docs.filter((doc: any) => doc.get('read') === false);
  for (let start = 0; start < unread.length; start += 450) {
    const batch = dbOrThrow().batch();
    unread.slice(start, start + 450).forEach((doc: any) => batch.update(doc.ref, { read: true }));
    await batch.commit();
  }
  return ok(res, null, 'All notifications marked read');
}
