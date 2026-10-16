import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { createApprovalSchema } from '../validators';
import { sendNotification } from '../services/notification.service';

type Doc = Record<string, any>;
type Id = string;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function all(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function one(schoolId: string, name: string, id?: string | null): Promise<Doc | null> {
  if (!id) return null;
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as Doc : null;
}

async function byField(schoolId: string, name: string, field: string, value: unknown): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}
function isoDate(value: any): string {
  return new Date(millis(value)).toISOString().slice(0, 10);
}
function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }
function within(value: any, start: Date, end: Date) {
  const timestamp = millis(value);
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

async function attendanceStats(schoolId: string) {
  const rows = await all(schoolId, 'attendances');
  const perStudent = new Map<Id, { total: number; present: number }>();
  for (const row of rows) {
    const item = perStudent.get(row.studentId) || { total: 0, present: 0 };
    item.total++;
    if (row.status === 'PRESENT') item.present++;
    perStudent.set(row.studentId, item);
  }
  const total = rows.length;
  const present = rows.filter((row) => row.status === 'PRESENT').length;
  return { rows, perStudent, total, present, pct: pct(present, total) };
}

async function academicPerformanceMap(schoolId: string) {
  const [examSubjects, examResults] = await Promise.all([all(schoolId, 'examSubjects'), all(schoolId, 'examResults')]);
  const maxMap = new Map(examSubjects.map((item) => [item.id, Number(item.maxMarks) || 1]));
  const perStudent = new Map<Id, { sumPct: number; count: number; avg: number }>();
  for (const result of examResults) {
    const max = maxMap.get(result.examSubjectId);
    if (!max) continue;
    const item = perStudent.get(result.studentId) || { sumPct: 0, count: 0, avg: 0 };
    item.sumPct += (Number(result.marksObtained) / max) * 100;
    item.count++;
    perStudent.set(result.studentId, item);
  }
  perStudent.forEach((item) => { item.avg = item.count ? Math.round(item.sumPct / item.count) : 0; });
  return perStudent;
}

async function hydrateStudent(schoolId: string, student: Doc, detail = false) {
  const [cls, section, links, parents] = await Promise.all([
    one(schoolId, 'classes', student.classId), one(schoolId, 'sections', student.sectionId),
    byField(schoolId, 'studentParents', 'studentId', student.id), all(schoolId, 'parents'),
  ]);
  const parentLinks = links.map((link) => ({ ...link, parent: parents.find((parent) => parent.id === link.parentId) || null }));
  const hydrated: Doc = { ...student, class: cls, section, parents: parentLinks };
  if (detail) {
    const [fees, documents, attendance] = await Promise.all([
      byField(schoolId, 'studentFees', 'studentId', student.id),
      byField(schoolId, 'studentDocuments', 'studentId', student.id),
      byField(schoolId, 'attendances', 'studentId', student.id),
    ]);
    hydrated.fees = await Promise.all(fees.map(async (fee) => ({
      ...fee,
      structure: await one(schoolId, 'feeStructures', fee.structureId),
      payments: await byField(schoolId, 'feePayments', 'studentFeeId', fee.id),
    })));
    hydrated.documents = documents;
    hydrated.attendance = attendance;
  }
  return hydrated;
}

async function hydrateResult(schoolId: string, result: Doc) {
  const [exam, examSubject, student] = await Promise.all([
    one(schoolId, 'exams', result.examId),
    one(schoolId, 'examSubjects', result.examSubjectId),
    one(schoolId, 'students', result.studentId),
  ]);
  const subject = examSubject ? await one(schoolId, 'subjects', examSubject.subjectId) : null;
  return { ...result, exam, examSubject: examSubject ? { ...examSubject, subject } : null, student };
}

// ---------------- Profile ----------------
export async function getPrincipalProfile(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const profiles = await byField(schoolId, 'principalProfiles', 'userId', req.auth!.sub);
  const profile = profiles[0] || null;
  const schoolSnapshot = await dbOrThrow().collection('schools').doc(schoolId).get();
  const school = schoolSnapshot.exists ? { id: schoolSnapshot.id, ...schoolSnapshot.data() } : null;
  return ok(res, profile ? {
    ...profile,
    school: school ? { id: school.id, name: school.name, logoUrl: school.logoUrl, settings: school.settings } : null,
  } : null, 'Principal profile fetched');
}

// ---------------- Executive overview ----------------
export async function principalOverview(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [students, teachers, classes, att, admissions, approvals, payments, fees, exams] = await Promise.all([
    all(schoolId, 'students'), all(schoolId, 'teachers'), all(schoolId, 'classes'),
    attendanceStats(schoolId), all(schoolId, 'admissions'), all(schoolId, 'approvalRequests'),
    all(schoolId, 'feePayments'), all(schoolId, 'studentFees'), all(schoolId, 'exams'),
  ]);
  const activeStudents = students.filter((student) => student.deletedAt == null);
  const todayAtt = att.rows.filter((row) => within(row.date, today, tomorrow));
  const todayPct = pct(todayAtt.filter((row) => row.status === 'PRESENT').length, todayAtt.length);
  const pendingAdmissions = admissions.filter((item) => ['PENDING', 'SUBMITTED'].includes(item.status)).length;
  const pendingApprovals = approvals.filter((item) => item.status === 'PENDING').length;
  const todayCollected = payments.filter((item) => within(item.paidAt, today, tomorrow)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthCollected = payments.filter((item) => millis(item.paidAt) >= monthStart.getTime()).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pending = fees.filter((item) => ['PENDING', 'PARTIAL'].includes(item.status));
  const pendingAmount = pending.reduce((sum, item) => sum + Number(item.totalAmount || 0) - Number(item.paidAmount || 0), 0);
  const overdue = pending.filter((item) => item.dueDate && millis(item.dueDate) < today.getTime()).length;
  const upcomingExams = exams.filter((item) => millis(item.startDate) >= today.getTime()).length;

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    days.push(date.toISOString().slice(0, 10));
  }
  const trendRows = att.rows.filter((row) => isoDate(row.date) >= days[0]);
  const attendanceTrend = days.map((day) => {
    const records = trendRows.filter((row) => isoDate(row.date) === day);
    return { day, pct: pct(records.filter((row) => row.status === 'PRESENT').length, records.length) };
  });
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 6);
  const weekRecords = trendRows.filter((row) => millis(row.date) >= weekStart.getTime());
  const weekPct = pct(weekRecords.filter((row) => row.status === 'PRESENT').length, weekRecords.length);

  return ok(res, {
    counts: {
      totalStudents: activeStudents.length, totalTeachers: teachers.length, totalClasses: classes.length,
      todaysAttendance: todayAtt.length, todayAttendancePct: todayPct, averageAttendancePct: att.pct,
      weeklyAttendancePct: weekPct, pendingAdmissions, pendingApprovals, upcomingExams, overdueFees: overdue,
    },
    fees: { todayCollection: todayCollected, monthCollection: monthCollected, pendingAmount },
    attendanceTrend,
  }, 'Principal overview');
}

