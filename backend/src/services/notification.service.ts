import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import config from '../config';

export interface NotificationData {
  schoolId: string;
  userId?: string;
  type?: string;
  title: string;
  message: string;
}

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new Error('Firestore is not configured');
  return db;
}

function notificationRef(schoolId: string, id: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection('notifications').doc(id);
}

/** Create an in-app notification for one user. */
export async function sendNotification(data: NotificationData) {
  if (!data.userId) throw new Error('userId is required to create a notification');
  const id = randomUUID();
  const notification = {
    id,
    schoolId: data.schoolId,
    userId: data.userId,
    type: data.type || 'GENERAL',
    title: data.title,
    message: data.message,
    read: false,
    createdAt: new Date(),
  };
  await notificationRef(data.schoolId, id).create(notification);
  return notification;
}

/** Notify active users in a school with a given role. */
export async function notifyRole(schoolId: string, role: string, title: string, message: string) {
  const db = dbOrThrow();
  const roleRows = await db.collection('schools').doc(schoolId)
    .collection('userRoleAssignments').where('role', '==', role).get();
  const userRows = await Promise.all(roleRows.docs.map(async (roleDoc) => {
    const userId = String(roleDoc.get('userId') || '');
    if (!userId) return null;
    const user = await db.collection('schools').doc(schoolId).collection('users').doc(userId).get();
    if (!user.exists || user.get('isActive') !== true) return null;
    return userId;
  }));
  const userIds = [...new Set(userRows.filter((id): id is string => Boolean(id)))];
  const notifications = await Promise.all(userIds.map((userId) =>
    sendNotification({ schoolId, userId, type: 'ROLE', title, message })
  ));
  return notifications.length;
}

/** Notify users linked to students in a specific section. */
export async function notifySection(schoolId: string, sectionId: string, title: string, message: string) {
  const db = dbOrThrow();
  const students = await db.collection('schools').doc(schoolId).collection('students')
    .where('sectionId', '==', sectionId).get();
  const userIds: string[] = Array.from(new Set<string>(students.docs
    .map((doc) => doc.get('userId'))
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));
  const notifications = await Promise.all(userIds.map((userId) =>
    sendNotification({ schoolId, userId, title, message })
  ));
  return notifications.length;
}

/**
 * Send an email via REST API. Resend is primary; Brevo is the fallback.
 * Delivery remains best-effort and does not block business requests.
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const { email } = config;

  if (email.resend.apiKey) {
    try {
      const res = await fetch(`${email.resend.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${email.resend.apiKey}`,
        },
        body: JSON.stringify({ from: email.resend.from, to: [to], subject, html }),
      });
      if (res.ok) return { queued: true, provider: 'resend' };
      console.error(`[mail] Resend error ${res.status}: ${await res.text()}`);
    } catch {
      console.error('[mail] Resend request failed');
    }
  }

  if (email.brevo.apiKey) {
    try {
      const res = await fetch(`${email.brevo.baseUrl}/v3/smtp/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': email.brevo.apiKey,
        },
        body: JSON.stringify({
          sender: { name: email.brevo.fromName, email: email.brevo.from },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });
      if (res.ok) return { queued: true, provider: 'brevo' };
      console.error(`[mail] Brevo error ${res.status}: ${await res.text()}`);
    } catch {
      console.error('[mail] Brevo request failed');
    }
  }

  console.log(`[mail stub] to=${to} subject="${subject}"`);
  return { queued: false, reason: 'No email provider configured (set RESEND_API_KEY or BREVO_API_KEY)' };
}
