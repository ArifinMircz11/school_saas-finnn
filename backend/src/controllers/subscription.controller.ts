import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { planSchema } from '../validators';
import { auditLog } from '../utils/audit';

export async function listPlans(req: Request, res: Response) {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  return ok(res, plans, 'Plans fetched');
}

export async function createPlan(req: Request, res: Response) {
  const body = planSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: body.name, code: body.code, price: body.price, period: body.period,
      maxStudents: body.maxStudents, maxTeachers: body.maxTeachers,
      maxAdmins: body.maxAdmins, maxStorage: body.maxStorage,
      modules: (body.modules as object) || {},
    },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'CREATE_PLAN', module: 'PLANS' });
  return created(res, plan, 'Plan created');
}

export async function updatePlan(req: Request, res: Response) {
  const body = planSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.update({
    where: { id: req.params.id },
    data: {
      name: body.name, code: body.code, price: body.price, period: body.period,
      maxStudents: body.maxStudents, maxTeachers: body.maxTeachers,
      maxAdmins: body.maxAdmins, maxStorage: body.maxStorage,
      modules: (body.modules as object) || {},
    },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'UPDATE_PLAN', module: 'PLANS', details: { planId: plan.id } });
  return ok(res, plan, 'Plan updated');
}

export async function deletePlan(req: Request, res: Response) {
  await prisma.subscriptionPlan.update({ where: { id: req.params.id }, data: { isActive: false } });
  await auditLog({ userId: req.auth?.sub, schoolId: null, ip: req.ip, action: 'DEACTIVATE_PLAN', module: 'PLANS' });
  return ok(res, null, 'Plan deactivated');
}

export async function listSubscriptions(req: Request, res: Response) {
  const { status, q } = req.query as { status?: string; q?: string };
  const where: any = {};
  if (status) where.status = String(status).toUpperCase();
  if (q) where.school = { name: { contains: q, mode: 'insensitive' } };
  const subs = await prisma.schoolSubscription.findMany({
    where, include: { school: true, plan: true, invoices: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, subs, 'Subscriptions fetched');
}

export async function createSubscription(req: Request, res: Response) {
  const body = req.body;
  const schoolId = body.schoolId! as string;
  const planId = body.planId! as string;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new ApiError(404, 'Plan not found');
  const status = (body.status || 'TRIAL').toUpperCase();
  const trialEnds = body.status === 'TRIAL' ? new Date(Date.now() + Number(body.trialDays || 14) * 24 * 60 * 60 * 1000) : null;
  const sub = await prisma.schoolSubscription.create({
    data: {
      schoolId, planId, status, trialEnds,
      startDate: new Date(),
      endDate: trialEnds || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.school.update({
    where: { id: schoolId },
    data: { planId, maxStudents: plan.maxStudents, maxTeachers: plan.maxTeachers, maxAdmins: plan.maxAdmins, maxStorageMb: plan.maxStorage, enabledModules: (plan.modules as object) || {} },
  });
  if (Number(plan.price) > 0) {
    await prisma.invoice.create({
      data: { schoolId, subscriptionId: sub.id, amount: plan.price, status: 'PENDING', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_SUBSCRIPTION', module: 'SUBSCRIPTIONS' });
  return created(res, sub, 'Subscription created');
}

export async function listInvoices(req: Request, res: Response) {
  const invoices = await prisma.invoice.findMany({ include: { school: true, subscription: { include: { plan: true } } }, orderBy: { createdAt: 'desc' } });
  return ok(res, invoices, 'Invoices fetched');
}

export async function getSchoolUsage(req: Request, res: Response) {
  const schoolId = req.params.schoolId;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!school) throw new ApiError(404, 'School not found');
  const students = await prisma.student.count({ where: { schoolId } });
  const teachers = await prisma.teacher.count({ where: { schoolId } });
  return ok(res, {
    schoolId: school.id, schoolName: school.name,
    limits: { maxStudents: school.maxStudents, maxTeachers: school.maxTeachers, maxStorageMb: school.maxStorageMb, maxAdmins: school.maxAdmins },
    usage: {
      students, teachers,
      studentsPct: school.maxStudents ? Math.round((students / school.maxStudents) * 100) : 0,
      teachersPct: school.maxTeachers ? Math.round((teachers / school.maxTeachers) * 100) : 0,
      storageMb: 0,
    },
    plan: school.subscriptions?.[0]?.plan || null,
  }, 'School usage fetched');
}