// ---------------- Students ----------------
export async function listPrincipalStudents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { classId, sectionId, q } = req.query as { classId?: string; sectionId?: string; q?: string };
  let students = (await all(schoolId, 'students')).filter((student) => student.deletedAt == null);
  if (classId) students = students.filter((student) => student.classId === classId);
  if (sectionId) students = students.filter((student) => student.sectionId === sectionId);
  if (q) {
    const query = q.toLowerCase();
    students = students.filter((student) => [student.firstName, student.lastName, student.admissionNo].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  students.sort((a, b) => String(a.admissionNo).localeCompare(String(b.admissionNo)));
  const [att, acad, fees] = await Promise.all([attendanceStats(schoolId), academicPerformanceMap(schoolId), all(schoolId, 'studentFees')]);
  const feeMap = new Map<Id, number>();
  for (const fee of fees.filter((item) => ['PENDING', 'PARTIAL'].includes(item.status))) {
    feeMap.set(fee.studentId, (feeMap.get(fee.studentId) || 0) + Number(fee.totalAmount) - Number(fee.paidAmount));
  }
  const data = await Promise.all(students.map(async (student) => {
    const [cls, section] = await Promise.all([one(schoolId, 'classes', student.classId), one(schoolId, 'sections', student.sectionId)]);
    const attendance = att.perStudent.get(student.id);
    const academic = acad.get(student.id);
    const due = feeMap.get(student.id) || 0;
    return {
      id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName,
      className: cls?.name, sectionName: section?.name, gender: student.gender,
      attendancePct: attendance ? pct(attendance.present, attendance.total) : 0,
      totalAttendance: attendance?.total || 0, academicPct: academic?.avg || 0,
      pendingFees: due, feeStatus: due > 0 ? 'PENDING' : 'CLEAR',
    };
  }));
  return ok(res, data, 'Students fetched');
}

export async function getPrincipalStudent(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const student = await one(schoolId, 'students', req.params.id);
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const [hydratedStudent, att, acad, attendanceRows, results] = await Promise.all([
    hydrateStudent(schoolId, student, true), attendanceStats(schoolId), academicPerformanceMap(schoolId),
    byField(schoolId, 'attendances', 'studentId', student.id),
    byField(schoolId, 'examResults', 'studentId', student.id),
  ]);
  const attendanceStat = att.perStudent.get(student.id);
  const attendance = {
    present: attendanceStat?.present || 0, total: attendanceStat?.total || 0,
    pct: attendanceStat ? pct(attendanceStat.present, attendanceStat.total) : 0,
    recent: attendanceRows.sort((a, b) => millis(b.date) - millis(a.date)).slice(0, 15).map((row) => ({ date: row.date, status: row.status })),
  };
  const academic = {
    avg: acad.get(student.id)?.avg || 0,
    results: await Promise.all(results.filter((result) => result.published === true)
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt)).map((result) => hydrateResult(schoolId, result))),
  };
  const pendingFees = (hydratedStudent.fees || []).filter((fee: Doc) => ['PENDING', 'PARTIAL'].includes(fee.status))
    .map((fee: Doc) => ({
      id: fee.id, name: fee.structure?.name, total: Number(fee.totalAmount), paid: Number(fee.paidAmount),
      due: Number(fee.totalAmount) - Number(fee.paidAmount), dueDate: fee.dueDate, status: fee.status,
    }));
  return ok(res, {
    student: {
      id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName,
      gender: student.gender, dob: student.dob, photoUrl: student.photoUrl,
      className: hydratedStudent.class?.name, sectionName: hydratedStudent.section?.name, parents: hydratedStudent.parents,
    },
    attendance, academic, pendingFees,
  }, 'Student detail');
}

