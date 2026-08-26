import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { createApprovalSchema } from '../validators';

/* ============================================================================
 * PRINCIPAL CONTROLLER
 * School-leadership, read-mostly analytics module. The Principal belongs to a
 * single school; tenant is ALWAYS derived from the token (never from the client).
 * Academic / teacher performance is DERIVED from existing attendance, exam,
 * homework and fee data rather than duplicated (per spec §35).
 * ========================================================================== */

type Id = string;

// ---------------- Helpers: derive analytics ----------------
async function attendanceStats(schoolId: string) {
  const rows = await prisma.attendance.findMany({ where: { schoolId }, select: { studentId: true, status: true, date: true } });
  const perStudent = new Map<Id, { total: number; present: number }>();
  for (const r of rows) {
    const s = perStudent.get(r.studentId) || { total: 0, present: 0 };
    s.total++; if (r.status === 'PRESENT') s.present++;
    perStudent.set(r.studentId, s);
  }
  const total = rows.length;
  const present = rows.filter((r) => r.status === 'PRESENT').length;
  const pct = total ? Math.round((present / total) * 100) : 0;
  return { perStudent, total, present, pct };
}

async function academicPerformanceMap(schoolId: string) {
  const subjects = await prisma.examSubject.findMany({ where: { exam: { schoolId } }, select: { id: true, maxMarks: true } });
  const maxMap = new Map(subjects.map((s) => [s.id, s.maxMarks || 1]));
  const rows = await prisma.examResult.findMany({ where: { schoolId }, select: { studentId: true, marksObtained: true, examSubjectId: true } });
  const perStudent = new Map<Id, { sumPct: number; count: number; avg: number }>();
  for (const r of rows) {
    const max = maxMap.get(r.examSubjectId);
    if (!max) continue;
    const pct = (Number(r.marksObtained) / max) * 100;
    const s = perStudent.get(r.studentId) || { sumPct: 0, count: 0, avg: 0 };
    s.sumPct += pct; s.count++; perStudent.set(r.studentId, s);
  }
  perStudent.forEach((s) => { s.avg = s.count ? Math.round(s.sumPct / s.count) : 0; });
  return perStudent;
}

function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }

// ---------------- Profile ----------------
export async function getPrincipalProfile(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const profile = await prisma.principalProfile.findFirst({
    where: { userId: req.auth!.sub, schoolId },
    include: { school: { select: { id: true, name: true, logoUrl: true, settings: true } } },
  });
  return ok(res, profile, 'Principal profile fetched');
}

// ---------------- Executive overview ----------------
export async function principalOverview(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalStudents, totalTeachers, totalClasses] = await Promise.all([
    prisma.student.count({ where: { schoolId, deletedAt: null } }),
    prisma.teacher.count({ where: { schoolId } }),
    prisma.class.count({ where: { schoolId } }),
  ]);
  const att = await attendanceStats(schoolId);
  const todayAtt = await prisma.attendance.findMany({ where: { schoolId, date: { gte: today, lt: tomorrow } }, select: { status: true } });
  const todayPct = pct(todayAtt.filter((a) => a.status === 'PRESENT').length, todayAtt.length);

  const [pendingAdmissions, pendingApprovals, todayCollected, monthCollected] = await Promise.all([
    prisma.admission.count({ where: { schoolId, status: { in: ['PENDING', 'SUBMITTED'] } } }),
    prisma.approvalRequest.count({ where: { schoolId, status: 'PENDING' } }),
    prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
    prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const pendingFees = await prisma.studentFee.aggregate({
    where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } }, _sum: { totalAmount: true, paidAmount: true },
  });
  const overdue = await prisma.studentFee.count({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today } } });
  const upcomingExams = await prisma.exam.count({ where: { schoolId, startDate: { gte: today } } });

  // attendance trend (last 7 days)
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  const trendRows = await prisma.attendance.findMany({ where: { schoolId, date: { gte: new Date(days[0]) } }, select: { status: true, date: true } });
  const attendanceTrend = days.map((day) => {
    const recs = trendRows.filter((r) => r.date.toISOString().slice(0, 10) === day);
    return { day, pct: pct(recs.filter((r) => r.status === 'PRESENT').length, recs.length) };
  });

  // weekly vs monthly average
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 6);
  const weekRecs = trendRows.filter((r) => r.date >= weekStart);
  const weekPct = pct(weekRecs.filter((r) => r.status === 'PRESENT').length, weekRecs.length);

  return ok(res, {
    counts: {
      totalStudents, totalTeachers, totalClasses, todaysAttendance: todayAtt.length,
      todayAttendancePct: todayPct, averageAttendancePct: att.pct, weeklyAttendancePct: weekPct,
      pendingAdmissions, pendingApprovals, upcomingExams, overdueFees: overdue,
    },
    fees: {
      todayCollection: Number(todayCollected._sum.amount || 0),
      monthCollection: Number(monthCollected._sum.amount || 0),
      pendingAmount: Number(pendingFees._sum.totalAmount || 0) - Number(pendingFees._sum.paidAmount || 0),
    },
    attendanceTrend,
  }, 'Principal overview');
}

