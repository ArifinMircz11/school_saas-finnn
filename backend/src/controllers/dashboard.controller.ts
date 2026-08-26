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
        newAdmissions,
        pendingDocuments,
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
    return ok(res, { role: 'TEACHER', data: { teacher, todayClasses, pendingHomework: myHomework, totalStudents: studentCount } }, 'Dashboard');
  }

  if (roles.includes('STUDENT')) {
    // Unified payload for students AND parents: parents log in with a student's
    // credentials, so there is no separate PARENT login at the data layer.
    const student = await prisma.student.findFirst({
      where: { userId: req.auth!.sub },
      include: { class: true, section: true, attendance: { orderBy: { date: 'desc' } }, fees: { include: { structure: true } } },
    });

    // Guardians of this student (data-only records — no login accounts).
    const guardians = student
      ? (await prisma.studentParent.findMany({ where: { studentId: student.id }, include: { parent: true } })).map((g) => ({
          id: g.parent.id,
          firstName: g.parent.firstName,
          lastName: g.parent.lastName,
          phone: g.parent.phone,
          relationship: g.relationship,
        }))
      : [];

    // Siblings: students sharing a guardian in the same school (so a parent can switch children).
    let siblings: any[] = [];
    if (student) {
      const parentIds = (await prisma.studentParent.findMany({ where: { studentId: student.id }, select: { parentId: true } })).map((p) => p.parentId);
      if (parentIds.length) {
        const siblingLinkIds = (await prisma.studentParent.findMany({ where: { parentId: { in: parentIds } }, select: { studentId: true } }))
          .map((p) => p.studentId)
          .filter((id) => id !== student.id);
        siblings = siblingLinkIds.length
          ? await prisma.student.findMany({
              where: { id: { in: siblingLinkIds }, schoolId, deletedAt: null },
              include: { class: true, section: true, attendance: { take: 1, orderBy: { date: 'desc' } }, fees: { include: { structure: true } } },
            })
          : [];
      }
    }

    const homeworkCount = await prisma.homework.count({ where: { schoolId, sectionId: student?.sectionId, published: true } });
    const attendance = student?.attendance || [];
    const pct = attendance.length ? Math.round((attendance.filter((a) => a.status === 'PRESENT').length / attendance.length) * 100) : 0;
    const unread = await prisma.notification.count({ where: { userId: req.auth!.sub, read: false } });
    const reportAnalysis = await buildReportAnalysis(schoolId, student?.id);

    const allChildren = [
      ...(student ? [{ student, guardians, reportAnalysis }] : []),
      ...siblings.map((s) => ({ student: s, guardians: [], reportAnalysis: null })),
    ];

    return ok(res, {
      role: 'STUDENT',
      data: {
        children: allChildren,
        unread,
        student,
        parents: guardians,
        reportAnalysis,
        siblings: siblings.length,
        fees: student?.fees || [],
        homeworkPending: homeworkCount,
        attendancePct: pct,
      },
    }, 'Dashboard');
  }

  return ok(res, { role: roles[0], data: {} }, 'Dashboard');
}

/** Aggregate published exam results into subject averages, overall average and trend. */
async function buildReportAnalysis(schoolId: string, studentId?: string | null) {
  if (!studentId) return null;
  const results = await prisma.examResult.findMany({
    where: { schoolId, studentId, published: true },
    include: { examSubject: { include: { subject: { select: { id: true, name: true } }, exam: { select: { name: true } } } } },
    orderBy: { exam: { endDate: 'desc' } },
  });
  if (!results.length) return null;

  const subjMap: Record<string, { name: string; marks: number; max: number }> = {};
  for (const r of results) {
    const key = r.examSubject?.subject?.id ?? 'unknown';
    if (!subjMap[key]) subjMap[key] = { name: r.examSubject?.subject?.name ?? 'Unknown', marks: 0, max: 0 };
    subjMap[key].marks += Number(r.marksObtained);
    subjMap[key].max += Number(r.examSubject?.maxMarks ?? 0);
  }
  const subjectAverages = Object.values(subjMap).map((s) => ({
    name: s.name,
    average: s.max ? Number(((s.marks / s.max) * 100).toFixed(1)) : 0,
  }));

  const totalMarks = results.reduce((sum, r) => sum + Number(r.marksObtained), 0);
  const totalMax = results.reduce((sum, r) => sum + Number(r.examSubject?.maxMarks ?? 0), 0);
  const overallAverage = totalMax ? Number(((totalMarks / totalMax) * 100).toFixed(1)) : 0;

  // Exam names ordered oldest → newest for the trend label.
  const seen: string[] = [];
  for (const r of [...results].reverse()) {
    const name = r.examSubject?.exam?.name ?? '';
    if (name && !seen.includes(name)) seen.push(name);
  }
  const examTrend = seen.length > 1 ? `${seen[0]} → ${seen[seen.length - 1]}` : seen[0] || 'No data';

  return { subjectAverages, overallAverage, examTrend, totalExams: results.length };
}