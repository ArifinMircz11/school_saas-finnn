import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { createSchoolSchema, updateSchoolSchema, schoolStatusSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword } from '../utils/password';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function schoolCollection(name: string, schoolId: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function allSchools(): Promise<Doc[]> {
  const snapshot = await dbOrThrow().collection('schools').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function allInSchool(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await schoolCollection(name, schoolId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function planById(id?: string | null): Promise<Doc | null> {
  if (!id) return null;
  const snapshot = await dbOrThrow().collection('system_subscriptionPlans').doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function hydrateSchool(school: Doc, detailed = false): Promise<Doc> {
  const [plan, students, teachers, parents, users, subscriptions] = await Promise.all([
    planById(school.planId),
    allInSchool(school.id, 'students'),
    allInSchool(school.id, 'teachers'),
    detailed ? allInSchool(school.id, 'parents') : Promise.resolve([]),
    detailed ? allInSchool(school.id, 'users') : Promise.resolve([]),
    allInSchool(school.id, 'schoolSubscriptions'),
  ]);
  const result: Doc = {
    ...school,
    plan,
    _count: detailed
      ? { students: students.length, teachers: teachers.length, parents: parents.length, users: users.length }
      : { students: students.length, teachers: teachers.length, subscriptions: subscriptions.length },
  };
  if (detailed) {
    result.subscriptions = await Promise.all(subscriptions.map(async (subscription) => {
      const [subscriptionPlan, invoices] = await Promise.all([
        planById(subscription.planId),
        allInSchool(school.id, 'invoices'),
      ]);
      return {
        ...subscription,
        plan: subscriptionPlan,
        invoices: invoices.filter((invoice) => invoice.subscriptionId === subscription.id),
      };
    }));
  }
  return result;
}

function omitUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function listSchools(req: Request, res: Response) {
  const { status, q } = req.query as { status?: string; q?: string };
  let schools = await allSchools();
  schools = schools.filter((school) => school.deletedAt == null);
  if (status) schools = schools.filter((school) => String(school.status).toUpperCase() === String(status).toUpperCase());
  if (q) {
    const query = q.toLowerCase();
    schools = schools.filter((school) => [school.name, school.code].some((value) => String(value || '').toLowerCase().includes(query)));
  }
  schools.sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
    return bDate - aDate;
  });
  return ok(res, await Promise.all(schools.map((school) => hydrateSchool(school))), 'Schools fetched');
}

export async function getSchool(req: Request, res: Response) {
  const school = (await allSchools()).find((item) => item.id === req.params.id);
  if (!school || school.deletedAt) throw new ApiError(404, 'School not found');
  return ok(res, await hydrateSchool(school, true), 'School fetched');
}

export async function createSchool(req: Request, res: Response) {
  const body = createSchoolSchema.parse(req.body);
  const schools = await allSchools();
  if (schools.some((school) => school.code === body.code)) throw new ApiError(409, 'School code already exists');
  if (body.domain && schools.some((school) => school.domain === body.domain)) throw new ApiError(409, 'School domain already exists');
  const id = randomUUID();
  const school: Doc = {
    id, name: body.name, code: body.code, domain: body.domain ?? null,
    email: body.email ?? null, phone: body.phone ?? null, address: body.address ?? null,
    city: body.city ?? null, state: body.state ?? null, country: body.country || 'IN',
    logoUrl: null, status: 'PENDING', planId: null,
    maxStudents: 1000, maxTeachers: 100, maxAdmins: 5, maxStorageMb: 10240,
    enabledModules: {}, settings: { academicYear: String(new Date().getFullYear()) },
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };
  await dbOrThrow().collection('schools').doc(id).create(school);
  await auditLog({ userId: req.auth?.sub, schoolId: id, ip: req.ip, action: 'CREATE_SCHOOL', module: 'SCHOOLS', details: { code: school.code } });
  return created(res, school, 'School created; pending approval');
}

export async function updateSchool(req: Request, res: Response) {
  const body = updateSchoolSchema.parse(req.body);
  const ref = dbOrThrow().collection('schools').doc(req.params.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'School not found');
  const otherSchools = (await allSchools()).filter((school) => school.id !== req.params.id);
  if (body.code && otherSchools.some((school) => school.code === body.code)) throw new ApiError(409, 'School code already exists');
  if (body.domain && otherSchools.some((school) => school.domain === body.domain)) throw new ApiError(409, 'School domain already exists');
  const patch = { ...omitUndefined(body as Record<string, unknown>), updatedAt: new Date() };
  await ref.update(patch);
  const school = { id: snapshot.id, ...snapshot.data(), ...patch };
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'UPDATE_SCHOOL', module: 'SCHOOLS' });
  return ok(res, school, 'School updated');
}

export async function updateSchoolStatus(req: Request, res: Response) {
  const { status } = schoolStatusSchema.parse(req.body);
  const ref = dbOrThrow().collection('schools').doc(req.params.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'School not found');
  const prev = snapshot.get('status');
  await ref.update({ status, updatedAt: new Date() });
  const school = { id: snapshot.id, ...snapshot.data(), status, updatedAt: new Date() };
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: `SET_SCHOOL_STATUS:${status}`, module: 'SCHOOLS', details: { prev } });
  return ok(res, school, `School status set to ${status}`);
}