export async function atRiskStudents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const attThreshold = Number(req.query.attendanceBelow || 75);
  const acadThreshold = Number(req.query.academicBelow || 50);
  const students = (await all(schoolId, 'students')).filter((student) => student.deletedAt == null);
  const [att, acad] = await Promise.all([attendanceStats(schoolId), academicPerformanceMap(schoolId)]);
  const data = await Promise.all(students.map(async (student) => {
    const [cls, section] = await Promise.all([one(schoolId, 'classes', student.classId), one(schoolId, 'sections', student.sectionId)]);
    const attendance = att.perStudent.get(student.id);
    return {
      id: student.id, admissionNo: student.admissionNo, name: `${student.firstName} ${student.lastName}`,
      className: `${cls?.name || ''}${section?.name ? '-' + section.name : ''}`,
      attendancePct: attendance ? pct(attendance.present, attendance.total) : 0,
      academicPct: acad.get(student.id)?.avg || 0,
    };
  }));
  return ok(res, data.filter((student) => student.attendancePct < attThreshold || student.academicPct < acadThreshold)
    .sort((a, b) => Math.min(a.attendancePct, a.academicPct) - Math.min(b.attendancePct, b.academicPct)), 'At-risk students');
}

// ---------------- Teachers ----------------
export async function listPrincipalTeachers(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [teachers, teacherSections, teacherSubjects, students, homework, results] = await Promise.all([
    all(schoolId, 'teachers'), all(schoolId, 'teacherSections'), all(schoolId, 'teacherSubjects'),
    all(schoolId, 'students'), all(schoolId, 'homeworks'), all(schoolId, 'examResults'),
  ]);
  teachers.sort((a, b) => String(a.firstName).localeCompare(String(b.firstName)));
  const data = await Promise.all(teachers.map(async (teacher) => {
    const sections = teacherSections.filter((item) => item.teacherId === teacher.id);
    const subjects = teacherSubjects.filter((item) => item.teacherId === teacher.id);
    const hydratedSections = await Promise.all(sections.map(async (link) => {
      const section = await one(schoolId, 'sections', link.sectionId);
      return { ...link, section: section ? { ...section, class: await one(schoolId, 'classes', section.classId) } : null };
    }));
    const hydratedSubjects = await Promise.all(subjects.map(async (link) => ({ ...link, subject: await one(schoolId, 'subjects', link.subjectId) })));
    const classes = [...new Set(hydratedSections.map((link) => link.section?.class?.name).filter(Boolean))];
    const subjectNames = hydratedSubjects.map((link) => link.subject?.name).filter(Boolean);
    const assignedStudents = sections.reduce((sum, link) => sum + students.filter((student) => student.sectionId === link.sectionId && student.deletedAt == null).length, 0);
    return {
      id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName, empCode: teacher.empCode,
      designation: teacher.designation, phone: teacher.phone, classes: classes.join(', '),
      subjects: subjectNames.join(', '), assignedSections: sections.length, assignedSubjects: subjects.length,
      assignedStudents, workloadScore: sections.length + subjects.length,
      homeworkPosted: homework.filter((item) => item.teacherId === teacher.id).length,
      marksEntered: results.filter((item) => item.enteredBy === teacher.userId).length,
    };
  }));
  return ok(res, data, 'Teachers fetched');
}

