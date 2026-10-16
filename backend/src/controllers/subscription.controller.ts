import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { planSchema } from '../validators';
import { auditLog } from '../utils/audit';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function schoolCollection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function allSchools(): Promise<Doc[]> {
  const snapshot = await dbOrThrow().collection('schools').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function allInSchool(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await schoolCollection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function planById(id: string): Promise<Doc | null> {
  const snapshot = await dbOrThrow().collection('system_subscriptionPlans').doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

// ---------- PLANS ----------
export async function listPlans(req: Request, res: Response) {
  const snapshot = await dbOrThrow().collection('system_subscriptionPlans').get();
  const plans = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => Number(a.price) - Number(b.price));
  return ok(res, plans, 'Plans fetched');
}

export async function createPlan(req: Request, res: Response) {
  const body = planSchema.parse(req.body);
  const db = dbOrThrow();
  const existing = await db.collection('system_subscriptionPlans').where('code', '==', body.code).limit(1).get();
  if (!existing.empty) throw new ApiError(409, 'Plan code already exists');
  const id = randomUUID();
  const plan = {
    id, name: body.name, code: body.code, price: String(body.price), period: body.period,
    maxStudents: body.maxStudents, maxTeachers: body.maxTeachers, maxAdmins: body.maxAdmins,
    maxStorage: body.maxStorage, modules: body.modules || {}, isActive: true, createdAt: new Date(),
  };
  await db.collection('system_subscriptionPlans').doc(id).create(plan);
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'CREATE_PLAN', module: 'PLANS' });
  return created(res, plan, 'Plan created');
}

export async function updatePlan(req: Request, res: Response) {
  const body = planSchema.parse(req.body);
  const db = dbOrThrow();
  const ref = db.collection('system_subscriptionPlans').doc(req.params.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'Plan not found');
  const duplicate = await db.collection('system_subscriptionPlans').where('code', '==', body.code).get();
  if (duplicate.docs.some((doc) => doc.id !== req.params.id)) throw new ApiError(409, 'Plan code already exists');
  const patch = {
    name: body.name, code: body.code, price: String(body.price), period: body.period,
    maxStudents: body.maxStudents, maxTeachers: body.maxTeachers, maxAdmins: body.maxAdmins,
    maxStorage: body.maxStorage, modules: body.modules || {}, updatedAt: new Date(),
  };
  await ref.update(patch);
  const plan = { id: snapshot.id, ...snapshot.data(), ...patch };
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'UPDATE_PLAN', module: 'PLANS', details: { planId: plan.id } });
  return ok(res, plan, 'Plan updated');
}

export async function deletePlan(req: Request, res: Response) {
  const ref = dbOrThrow().collection('system_subscriptionPlans').doc(req.params.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'Plan not found');
  await ref.update({ isActive: false, updatedAt: new Date() });
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'DEACTIVATE_PLAN', module: 'PLANS' });
  return ok(res, null, 'Plan deactivated');
}

export async function listSubscriptions(req: Request, res: Response) {
  const { status, q } = req.query as { status?: string; q?: string };
  const schools = await allSchools();
  const subscriptions = (await Promise.all(schools.map(async (school) => {
    const rows = await allInSchool(school.id, 'schoolSubscriptions');
    return rows.map((subscription) => ({ ...subscription, school }));
  }))).flat();
  let result = subscriptions;
  if (status) result = result.filter((item) => String(item.status).toUpperCase() === String(status).toUpperCase());
  if (q) {
    const query = q.toLowerCase();
    result = result.filter((item) => String(item.school?.name || '').toLowerCase().includes(query));
  }
  result.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const hydrated = await Promise.all(result.map(async (subscription) => {
    const [plan, invoices] = await Promise.all([
      planById(subscription.planId),
      allInSchool(subscription.schoolId, 'invoices'),
    ]);
    return {
      ...subscription,
      plan,
      invoices: invoices.filter((invoice) => invoice.subscriptionId === subscription.id),
    };
  }));
  return ok(res, hydrated, 'Subscriptions fetched');
}