// ---------------- Students ----------------
export async function listPrincipalStudents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { classId, sectionId, q } = req.query as { classId?: string; sectionId?: string; q?: string };
  const where: any = { schoolId, deletedAt: null };
  if (classId) where.classId = classId;
  if (sectionId) where.sectionId = sectionId;
  if (q) where.OR = [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { admissionNo: { contains: q, mode: 'insensitive' } }];

  const students = await prisma.student.findMany({ where, include: { class: true, section: true }, orderBy: { admissionNo: 'asc' } });
  const att = await attendanceStats(schoolId);
  const acad = await academicPerformanceMap(schoolId);
  const feesRows = await prisma.studentFee.findMany({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } }, select: { studentId: true, totalAmount: true, paidAmount: true } });
  const feeMap = new Map<Id, number>();
  for (const f of feesRows) feeMap.set(f.studentId, (feeMap.get(f.studentId) || 0) + (Number(f.totalAmount) - Number(f.paidAmount)));

  const data = students.map((s) => {
    const a = att.perStudent.get(s.id);
    const ac = acad.get(s.id);
    const attendancePct = a ? pct(a.present, a.total) : 0;
    return {
      id: s.id, admissionNo: s.admissionNo, firstName: s.firstName, lastName: s.lastName,
      className: s.class?.name, sectionName: s.section?.name, gender: s.gender,
      attendancePct, totalAttendance: a?.total || 0,
      academicPct: ac?.avg || 0,
      pendingFees: feeMap.get(s.id) || 0,
      feeStatus: (feeMap.get(s.id) || 0) > 0 ? 'PENDING' : 'CLEAR',
    };
  });
  return ok(res, data, 'Students fetched');
}

export async function getPrincipalStudent(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { class: true, section: true, parents: { include: { parent: true } }, fees: { include: { structure: true, payments: true } }, documents: true },
  });
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const att = await attendanceStats(schoolId);
  const acad = await academicPerformanceMap(schoolId);
  const a = att.perStudent.get(student.id);
  const attendance = {
    present: a?.present || 0, total: a?.total || 0, pct: a ? pct(a.present, a.total) : 0,
    recent: await prisma.attendance.findMany({ where: { studentId: student.id }, orderBy: { date: 'desc' }, take: 15, select: { date: true, status: true } }),
  };
  const academic = {
    avg: acad.get(student.id)?.avg || 0,
    results: await prisma.examResult.findMany({
      where: { studentId: student.id, published: true }, include: { exam: true, examSubject: { include: { subject: true } } }, orderBy: { createdAt: 'desc' },
    }),
  };
  const pendingFees = student.fees
    .filter((f: any) => ['PENDING', 'PARTIAL'].includes(f.status))
    .map((f: any) => ({ id: f.id, name: f.structure?.name, total: Number(f.totalAmount), paid: Number(f.paidAmount), due: Number(f.totalAmount) - Number(f.paidAmount), dueDate: f.dueDate, status: f.status }));
  return ok(res, { student: { id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName, gender: student.gender, dob: student.dob, photoUrl: student.photoUrl, className: student.class?.name, sectionName: student.section?.name, parents: student.parents }, attendance, academic, pendingFees }, 'Student detail');
}

