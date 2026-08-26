import { prisma } from '../config/database';
import config from '../config';

export interface NotificationData {
  schoolId: string;
  userId?: string;
  type?: string;
  title: string;
  message: string;
}

/**
 * Create an in-app notification for one user. Also attempts an email
 * if SMTP is configured (best-effort, never blocks the request).
 */
export async function sendNotification(data: NotificationData) {
  const notification = await prisma.notification.create({
    data: {
      schoolId: data.schoolId,
      userId: data.userId!,
      type: data.type || 'GENERAL',
      title: data.title,
      message: data.message,
    },
  });
  return notification;
}

/** Notify all users of a school with a given role. */
export async function notifyRole(schoolId: string, role: string, title: string, message: string) {
  const roleUsers = await prisma.userRoleAssignment.findMany({
    where: { role: role as any, user: { schoolId, isActive: true } },
    select: { userId: true },
  });
  return Promise.all(
    roleUsers.map((ru) =>
      prisma.notification.create({
        data: { schoolId, userId: ru.userId, type: 'ROLE', title, message },
      })
    )
  ).then((list) => list.length);
}

/** Notify all students of a specific section (class). */
export async function notifySection(schoolId: string, sectionId: string, title: string, message: string) {
  const students = await prisma.student.findMany({
    where: { sectionId },
    select: { userId: true },
  });
  return Promise.all(
    students
      .filter((s) => s.userId)
      .map((s) =>
        prisma.notification.create({ data: { schoolId, userId: s.userId!, title, message } })
      )
  ).then((list) => list.length);
}

/**
 * Send an email via REST API. Resend is the primary provider; Brevo is the
 * automatic fallback. Both are configured purely from environment variables
 * (RESEND_API_KEY / BREVO_API_KEY). Best-effort: never throws, never blocks.
 *
 *   RESEND_API_KEY set  -> POST {baseUrl}/emails  (Resend)
 *   Resend fails/unset  -> POST {baseUrl}/v3/smtp/email (Brevo)
 *   Neither configured -> logs a stub line and returns { queued: false }
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const { email } = config;

  // 1) Primary: Resend REST API.
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
    } catch (e) {
      console.error('[mail] Resend request failed', e);
    }
  }

  // 2) Fallback: Brevo (Sendinblue) REST API.
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
    } catch (e) {
      console.error('[mail] Brevo request failed', e);
    }
  }

  // 3) No provider configured — log a stub so flows still work in dev.
  console.log(`[mail stub] to=${to} subject="${subject}"`);
  return { queued: false, reason: 'No email provider configured (set RESEND_API_KEY or BREVO_API_KEY)' };
}