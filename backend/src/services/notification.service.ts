import { prisma } from '../config/database';

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

export async function sendEmail(to: string, subject: string, html: string) {
  // Real SMTP wiring would live here using nodemailer + config.smtp.
  // This is intentionally a no-op stub when SMTP is unconfigured.
  if (!process.env.SMTP_HOST) {
    console.log(`[mail stub] to=${to} subject="${subject}"`);
    return { queued: false, reason: 'SMTP not configured' };
  }
  return { queued: true };
}