export async function atRiskStudents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const attThreshold = Number(req.query.attendanceBelow || 75);
  const acadThreshold = Number(req.query.academicBelow || 50);
  const students = await prisma.student.findMany({ where: { schoolId, deletedAt: null }, include: { class: true, section: true } });
  const att = await attendanceStats(schoolId);
  const acad = await academicPerformanceMap(schoolId);
  const data = students
    .map((s) => {
      const a = att.perStudent.get(s.id);
      const attendancePct = a ? pct(a.present, a.total) : 0;
      return { id: s.id, admissionNo: s.admissionNo, name: `${s.firstName} ${s.lastName}`, className: `${s.class?.name || ''}${s.section?.name ? '-' + s.section.name : ''}`, attendancePct, academicPct: acad.get(s.id)?.avg || 0 };
    })
    .filter((s) => s.attendancePct < attThreshold || s.academicPct < acadThreshold)
    .sort((a, b) => Math.min(a.attendancePct, a.academicPct) - Math.min(b.attendancePct, b.academicPct));
  return ok(res, data, 'At-risk students');
}

// ---------------- Teachers ----------------
export async function listPrincipalTeachers(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: { sections: { include: { section: { include: { class: true } } } }, subjects: { include: { subject: true } }, homework: true, marks: true },
    orderBy: { firstName: 'asc' },
  });
  const sectionIds = teachers.flatMap((t) => t.sections.map((s) => s.sectionId));
  const studentsBySection = await prisma.student.groupBy({ by: ['sectionId'], where: { schoolId, sectionId: { in: sectionIds }, deletedAt: null }, _count: true });
  const countMap = new Map(studentsBySection.map((s) => [s.sectionId, s._count]));
  const data = teachers.map((t) => {
    const classes = Array.from(new Set(t.sections.map((s) => s.section.class?.name).filter(Boolean)));
    const subjects = t.subjects.map((s) => s.subject.name);
    const std = t.sections.reduce((sum, s) => sum + (countMap.get(s.sectionId) || 0), 0);
    return {
      id: t.id, firstName: t.firstName, lastName: t.lastName, empCode: t.empCode, designation: t.designation, phone: t.phone,
      classes: classes.join(', '), subjects: subjects.join(', '), assignedSections: t.sections.length, assignedSubjects: t.subjects.length,
      assignedStudents: std, workloadScore: t.sections.length + t.subjects.length,
      homeworkPosted: t.homework.length, marksEntered: t.marks.length,
    };
  });
  return ok(res, data, 'Teachers fetched');
}

// ---------------- Attendance analytics ----------------
export async function attendanceAnalytics(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const rows = await prisma.attendance.findMany({ where: { schoolId }, select: { studentId: true, status: true, date: true } });
  const students = await prisma.student.findMany({ where: { schoolId, deletedAt: null }, select: { id: true, section: { select: { name: true, class: { select: { name: true } } } } } });
  const classMap = new Map(students.map((s) => [s.id, s.section ? `${s.section.class.name}-${s.section.name}` : 'Unassigned']));

  const today = new Date().toISOString().slice(0, 10);
  const todayRecs = rows.filter((r) => r.date.toISOString().slice(0, 10) === today);
  const todayByClass = new Map<string, { total: number; present: number }>();
  for (const r of todayRecs) {
    const key = classMap.get(r.studentId) || 'Unassigned';
    const c = todayByClass.get(key) || { total: 0, present: 0 };
    c.total++; if (r.status === 'PRESENT') c.present++; todayByClass.set(key, c);
  }
  const classWise = Array.from(todayByClass.entries()).map(([name, c]) => ({ name, total: c.total, present: c.present, pct: pct(c.present, c.total) })).sort((a, b) => a.pct - b.pct);

  const start = new Date(); start.setDate(start.getDate() - 29);
  const monthDay = new Map<string, { total: number; present: number }>();
  for (const r of rows) {
    if (r.date < start) continue;
    const key = r.date.toISOString().slice(0, 10);
    const c = monthDay.get(key) || { total: 0, present: 0 };
    c.total++; if (r.status === 'PRESENT') c.present++; monthDay.set(key, c);
  }
  const trend = Array.from(monthDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, c]) => ({ day, pct: pct(c.present, c.total) }));

  const perStudent = new Map<Id, { total: number; present: number }>();
  for (const r of rows) { const s = perStudent.get(r.studentId) || { total: 0, present: 0 }; s.total++; if (r.status === 'PRESENT') s.present++; perStudent.set(r.studentId, s); }
  const lowAttendance = Array.from(perStudent.entries())
    .map(([sid, c]) => ({ className: classMap.get(sid), pct: pct(c.present, c.total) }))
    .filter((x) => x.pct < 75 && x.pct > 0)
    .sort((a, b) => a.pct - b.pct).slice(0, 10);

  return ok(res, {
    todayPct: pct(todayRecs.filter((r) => r.status === 'PRESENT').length, todayRecs.length),
    classWise, trend, lowAttendance,
  }, 'Attendance analytics');
}