// ---------------- Attendance analytics ----------------
export async function attendanceAnalytics(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [rows, students, sections, classes] = await Promise.all([
    all(schoolId, 'attendances'), all(schoolId, 'students'), all(schoolId, 'sections'), all(schoolId, 'classes'),
  ]);
  const classMap = new Map<string, string>();
  for (const student of students.filter((item) => item.deletedAt == null)) {
    const section = sections.find((item) => item.id === student.sectionId);
    const cls = section ? classes.find((item) => item.id === section.classId) : null;
    classMap.set(student.id, section && cls ? `${cls.name}-${section.name}` : 'Unassigned');
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter((row) => isoDate(row.date) === today);
  const todayByClass = new Map<string, { total: number; present: number }>();
  for (const row of todayRows) {
    const key = classMap.get(row.studentId) || 'Unassigned';
    const item = todayByClass.get(key) || { total: 0, present: 0 };
    item.total++; if (row.status === 'PRESENT') item.present++;
    todayByClass.set(key, item);
  }
  const classWise = Array.from(todayByClass.entries())
    .map(([name, item]) => ({ name, total: item.total, present: item.present, pct: pct(item.present, item.total) }))
    .sort((a, b) => a.pct - b.pct);
  const start = new Date(); start.setDate(start.getDate() - 29);
  const monthDay = new Map<string, { total: number; present: number }>();
  for (const row of rows) {
    if (millis(row.date) < start.getTime()) continue;
    const day = isoDate(row.date);
    const item = monthDay.get(day) || { total: 0, present: 0 };
    item.total++; if (row.status === 'PRESENT') item.present++;
    monthDay.set(day, item);
  }
  const trend = Array.from(monthDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, item]) => ({ day, pct: pct(item.present, item.total) }));
  const perStudent = new Map<Id, { total: number; present: number }>();
  for (const row of rows) {
    const item = perStudent.get(row.studentId) || { total: 0, present: 0 };
    item.total++; if (row.status === 'PRESENT') item.present++;
    perStudent.set(row.studentId, item);
  }
  const lowAttendance = Array.from(perStudent.entries())
    .map(([studentId, item]) => ({ className: classMap.get(studentId), pct: pct(item.present, item.total) }))
    .filter((item) => item.pct < 75 && item.pct > 0).sort((a, b) => a.pct - b.pct).slice(0, 10);
  return ok(res, { todayPct: pct(todayRows.filter((row) => row.status === 'PRESENT').length, todayRows.length), classWise, trend, lowAttendance }, 'Attendance analytics');
}