export async function archiveSchool(req: Request, res: Response) {
  const ref = dbOrThrow().collection('schools').doc(req.params.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'School not found');
  const updatedAt = new Date();
  const deletedAt = updatedAt;
  await ref.update({ status: 'ARCHIVED', deletedAt, updatedAt });
  const school = { id: snapshot.id, ...snapshot.data(), status: 'ARCHIVED', deletedAt, updatedAt };
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'ARCHIVE_SCHOOL', module: 'SCHOOLS' });
  return ok(res, school, 'School archived');
}

/** Create a school and its school-admin account in one Firestore batch. */
export async function createSchoolWithAdmin(req: Request, res: Response) {
  const body = createSchoolSchema.parse(req.body);
  const adminBody = (req.body as any).admin || {};
  if (!adminBody.email || !adminBody.password) throw new ApiError(400, 'admin.email and admin.password required');

  const schools = await allSchools();
  if (schools.some((school) => school.code === body.code)) throw new ApiError(409, 'School code already exists');
  if (body.domain && schools.some((school) => school.domain === body.domain)) throw new ApiError(409, 'School domain already exists');

  const adminEmail = String(adminBody.email).toLowerCase();
  const users = await dbOrThrow().collectionGroup('users').where('email', '==', adminEmail).limit(1).get();
  const globalUsers = await dbOrThrow().collection('system_users').where('email', '==', adminEmail).limit(1).get();
  if (!users.empty || !globalUsers.empty) throw new ApiError(409, 'User already exists');

  const passwordHash = await hashPassword(adminBody.password);
  const db = dbOrThrow();
  const schoolId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const school: Doc = {
    id: schoolId, name: body.name, code: body.code, domain: body.domain ?? null,
    email: body.email ?? null, phone: body.phone ?? null, address: body.address ?? null,
    city: body.city ?? null, state: body.state ?? null, country: body.country || 'IN',
    logoUrl: null, status: 'ACTIVE', planId: null,
    maxStudents: 1000, maxTeachers: 100, maxAdmins: 5, maxStorageMb: 10240,
    enabledModules: {}, settings: { academicYear: String(new Date().getFullYear()) },
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };
  const user = {
    id: userId, schoolId, email: adminEmail,
    firstName: adminBody.firstName || 'School', lastName: adminBody.lastName || 'Admin',
    phone: null, passwordHash, avatarUrl: null, emailVerified: true, isActive: true,
    lastLoginAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const permissions = await db.collection('system_permissions').get();
  const batch = db.batch();
  batch.create(db.collection('schools').doc(schoolId), school);
  batch.create(schoolCollection('users', schoolId).doc(userId), user);
  batch.create(schoolCollection('userRoleAssignments', schoolId).doc(roleId), {
    id: roleId, userId, role: 'SCHOOL_ADMIN', assignedBy: req.auth?.sub ?? null,
  });
  permissions.docs.forEach((permission) => {
    const id = randomUUID();
    batch.create(schoolCollection('userPermissions', schoolId).doc(id), {
      id, userId, permissionId: permission.id, granted: true,
    });
  });
  await batch.commit();
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SCHOOL_WITH_ADMIN', module: 'SCHOOLS' });
  return created(res, school, 'School and admin account created');
}