// ---------------- Academic performance ----------------
export async function academicPerformance(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { examId, classId, subjectId } = req.query as { examId?: string; classId?: string; subjectId?: string };

  const subjRows = await prisma.examSubject.findMany({
    where: { exam: { schoolId } },
    select: { id: true, maxMarks: true, passMarks: true, subject: { select: { id: true, name: true } }, exam: { select: { id: true, name: true } } },
  });
  const selectedSubjects = subjRows.filter((s) => (!examId || s.exam.id === examId) && (!subjectId || s.subject.id === subjectId));
  const maxMap = new Map(subjRows.map((s) => [s.id, s.maxMarks || 1]));
  const passMap = new Map(subjRows.map((s) => [s.id, s.passMarks || 0]));
  const subjectNameMap = new Map(subjRows.map((s) => [s.id, s.subject.name]));

  const students = await prisma.student.findMany({ where: { schoolId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, section: { select: { name: true, class: { select: { name: true, id: true } } } } } });
  const classByStudent = new Map(students.map((s) => [s.id, s.section?.class.name || 'Unassigned']));
  const nameByStudent = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  const classDefs = await prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true } });
  const classIdsFromSections = new Set(students.map((s) => s.section?.class.id).filter(Boolean));

  const results = await prisma.examResult.findMany({
    where: { schoolId, published: true, examSubjectId: { in: selectedSubjects.map((s) => s.id) } },
    select: { studentId: true, examSubjectId: true, marksObtained: true },
  });

  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const gradeOf = (p: number) => (p >= 90 ? 'A' : p >= 75 ? 'B' : p >= 60 ? 'C' : p >= 40 ? 'D' : 'F');

  const subjectAgg = new Map<string, { sum: number; count: number; pass: number }>();
  const studentAvg = new Map<Id, { sum: number; count: number }>();
  for (const r of results) {
    const subjId = r.examSubjectId;
    const name = subjectNameMap.get(subjId) || 'Unknown';
    const p = (Number(r.marksObtained) / (maxMap.get(subjId) || 1)) * 100;
    const agg = subjectAgg.get(name) || { sum: 0, count: 0, pass: 0 };
    agg.sum += p; agg.count++; if (p >= (passMap.get(subjId) || 0)) agg.pass++; subjectAgg.set(name, agg);
    gradeCounts[gradeOf(p)]++;
    const sa = studentAvg.get(r.studentId) || { sum: 0, count: 0 };
    sa.sum += p; sa.count++; studentAvg.set(r.studentId, sa);
  }

  const subjectWise = Array.from(subjectAgg.entries()).map(([name, agg]) => ({ subject: name, average: Math.round(agg.sum / agg.count), count: agg.count, passPct: pct(agg.pass, agg.count) }));

  // Class-wise
  const classAgg = new Map<string, { sum: number; count: number; totalSubjects: number }>();
  for (const [sid, avg] of studentAvg) {
    const name = classByStudent.get(sid) || 'Unassigned';
    const agg = classAgg.get(name) || { sum: 0, count: 0, totalSubjects: 0 };
    agg.sum += Math.round(avg.sum / avg.count); agg.count++; classAgg.set(name, agg);
  }
  let classWise = Array.from(classAgg.entries()).map(([name, agg]) => ({ className: name, average: Math.round(agg.sum / agg.count), students: agg.count }));
  if (classId) {
    const keep = new Set<string>();
    students.forEach((s) => { if (s.section?.class.id === classId) keep.add(classByStudent.get(s.id) || ''); });
    classWise = classWise.filter((c) => keep.has(c.className));
  }

  const examAgg = new Map<string, { sum: number; count: number }>();
  for (const r of results) {
    const subj = subjRows.find((s) => s.id === r.examSubjectId);
    if (!subj) continue;
    const agg = examAgg.get(subj.exam.name) || { sum: 0, count: 0 };
    agg.sum += (Number(r.marksObtained) / (maxMap.get(r.examSubjectId) || 1)) * 100; agg.count++; examAgg.set(subj.exam.name, agg);
  }
  const examWise = Array.from(examAgg.entries()).map(([name, agg]) => ({ exam: name, average: Math.round(agg.sum / agg.count), students: agg.count }));

  const studentList = Array.from(studentAvg.entries()).map(([sid, agg]) => ({
    studentId: sid, name: nameByStudent.get(sid) || sid, className: classByStudent.get(sid) || '', average: Math.round(agg.sum / agg.count), grade: gradeOf(Math.round(agg.sum / agg.count)),
  }));
  const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({ grade, count }));
  const passOverall = results.length ? pct(results.filter((r) => (Number(r.marksObtained) / (maxMap.get(r.examSubjectId) || 1)) * 100 >= (passMap.get(r.examSubjectId) || 0)).length, results.length) : 0;
  const overallAverage = results.length ? Math.round(results.reduce((sum, r) => sum + (Number(r.marksObtained) / (maxMap.get(r.examSubjectId) || 1)) * 100, 0) / results.length) : 0;

  return ok(res, {
    overallAverage, passPct: passOverall, gradeDistribution,
    subjectWise, classWise, examWise,
    classDefs: classDefs.filter((c) => !classId || c.id === classId).map((c) => ({ ...c, hasData: classIdsFromSections.has(c.id) })),
    topStudents: [...studentList].sort((a, b) => b.average - a.average).slice(0, 10),
    requiresAttention: [...studentList].sort((a, b) => a.average - b.average).filter((s) => s.average < 50).slice(0, 10),
  }, 'Academic performance');
}