// ---------------- Academic performance ----------------
export async function academicPerformance(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { examId, classId, subjectId } = req.query as { examId?: string; classId?: string; subjectId?: string };
  const [examSubjects, exams, subjects, students, classes, results] = await Promise.all([
    all(schoolId, 'examSubjects'), all(schoolId, 'exams'), all(schoolId, 'subjects'),
    all(schoolId, 'students'), all(schoolId, 'classes'), all(schoolId, 'examResults'),
  ]);
  const subjectRows: Doc[] = examSubjects.map((item: Doc): Doc => ({
    ...item,
    exam: exams.find((exam) => exam.id === item.examId),
    subject: subjects.find((subject) => subject.id === item.subjectId),
  })).filter((item: Doc) => item.exam && item.subject
    && (!examId || item.exam.id === examId)
    && (!subjectId || item.subject.id === subjectId));
  const maxMap = new Map(subjectRows.map((item) => [item.id, Number(item.maxMarks) || 1]));
  const passMap = new Map(subjectRows.map((item) => [item.id, Number(item.passMarks) || 0]));
  const subjectNameMap = new Map(subjectRows.map((item) => [item.id, item.subject.name]));
  const studentsActive = students.filter((student) => student.deletedAt == null);
  const sectionMap = new Map((await all(schoolId, 'sections')).map((section) => [section.id, section]));
  const classByStudent = new Map(studentsActive.map((student) => {
    const section = sectionMap.get(student.sectionId);
    const cls = classes.find((item) => item.id === section?.classId);
    return [student.id, cls?.name || 'Unassigned'] as [string, string];
  }));
  const nameByStudent = new Map(studentsActive.map((student) => [student.id, `${student.firstName} ${student.lastName}`]));
  const selectedIds = new Set(subjectRows.map((item) => item.id));
  const publishedResults = results.filter((item) => item.published === true && selectedIds.has(item.examSubjectId));
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const gradeOf = (value: number) => value >= 90 ? 'A' : value >= 75 ? 'B' : value >= 60 ? 'C' : value >= 40 ? 'D' : 'F';
  const subjectAgg = new Map<string, { sum: number; count: number; pass: number }>();
  const studentAvg = new Map<Id, { sum: number; count: number }>();
  for (const result of publishedResults) {
    const subjectName = subjectNameMap.get(result.examSubjectId) || 'Unknown';
    const value = (Number(result.marksObtained) / (maxMap.get(result.examSubjectId) || 1)) * 100;
    const agg = subjectAgg.get(subjectName) || { sum: 0, count: 0, pass: 0 };
    agg.sum += value; agg.count++; if (value >= (passMap.get(result.examSubjectId) || 0)) agg.pass++;
    subjectAgg.set(subjectName, agg); gradeCounts[gradeOf(value)]++;
    const avg = studentAvg.get(result.studentId) || { sum: 0, count: 0 };
    avg.sum += value; avg.count++; studentAvg.set(result.studentId, avg);
  }
  const subjectWise = Array.from(subjectAgg.entries()).map(([name, agg]) => ({
    subject: name, average: Math.round(agg.sum / agg.count), count: agg.count, passPct: pct(agg.pass, agg.count),
  }));
  const classAgg = new Map<string, { sum: number; count: number }>();
  for (const [studentId, avg] of studentAvg) {
    const name = classByStudent.get(studentId) || 'Unassigned';
    const item = classAgg.get(name) || { sum: 0, count: 0 };
    item.sum += Math.round(avg.sum / avg.count); item.count++; classAgg.set(name, item);
  }
  let classWise = Array.from(classAgg.entries()).map(([name, item]) => ({ className: name, average: Math.round(item.sum / item.count), students: item.count }));
  if (classId) {
    const keep = new Set(studentsActive.filter((student) => {
      const section = sectionMap.get(student.sectionId);
      return section && section.classId === classId;
    }).map((student) => classByStudent.get(student.id) || ''));
    classWise = classWise.filter((item) => keep.has(item.className));
  }
  const examAgg = new Map<string, { sum: number; count: number }>();
  for (const result of publishedResults) {
    const item = subjectRows.find((subject) => subject.id === result.examSubjectId);
    if (!item) continue;
    const agg = examAgg.get(item.exam.name) || { sum: 0, count: 0 };
    agg.sum += (Number(result.marksObtained) / (maxMap.get(result.examSubjectId) || 1)) * 100;
    agg.count++; examAgg.set(item.exam.name, agg);
  }
  const examWise = Array.from(examAgg.entries()).map(([name, agg]) => ({ exam: name, average: Math.round(agg.sum / agg.count), students: agg.count }));
  const studentList = Array.from(studentAvg.entries()).map(([studentId, avg]) => ({
    studentId, name: nameByStudent.get(studentId) || studentId,
    className: classByStudent.get(studentId) || '', average: Math.round(avg.sum / avg.count),
    grade: gradeOf(Math.round(avg.sum / avg.count)),
  }));
  const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({ grade, count }));
  const passOverall = publishedResults.length ? pct(publishedResults.filter((result) =>
    (Number(result.marksObtained) / (maxMap.get(result.examSubjectId) || 1)) * 100 >= (passMap.get(result.examSubjectId) || 0)).length, publishedResults.length) : 0;
  const overallAverage = publishedResults.length ? Math.round(publishedResults.reduce((sum, result) =>
    sum + (Number(result.marksObtained) / (maxMap.get(result.examSubjectId) || 1)) * 100, 0) / publishedResults.length) : 0;
  return ok(res, {
    overallAverage, passPct: passOverall, gradeDistribution, subjectWise, classWise, examWise,
    classDefs: classes.filter((item) => !classId || item.id === classId).map((item) => ({
      ...item, hasData: studentsActive.some((student) => sectionMap.get(student.sectionId)?.classId === item.id),
    })),
    topStudents: [...studentList].sort((a, b) => b.average - a.average).slice(0, 10),
    requiresAttention: [...studentList].sort((a, b) => a.average - b.average).filter((item) => item.average < 50).slice(0, 10),
  }, 'Academic performance');
}

