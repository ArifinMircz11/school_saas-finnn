import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { teacherSchema, parentSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { schoolOf } from './student.controller';
import { grantTeacherDefaults } from './user.controller';
import { findUserByEmail } from '../repositories/firestore-auth.repository';

type Doc = Record<string, any>;

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

async function one(schoolId: string, name: string, id: string) {
  const snapshot = await collection(schoolId, name).doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as Doc : null;
}

// ---------- TEACHERS ----------
export async function listTeachers(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [teachers, teacherSections, teacherSubjects] = await Promise.all([
    all(schoolId, 'teachers'), all(schoolId, 'teacherSections'), all(schoolId, 'teacherSubjects'),
  ]);
  teachers.sort((a, b) => String(a.firstName).localeCompare(String(b.firstName)));
  const result = await Promise.all(teachers.map(async (teacher) => {
    const [sections, subjects] = await Promise.all([
      Promise.all(teacherSections.filter((link) => link.teacherId === teacher.id).map(async (link) => ({
        ...link, section: await one(schoolId, 'sections', link.sectionId),
      }))),
      Promise.all(teacherSubjects.filter((link) => link.teacherId === teacher.id).map(async (link) => ({
        ...link, subject: await one(schoolId, 'subjects', link.subjectId),
      }))),
    ]);
    return { ...teacher, sections, subjects };
  }));
  return ok(res, result, 'Teachers fetched');
}

export async function createTeacher(req: Request, res: Response) {
  const body = teacherSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const [school, teachers] = await Promise.all([
    dbOrThrow().collection('schools').doc(schoolId).get(),
    all(schoolId, 'teachers'),
  ]);
  if (school.exists && teachers.length >= Number(school.get('maxTeachers') ?? 100)) throw new ApiError(400, 'Teacher limit reached');

  const tempHash = body.email ? await hashPassword(Math.random().toString(36).slice(2, 12)) : null;
  let createdUserId: string | undefined;
  let userId: string | null = null;
  let existingUser: Doc | null = null;
  if (body.email) {
    const email = body.email.toLowerCase();
    existingUser = await findUserByEmail(email) as Doc | null;
    if (existingUser && existingUser.schoolId !== schoolId) throw new ApiError(409, 'Email already belongs to another school account');
    if (!existingUser) {
      userId = randomUUID();
      const roleId = randomUUID();
      const user = {
        id: userId, schoolId, email, firstName: body.firstName, lastName: body.lastName,
        phone: body.phone ?? null, passwordHash: tempHash!, avatarUrl: null, emailVerified: false,
        isActive: true, lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
      };
      const batch = dbOrThrow().batch();
      batch.create(collection(schoolId, 'users').doc(userId), user);
      batch.create(collection(schoolId, 'userRoleAssignments').doc(roleId), {
        id: roleId, userId, role: 'TEACHER', assignedBy: req.auth?.sub ?? null,
      });
      await batch.commit();
      createdUserId = userId;
    } else {
      userId = existingUser.id;
    }
  }

  const empCode = await uniqueTeacherCode(schoolId, teachers);
  const teacherId = randomUUID();
  const teacher = {
    id: teacherId, schoolId, userId, firstName: body.firstName, lastName: body.lastName,
    phone: body.phone ?? null, photoUrl: null, designation: body.designation ?? null,
    empCode, createdAt: new Date(),
  };
  const batch = dbOrThrow().batch();
  batch.create(collection(schoolId, 'teachers').doc(teacherId), teacher);
  for (const sectionId of body.sectionIds || []) {
    if (!(await one(schoolId, 'sections', sectionId))) throw new ApiError(404, 'Section not found');
    const id = randomUUID();
    batch.create(collection(schoolId, 'teacherSections').doc(id), { id, teacherId, sectionId });
  }
  for (const subjectId of body.subjectIds || []) {
    if (!(await one(schoolId, 'subjects', subjectId))) throw new ApiError(404, 'Subject not found');
    const id = randomUUID();
    batch.create(collection(schoolId, 'teacherSubjects').doc(id), { id, teacherId, subjectId });
  }
  await batch.commit();
  if (createdUserId) await grantTeacherDefaults(createdUserId);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_TEACHER', module: 'TEACHERS' });
  return created(res, teacher, 'Teacher created');
}

async function uniqueTeacherCode(schoolId: string, teachers: Doc[]) {
  const existing = new Set(teachers.map((teacher) => teacher.empCode));
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `TCH-${Math.floor(100000 + Math.random() * 899999)}`;
    if (!existing.has(code)) return code;
  }
  return `TCH-${Date.now()}`;
}

// ---------- PARENTS ----------
export async function listParents(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const [parents, links, students] = await Promise.all([
    all(schoolId, 'parents'), all(schoolId, 'studentParents'), all(schoolId, 'students'),
  ]);
  parents.sort((a, b) => String(a.firstName).localeCompare(String(b.firstName)));
  return ok(res, parents.map((parent) => ({
    ...parent,
    children: links.filter((link) => link.parentId === parent.id).map((link) => ({
      ...link, student: students.find((student) => student.id === link.studentId) || null,
    })),
  })), 'Parents fetched');
}

export async function createParent(req: Request, res: Response) {
  const body = parentSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const studentIds: string[] = body.studentIds || [];
  for (const studentId of studentIds) {
    if (!(await one(schoolId, 'students', studentId))) throw new ApiError(404, 'Student not found');
  }
  const parentId = randomUUID();
  const parent = {
    id: parentId, schoolId, userId: null, firstName: body.firstName, lastName: body.lastName,
    phone: body.phone ?? null, occupation: null, createdAt: new Date(),
  };
  const batch = dbOrThrow().batch();
  batch.create(collection(schoolId, 'parents').doc(parentId), parent);
  for (const studentId of studentIds) {
    const id = randomUUID();
    batch.create(collection(schoolId, 'studentParents').doc(id), {
      id, studentId, parentId, relationship: 'PARENT', isPrimary: false,
    });
  }
  await batch.commit();
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_PARENT', module: 'PARENTS' });
  const students = await all(schoolId, 'students');
  const children = studentIds.map((studentId) => ({
    id: randomUUID(), studentId, parentId, relationship: 'PARENT', isPrimary: false,
    student: students.find((student) => student.id === studentId) || null,
  }));
  return ok(res, { ...parent, children }, 'Parent (guardian) created — parents log in with the student\'s credentials');
}

// ---------- STAFF ----------
export async function listStaff(req: Request, res: Response) {
  const staff = (await all(schoolOf(req), 'staff')).sort((a, b) => String(a.firstName).localeCompare(String(b.firstName)));
  return ok(res, staff, 'Staff fetched');
}