// ---------------- Exams & results ----------------
export async function listPrincipalExams(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const exams = await prisma.exam.findMany({ where: { schoolId }, include: { session: true, subjects: { include: { subject: true, results: true } } }, orderBy: { startDate: 'desc' } });
  const data = exams.map((e) => {
    const subjects = e.subjects.map((s: any) => ({ name: s.subject.name, maxMarks: s.maxMarks }));
    const expected = e.subjects.reduce((sum: number, s: any) => sum + (s.results?.length || 0), 0);
    const published = e.subjects.reduce((sum: number, s: any) => sum + (s.results?.filter((r: any) => r.published).length || 0), 0);
    return {
      id: e.id, name: e.name, session: e.session?.name, startDate: e.startDate, endDate: e.endDate, subjects,
      marksSubmittedPct: expected ? 100 : 0, resultsPublishedPct: expected ? pct(published, expected) : 0, pending: expected - published,
    };
  });
  return ok(res, data, 'Exams fetched');
}

// ---------------- Admissions monitoring ----------------
export async function admissionMonitoring(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const admissions = await prisma.admission.findMany({ where: { schoolId }, include: { class: true }, orderBy: { createdAt: 'desc' } });
  const counts: Record<string, number> = { total: admissions.length };
  for (const a of admissions) counts[a.status] = (counts[a.status] || 0) + 1;
  return ok(res, { counts, list: admissions }, 'Admission monitoring');
}

// ---------------- Fees overview ----------------
export async function feeOverview(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [todayCol, monthCol, pending, overdue] = await Promise.all([
    prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: today } }, _sum: { amount: true }, _count: true }),
    prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.studentFee.aggregate({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } }, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.studentFee.findMany({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today } }, select: { totalAmount: true, paidAmount: true } }),
  ]);
  const students = await prisma.student.findMany({
    where: { schoolId, deletedAt: null },
    select: { id: true, section: { select: { name: true, class: { select: { name: true } } } }, fees: { where: { status: { in: ['PENDING', 'PARTIAL'] } }, select: { totalAmount: true, paidAmount: true } } },
  });
  const classWise = new Map<string, { pending: number; collected: number }>();
  for (const s of students) {
    const key = s.section ? `${s.section.class.name}-${s.section.name}` : 'Unassigned';
    const c = classWise.get(key) || { pending: 0, collected: 0 };
    for (const f of s.fees) c.pending += Number(f.totalAmount) - Number(f.paidAmount);
    classWise.set(key, c);
  }
  return ok(res, {
    todayCollection: Number(todayCol._sum.amount || 0), todayPayments: todayCol._count,
    monthCollection: Number(monthCol._sum.amount || 0),
    pendingAmount: Number(pending._sum.totalAmount || 0) - Number(pending._sum.paidAmount || 0),
    overdueAmount: overdue.reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.paidAmount)), 0),
    overdueCount: overdue.length,
    classWise: Array.from(classWise.entries()).map(([name, c]) => ({ name, pending: Math.round(c.pending) })),
  }, 'Fee overview');
}