// ---------------- Exams & results ----------------
export async function listPrincipalExams(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [exams, sessions, examSubjects, results, subjects] = await Promise.all([
    all(schoolId, 'exams'), all(schoolId, 'academicSessions'), all(schoolId, 'examSubjects'),
    all(schoolId, 'examResults'), all(schoolId, 'subjects'),
  ]);
  exams.sort((a, b) => millis(b.startDate) - millis(a.startDate));
  const data = exams.map((exam) => {
    const subjectRows = examSubjects.filter((item) => item.examId === exam.id);
    const subjectList = subjectRows.map((item) => ({ name: subjects.find((subject) => subject.id === item.subjectId)?.name, maxMarks: item.maxMarks }));
    const expected = subjectRows.reduce((sum, subject) => sum + results.filter((result) => result.examSubjectId === subject.id).length, 0);
    const published = subjectRows.reduce((sum, subject) => sum + results.filter((result) => result.examSubjectId === subject.id && result.published === true).length, 0);
    return {
      id: exam.id, name: exam.name, session: sessions.find((session) => session.id === exam.sessionId)?.name,
      startDate: exam.startDate, endDate: exam.endDate, subjects: subjectList,
      marksSubmittedPct: expected ? 100 : 0, resultsPublishedPct: expected ? pct(published, expected) : 0, pending: expected - published,
    };
  });
  return ok(res, data, 'Exams fetched');
}