export async function createSubscription(req: Request, res: Response) {
  const body = req.body || {};
  const schoolId = String(body.schoolId || '');
  const planId = String(body.planId || '');
  if (!schoolId || !planId) throw new ApiError(400, 'schoolId and planId required');
  const db = dbOrThrow();
  const [plan, schoolSnapshot] = await Promise.all([
    planById(planId),
    db.collection('schools').doc(schoolId).get(),
  ]);
  if (!plan) throw new ApiError(404, 'Plan not found');
  if (!schoolSnapshot.exists) throw new ApiError(404, 'School not found');

  const status = String(body.status || 'TRIAL').toUpperCase();
  const trialEnds = body.status === 'TRIAL'
    ? new Date(Date.now() + Number(body.trialDays || 14) * 24 * 60 * 60 * 1000)
    : null;
  const id = randomUUID();
  const subscription = {
    id, schoolId, planId, status, trialEnds, startDate: new Date(),
    endDate: trialEnds || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), createdAt: new Date(),
  };
  const schoolRef = db.collection('schools').doc(schoolId);
  const batch = db.batch();
  batch.create(schoolCollection(schoolId, 'schoolSubscriptions').doc(id), subscription);
  batch.update(schoolRef, {
    planId, maxStudents: plan.maxStudents, maxTeachers: plan.maxTeachers,
    maxAdmins: plan.maxAdmins, maxStorageMb: plan.maxStorage,
    enabledModules: plan.modules || {}, updatedAt: new Date(),
  });
  let invoice: Doc | null = null;
  if (Number(plan.price) > 0) {
    const invoiceId = randomUUID();
    invoice = {
      id: invoiceId, schoolId, subscriptionId: id, amount: String(plan.price), status: 'PENDING',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), paidAt: null, createdAt: new Date(),
    };
    batch.create(schoolCollection(schoolId, 'invoices').doc(invoiceId), invoice);
  }
  await batch.commit();
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SUBSCRIPTION', module: 'SUBSCRIPTIONS' });
  return created(res, subscription, 'Subscription created');
}

export async function listInvoices(req: Request, res: Response) {
  const schools = await allSchools();
  const invoices = (await Promise.all(schools.map(async (school) => {
    const rows = await allInSchool(school.id, 'invoices');
    return rows.map((invoice) => ({ ...invoice, school }));
  }))).flat();
  invoices.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const result = await Promise.all(invoices.map(async (invoice) => {
    const subscription = (await allInSchool(invoice.schoolId, 'schoolSubscriptions'))
      .find((item) => item.id === invoice.subscriptionId) || null;
    return {
      ...invoice,
      subscription: subscription ? { ...subscription, plan: await planById(subscription.planId) } : null,
    };
  }));
  return ok(res, result, 'Invoices fetched');
}

export async function getSchoolUsage(req: Request, res: Response) {
  const schoolId = req.params.schoolId;
  const schoolSnapshot = await dbOrThrow().collection('schools').doc(schoolId).get();
  if (!schoolSnapshot.exists) throw new ApiError(404, 'School not found');
  const school: Doc = { id: schoolSnapshot.id, ...schoolSnapshot.data() };
  const [students, teachers, subscriptions] = await Promise.all([
    allInSchool(schoolId, 'students'),
    allInSchool(schoolId, 'teachers'),
    allInSchool(schoolId, 'schoolSubscriptions'),
  ]);
  subscriptions.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const plan = subscriptions[0] ? await planById(subscriptions[0].planId) : null;
  return ok(res, {
    schoolId: school.id, schoolName: school.name,
    limits: { maxStudents: school.maxStudents, maxTeachers: school.maxTeachers, maxStorageMb: school.maxStorageMb, maxAdmins: school.maxAdmins },
    usage: {
      students: students.length, teachers: teachers.length,
      studentsPct: school.maxStudents ? Math.round((students.length / school.maxStudents) * 100) : 0,
      teachersPct: school.maxTeachers ? Math.round((teachers.length / school.maxTeachers) * 100) : 0,
      storageMb: 0,
    },
    plan,
  }, 'School usage fetched');
}