// ---------------- Homework ----------------
export async function homeworkMonitor(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const homeworks = await prisma.homework.findMany({
    where: { schoolId }, include: { subject: true, section: { include: { class: true } }, submissions: true }, orderBy: { dueDate: 'desc' }, take: 200,
  });
  const data = homeworks.map((h) => ({
    id: h.id, title: h.title, subject: h.subject.name, section: h.section ? `${h.section.class.name}-${h.section.name}` : 'Whole school',
    dueDate: h.dueDate, submissions: h.submissions.length, published: h.published,
  }));
  return ok(res, data, 'Homework monitor');
}

// ---------------- Approvals ----------------
export async function listApprovals(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { status } = req.query as { status?: string };
  const where: any = { schoolId };
  if (status) where.status = status;
  const approvals = await prisma.approvalRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  return ok(res, approvals, 'Approvals fetched');
}

export async function createApproval(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { type, referenceId, reference, title, description } = createApprovalSchema.parse(req.body);
  const approval = await prisma.approvalRequest.create({
    data: { schoolId, type, referenceId, reference, title, description, requestedBy: req.auth!.sub },
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_APPROVAL', module: 'APPROVALS', details: { id: approval.id, type } });
  return created(res, approval, 'Approval request created');
}

export async function reviewApproval(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const approval = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
  if (!approval || approval.schoolId !== schoolId) throw new ApiError(404, 'Approval not found');
  const action = String(req.body.action || '').toUpperCase();
  const statusMap: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', CHANGES: 'CHANGES_REQUESTED' };
  if (!statusMap[action]) throw new ApiError(400, 'Invalid action');
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: statusMap[action], comment: req.body.comment ?? null, reviewedBy: req.auth!.sub, reviewedAt: new Date() },
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: `APPROVAL_${statusMap[action]}`, module: 'APPROVALS', details: { id: approval.id, type: approval.type, comment: req.body.comment } });
  if (approval.requestedBy) {
    try {
      await prisma.notification.create({
        data: { schoolId, userId: approval.requestedBy, type: 'APPROVAL', title: `Approval ${statusMap[action].toLowerCase()}`, message: `${approval.title} was ${statusMap[action].toLowerCase()}` },
      });
    } catch { /* non-fatal */ }
  }
  return ok(res, updated, 'Approval updated');
}

// ---------------- Combined analytics ----------------
export async function principalAnalytics(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [students, admissions, feePayments] = await Promise.all([
    prisma.student.findMany({ where: { schoolId, deletedAt: null }, select: { createdAt: true } }),
    prisma.admission.findMany({ where: { schoolId }, select: { createdAt: true, status: true } }),
    prisma.feePayment.findMany({ where: { schoolId }, select: { paidAt: true, amount: true } }),
  ]);
  const studentGrowth: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = monthKey(d);
    studentGrowth.push({ month: key, count: students.filter((s) => monthKey(new Date(s.createdAt)) === key).length });
  }
  const admissionTrend: Record<string, number> = {};
  for (const a of admissions) { const k = monthKey(new Date(a.createdAt)); admissionTrend[k] = (admissionTrend[k] || 0) + 1; }
  const admissionStatus: Record<string, number> = {};
  for (const a of admissions) admissionStatus[a.status] = (admissionStatus[a.status] || 0) + 1;
  const revenueTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); d.setDate(1); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setMonth(next.getMonth() + 1);
    const amount = feePayments.filter((f) => f.paidAt >= d && f.paidAt < next).reduce((sum, f) => sum + Number(f.amount), 0);
    return { month: monthKey(d), amount };
  });
  const att = await attendanceStats(schoolId);
  return ok(res, { studentGrowth, admissionTrend, admissionStatus, revenueTrend, attendancePct: att.pct }, 'Principal analytics');
}