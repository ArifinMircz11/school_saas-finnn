import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ok } from '../utils/response';

/** Shared dashboard summaries, branched by role. All queries are tenant-scoped. */
export async function getDashboard(req: Request, res: Response) {
  const roles = req.auth!.roles;
  const schoolId = req.auth!.schoolId;
  if (!schoolId) {
    if (roles.includes('SUPER_ADMIN')) {
      return ok(res, { role: 'SUPER_ADMIN' }, 'Dashboard');
    }
    return ok(res, { role: roles[0], data: {} }, 'Dashboard');
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const totalStudents = await prisma.student.count({ where: { schoolId, deletedAt: null } });
  const totalTeachers = await prisma.teacher.count({ where: { schoolId } });
  const totalParents = await prisma.parent.count({ where: { schoolId } });

  if (roles.includes('SCHOOL_ADMIN')) {
    const todayAttendance = await prisma.attendance.count({ where: { schoolId, date: { gte: today, lt: tomorrow } } });
    const todayFees = await prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: today, lt: tomorrow } }, _sum: { amount: true } });
    const pendingAgg = await prisma.studentFee.aggregate({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } }, _sum: { totalAmount: true, paidAmount: true } });
    const newAdmissions = await prisma.admission.count({ where: { schoolId, createdAt: { gte: today, lt: tomorrow } } });
    const pendingDocuments = await prisma.studentDocument.count({ where: { schoolId, verified: false } });
    return ok(res, {
      role: 'SCHOOL_ADMIN',
      data: {
        totalStudents, totalTeachers, totalParents, todayAttendance,
        todayFeeCollection: Number(todayFees._sum.amount || 0),
        pendingFeesAmount: Number(pendingAgg._sum.totalAmount || 0) - Number(pendingAgg._sum.paidAmount || 0),
        newAdmissions, pendingDocuments,
      },
    }, 'Dashboard');
  }

  if (roles.includes('TEACHER')) {
    const teacher = await prisma.teacher.findFirst({
      where: { userId: req.auth!.sub },
      include: { sections: { include: { section: { include: { _count: { select: { students: true } } } } } }, subjects: { include: { subject: true } } },
    });
    const todayClasses = await prisma.timetable.count({ where: { schoolId, teacherId: teacher?.id, day: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() } });
    const myHomework = await prisma.homework.count({ where: { schoolId, teacherId: teacher?.id } });
    const sectionIds = teacher?.sections.map((s) => s.sectionId) || [];
    const studentCount = await prisma.student.count({ where: { schoolId, sectionId: { in: sectionIds }, deletedAt: null } });
    const pendingAttendance = await prisma.attendance.count({ where: { schoolId, markedBy: teacher?.id } }).then(() => studentCount);
    return ok(res, { role: 'TEACHER', data: { teacher, todayClasses, pendingHomework: myHomework, totalStudents: studentCount } }, 'Dashboard');
  }

  if (roles.includes('STUDENT')) {
    const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub }, include: { class: true, section: true } });
    const fees = await prisma.studentFee.findMany({ where: { studentId: student?.id, status: { in: ['PENDING', 'PARTIAL'] } }, include: { structure: true } });
    const homework = await prisma.homework.findMany({ where: { schoolId, sectionId: student?.sectionId, published: true } });
    const attendance = await prisma.attendance.findMany({ where: { studentId: student?.id }, select: { status: true } });
    const pct = attendance.length ? Math.round((attendance.filter((a) => a.status === 'PRESENT').length / attendance.length) * 100) : 0;
    return ok(res, { role: 'STUDENT', data: { student, fees, homeworkPending: homework.length, attendancePct: pct } }, 'Dashboard');
  }

  if (roles.includes('PARENT')) {
    const parent = await prisma.parent.findFirst({ where: { userId: req.auth!.sub } });
    const children = parent
      ? await prisma.studentParent.findMany({
          where: { parentId: parent.id },
          include: { student: { include: { class: true, section: true, attendance: true, fees: { include: { structure: true } } } } },
        })
      : [];
    const unread = await prisma.notification.count({ where: { userId: req.auth!.sub, read: false } });
    return ok(res, { role: 'PARENT', data: { parent, children, unread } }, 'Dashboard');
  }

  return ok(res, { role: roles[0], data: {} }, 'Dashboard');
}