// ---------------- Admissions monitoring ----------------
export async function admissionMonitoring(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const admissions = (await all(schoolId, 'admissions')).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const counts: Record<string, number> = { total: admissions.length };
  const list = await Promise.all(admissions.map(async (admission) => {
    counts[admission.status] = (counts[admission.status] || 0) + 1;
    return { ...admission, class: await one(schoolId, 'classes', admission.classId) };
  }));
  return ok(res, { counts, list }, 'Admission monitoring');
}

// ---------------- Fees overview ----------------
export async function feeOverview(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [payments, fees, students, sections, classes] = await Promise.all([
    all(schoolId, 'feePayments'), all(schoolId, 'studentFees'),
    all(schoolId, 'students'), all(schoolId, 'sections'), all(schoolId, 'classes'),
  ]);
  const todayPayments = payments.filter((item) => millis(item.paidAt) >= today.getTime());
  const monthPayments = payments.filter((item) => millis(item.paidAt) >= monthStart.getTime());
  const pending = fees.filter((item) => ['PENDING', 'PARTIAL'].includes(item.status));
  const overdue = pending.filter((item) => item.dueDate && millis(item.dueDate) < today.getTime());
  const classWise = new Map<string, { pending: number; collected: number }>();
  for (const student of students.filter((item) => item.deletedAt == null)) {
    const section = sections.find((item) => item.id === student.sectionId);
    const cls = classes.find((item) => item.id === section?.classId);
    const key = section && cls ? `${cls.name}-${section.name}` : 'Unassigned';
    const item = classWise.get(key) || { pending: 0, collected: 0 };
    for (const fee of pending.filter((fee) => fee.studentId === student.id)) item.pending += Number(fee.totalAmount) - Number(fee.paidAmount);
    classWise.set(key, item);
  }
  return ok(res, {
    todayCollection: todayPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    todayPayments: todayPayments.length,
    monthCollection: monthPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    pendingAmount: pending.reduce((sum, item) => sum + Number(item.totalAmount || 0) - Number(item.paidAmount || 0), 0),
    overdueAmount: overdue.reduce((sum, item) => sum + Number(item.totalAmount) - Number(item.paidAmount), 0),
    overdueCount: overdue.length,
    classWise: Array.from(classWise.entries()).map(([name, item]) => ({ name, pending: Math.round(item.pending) })),
  }, 'Fee overview');
}

// ---------------- Homework ----------------
export async function homeworkMonitor(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const homeworks = (await all(schoolId, 'homeworks')).sort((a, b) => millis(b.dueDate) - millis(a.dueDate)).slice(0, 200);
  const [subjects, sections, classes, submissions] = await Promise.all([
    all(schoolId, 'subjects'), all(schoolId, 'sections'), all(schoolId, 'classes'), all(schoolId, 'homeworkSubmissions'),
  ]);
  const data = homeworks.map((homework) => {
    const section = sections.find((item) => item.id === homework.sectionId);
    const cls = classes.find((item) => item.id === section?.classId);
    return {
      id: homework.id, title: homework.title, subject: subjects.find((item) => item.id === homework.subjectId)?.name,
      section: section && cls ? `${cls.name}-${section.name}` : 'Whole school',
      dueDate: homework.dueDate, submissions: submissions.filter((item) => item.homeworkId === homework.id).length,
      published: homework.published,
    };
  });
  return ok(res, data, 'Homework monitor');
}

