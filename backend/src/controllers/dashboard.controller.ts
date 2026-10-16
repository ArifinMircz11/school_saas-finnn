import { Request, Response } from 'express';
import { getFirestoreInstance } from '../config/firestore';
import { ok } from '../utils/response';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new Error('Firestore is not configured');
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
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function time(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function within(value: any, start: Date, end: Date): boolean {
  const timestamp = time(value);
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

async function hydrateStudent(schoolId: string, student: Doc): Promise<Doc> {
  const [cls, section, attendance, fees] = await Promise.all([
    one(schoolId, 'classes', student.classId),
    one(schoolId, 'sections', student.sectionId),
    all(schoolId, 'attendances'),
    all(schoolId, 'studentFees'),
  ]);
  const recentAttendance = attendance.filter((item) => item.studentId === student.id)
    .sort((a, b) => time(b.date) - time(a.date)).slice(0, 30);
  const ownFees = await Promise.all(fees.filter((fee) => fee.studentId === student.id).map(async (fee) => ({
    ...fee,
    structure: await one(schoolId, 'feeStructures', fee.structureId),
  })));
  return { ...student, class: cls, section, attendance: recentAttendance, fees: ownFees };
}

async function guardiansForStudent(schoolId: string, studentId: string): Promise<Doc[]> {
  const [links, parents] = await Promise.all([all(schoolId, 'studentParents'), all(schoolId, 'parents')]);
  return links.filter((link) => link.studentId === studentId).map((link) => {
    const parent = parents.find((item) => item.id === link.parentId);
    return parent ? {
      id: parent.id, firstName: parent.firstName, lastName: parent.lastName,
      phone: parent.phone, relationship: link.relationship,
    } : null;
  }).filter((item): item is Doc => item !== null);
}

/** Shared dashboard summaries, branched by role. All reads are tenant-scoped. */
export async function getDashboard(req: Request, res: Response) {
  const roles = req.auth!.roles;
  const schoolId = req.auth!.schoolId;
  if (!schoolId) {
    if (roles.includes('SUPER_ADMIN')) return ok(res, { role: 'SUPER_ADMIN' }, 'Dashboard');
    return ok(res, { role: roles[0], data: {} }, 'Dashboard');
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const [students, teachers, parents, attendanceRows, feePayments, studentFees, admissions, documents] = await Promise.all([
    all(schoolId, 'students'), all(schoolId, 'teachers'), all(schoolId, 'parents'),
    all(schoolId, 'attendances'), all(schoolId, 'feePayments'), all(schoolId, 'studentFees'),
    all(schoolId, 'admissions'), all(schoolId, 'studentDocuments'),
  ]);
  const activeStudents = students.filter((student) => student.deletedAt == null);
  const totalStudents = activeStudents.length;
  const totalTeachers = teachers.length;
  const totalParents = parents.length;

  if (roles.includes('SCHOOL_ADMIN')) {
    const todayAttendance = attendanceRows.filter((row) => within(row.date, today, tomorrow)).length;
    const todayFees = feePayments.filter((row) => within(row.paidAt, today, tomorrow))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const pending = studentFees.filter((row) => ['PENDING', 'PARTIAL'].includes(row.status));
    const pendingTotal = pending.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const pendingPaid = pending.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0);
    const newAdmissions = admissions.filter((row) => within(row.createdAt, today, tomorrow)).length;
    const pendingDocuments = documents.filter((row) => row.verified === false).length;
    return ok(res, {
      role: 'SCHOOL_ADMIN',
      data: {
        totalStudents, totalTeachers, totalParents, todayAttendance,
        todayFeeCollection: todayFees,
        pendingFeesAmount: pendingTotal - pendingPaid,
        newAdmissions,
        pendingDocuments,
      },
    }, 'Dashboard');
  }

  if (roles.includes('TEACHER')) {
    const teacher = teachers.find((item) => item.userId === req.auth!.sub) || null;
    const [teacherSections, teacherSubjects, timetables, homework] = await Promise.all([
      all(schoolId, 'teacherSections'), all(schoolId, 'teacherSubjects'),
      all(schoolId, 'timetables'), all(schoolId, 'homeworks'),
    ]);
    const sectionLinks = teacherSections.filter((link) => link.teacherId === teacher?.id);
    const subjectLinks = teacherSubjects.filter((link) => link.teacherId === teacher?.id);
    const sections = await Promise.all(sectionLinks.map(async (link) => {
      const section = await one(schoolId, 'sections', link.sectionId);
      const sectionStudents = students.filter((student) => student.sectionId === link.sectionId);
      return section ? { ...link, section: { ...section, _count: { students: sectionStudents.length } } } : null;
    }));
    const subjects = await Promise.all(subjectLinks.map(async (link) => ({
      ...link, subject: await one(schoolId, 'subjects', link.subjectId),
    })));
    const teacherWithRelations = teacher ? { ...teacher, sections: sections.filter(Boolean), subjects } : null;
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const todayClasses = timetables.filter((item) => item.teacherId === teacher?.id && item.day === todayName).length;
    const myHomework = homework.filter((item) => item.teacherId === teacher?.id).length;
    const sectionIds = sectionLinks.map((link) => link.sectionId);
    const studentCount = activeStudents.filter((student) => sectionIds.includes(student.sectionId)).length;
    return ok(res, { role: 'TEACHER', data: { teacher: teacherWithRelations, todayClasses, pendingHomework: myHomework, totalStudents: studentCount } }, 'Dashboard');
  }

  if (roles.includes('STUDENT') || roles.includes('PARENT')) {
    const [studentRows, studentParentLinks, notificationRows, homeworkRows] = await Promise.all([
      Promise.resolve(students),
      all(schoolId, 'studentParents'),
      all(schoolId, 'notifications'),
      all(schoolId, 'homeworks'),
    ]);
    let studentRow = studentRows.find((item) => item.userId === req.auth!.sub) || null;
    let student: Doc | null = studentRow ? await hydrateStudent(schoolId, studentRow) : null;
    let siblings: Doc[] = [];

    if (!student && roles.includes('PARENT')) {
      const parentRecord = parents.find((item) => item.userId === req.auth!.sub);
      if (parentRecord) {
        const linked = studentParentLinks.filter((link) => link.parentId === parentRecord.id);
        const childRows = linked.map((link) => students.find((item) => item.id === link.studentId)).filter((item): item is Doc => Boolean(item));
        const hydrated = await Promise.all(childRows.map((item) => hydrateStudent(schoolId, item)));
        if (hydrated.length) {
          student = hydrated[0];
          siblings = hydrated.slice(1);
        }
      }
    }

    const guardians = student ? await guardiansForStudent(schoolId, student.id) : [];
    if (student && siblings.length === 0) {
      const parentIds = studentParentLinks.filter((link) => link.studentId === student!.id).map((link) => link.parentId);
      const siblingIds = [...new Set(studentParentLinks.filter((link) => parentIds.includes(link.parentId))
        .map((link) => link.studentId).filter((id) => id !== student!.id))];
      const siblingRows = siblingIds.map((id) => students.find((item) => item.id === id && item.deletedAt == null))
        .filter((item): item is Doc => Boolean(item));
      siblings = await Promise.all(siblingRows.map((item) => hydrateStudent(schoolId, item)));
    }

    const homeworkCount = homeworkRows.filter((item) => item.sectionId === student?.sectionId && item.published === true).length;
    const attendance = student?.attendance || [];
    const attendancePct = attendance.length
      ? Math.round((attendance.filter((item: Doc) => item.status === 'PRESENT').length / attendance.length) * 100)
      : 0;
    const unread = notificationRows.filter((item) => item.userId === req.auth!.sub && item.read === false).length;
    const reportAnalysis = await buildReportAnalysis(schoolId, student?.id);
    const allChildren = [
      ...(student ? [{ student, guardians, reportAnalysis }] : []),
      ...siblings.map((item) => ({ student: item, guardians: [], reportAnalysis: null })),
    ];

    return ok(res, {
      role: 'STUDENT',
      data: {
        children: allChildren, unread, student, parents: guardians, reportAnalysis,
        siblings: siblings.length, fees: student?.fees || [], homeworkPending: homeworkCount, attendancePct,
      },
    }, 'Dashboard');
  }

  return ok(res, { role: roles[0], data: {} }, 'Dashboard');
}

/** Aggregate published exam results into subject averages, overall average and trend. */
async function buildReportAnalysis(schoolId: string, studentId?: string | null) {
  if (!studentId) return null;
  const [results, examSubjects, subjects, exams] = await Promise.all([
    all(schoolId, 'examResults'), all(schoolId, 'examSubjects'),
    all(schoolId, 'subjects'), all(schoolId, 'exams'),
  ]);
  const published = results.filter((item) => item.studentId === studentId && item.published === true);
  if (!published.length) return null;

  const hydrated = published.map((result) => {
    const examSubject = examSubjects.find((item) => item.id === result.examSubjectId) || null;
    return {
      ...result,
      examSubject: examSubject ? {
        ...examSubject,
        subject: subjects.find((item) => item.id === examSubject.subjectId) ? {
          id: examSubject.subjectId,
          name: subjects.find((item) => item.id === examSubject.subjectId)!.name,
        } : null,
        exam: exams.find((item) => item.id === examSubject.examId) ? {
          name: exams.find((item) => item.id === examSubject.examId)!.name,
          endDate: exams.find((item) => item.id === examSubject.examId)!.endDate,
        } : null,
      } : null,
    };
  }).sort((a, b) => time(b.examSubject?.exam?.endDate) - time(a.examSubject?.exam?.endDate));

  const subjectMap: Record<string, { name: string; marks: number; max: number }> = {};
  for (const result of hydrated) {
    const key = result.examSubject?.subject?.id ?? 'unknown';
    if (!subjectMap[key]) subjectMap[key] = { name: result.examSubject?.subject?.name ?? 'Unknown', marks: 0, max: 0 };
    subjectMap[key].marks += Number(result.marksObtained);
    subjectMap[key].max += Number(result.examSubject?.maxMarks ?? 0);
  }
  const subjectAverages = Object.values(subjectMap).map((item) => ({
    name: item.name, average: item.max ? Number(((item.marks / item.max) * 100).toFixed(1)) : 0,
  }));
  const totalMarks = hydrated.reduce((sum, item) => sum + Number(item.marksObtained), 0);
  const totalMax = hydrated.reduce((sum, item) => sum + Number(item.examSubject?.maxMarks ?? 0), 0);
  const overallAverage = totalMax ? Number(((totalMarks / totalMax) * 100).toFixed(1)) : 0;
  const seen: string[] = [];
  for (const result of [...hydrated].reverse()) {
    const name = result.examSubject?.exam?.name ?? '';
    if (name && !seen.includes(name)) seen.push(name);
  }
  const examTrend = seen.length > 1 ? `${seen[0]} → ${seen[seen.length - 1]}` : seen[0] || 'No data';
  return { subjectAverages, overallAverage, examTrend, totalExams: hydrated.length };
}