// ---------------- Approvals ----------------
export async function listApprovals(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { status } = req.query as { status?: string };
  let approvals = await all(schoolId, 'approvalRequests');
  if (status) approvals = approvals.filter((item) => item.status === status);
  approvals.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, approvals, 'Approvals fetched');
}

export async function createApproval(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { type, referenceId, reference, title, description } = createApprovalSchema.parse(req.body);
  const id = randomUUID();
  const approval = {
    id, schoolId, type, referenceId, reference, title, description,
    requestedBy: req.auth!.sub, status: 'PENDING', comment: null, reviewedBy: null, reviewedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  await collection(schoolId, 'approvalRequests').doc(id).create(approval);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_APPROVAL', module: 'APPROVALS', details: { id: approval.id, type } });
  return created(res, approval, 'Approval request created');
}

export async function reviewApproval(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const approval = await one(schoolId, 'approvalRequests', req.params.id);
  if (!approval || approval.schoolId !== schoolId) throw new ApiError(404, 'Approval not found');
  const action = String(req.body.action || '').toUpperCase();
  const statusMap: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', CHANGES: 'CHANGES_REQUESTED' };
  if (!statusMap[action]) throw new ApiError(400, 'Invalid action');
  const patch = { status: statusMap[action], comment: req.body.comment ?? null, reviewedBy: req.auth!.sub, reviewedAt: new Date(), updatedAt: new Date() };
  await collection(schoolId, 'approvalRequests').doc(approval.id).update(patch);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: `APPROVAL_${statusMap[action]}`, module: 'APPROVALS', details: { id: approval.id, type: approval.type, comment: req.body.comment } });
  if (approval.requestedBy) {
    try {
      await sendNotification({
        schoolId, userId: approval.requestedBy, type: 'APPROVAL',
        title: `Approval ${statusMap[action].toLowerCase()}`,
        message: `${approval.title} was ${statusMap[action].toLowerCase()}`,
      });
    } catch { /* non-fatal, same behavior as the previous implementation */ }
  }
  return ok(res, { ...approval, ...patch }, 'Approval updated');
}

// ---------------- Combined analytics ----------------
export async function principalAnalytics(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const [students, admissions, feePayments] = await Promise.all([
    all(schoolId, 'students'), all(schoolId, 'admissions'), all(schoolId, 'feePayments'),
  ]);
  const activeStudents = students.filter((student) => student.deletedAt == null);
  const studentGrowth: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(); date.setMonth(date.getMonth() - i);
    const key = monthKey(date);
    studentGrowth.push({ month: key, count: activeStudents.filter((student) => monthKey(new Date(millis(student.createdAt))) === key).length });
  }
  const admissionTrend: Record<string, number> = {};
  for (const admission of admissions) {
    const key = monthKey(new Date(millis(admission.createdAt)));
    admissionTrend[key] = (admissionTrend[key] || 0) + 1;
  }
  const admissionStatus: Record<string, number> = {};
  for (const admission of admissions) admissionStatus[admission.status] = (admissionStatus[admission.status] || 0) + 1;
  const revenueTrend = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - i)); date.setDate(1); date.setHours(0, 0, 0, 0);
    const next = new Date(date); next.setMonth(next.getMonth() + 1);
    const amount = feePayments.filter((payment) => millis(payment.paidAt) >= date.getTime() && millis(payment.paidAt) < next.getTime())
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { month: monthKey(date), amount };
  });
  const att = await attendanceStats(schoolId);
  return ok(res, { studentGrowth, admissionTrend, admissionStatus, revenueTrend, attendancePct: att.pct }, 'Principal analytics');
}
