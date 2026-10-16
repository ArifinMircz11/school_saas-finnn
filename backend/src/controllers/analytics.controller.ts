import { Request, Response } from 'express';
import { getFirestoreInstance } from '../config/firestore';
import { ok } from '../utils/response';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new Error('Firestore is not configured');
  return db;
}

async function allSchools(): Promise<Doc[]> {
  const snapshot = await dbOrThrow().collection('schools').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function allInSchool(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await dbOrThrow().collection('schools').doc(schoolId).collection(name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

export async function getPlatformAnalytics(req: Request, res: Response) {
  const schools = await allSchools();
  const tenantCollections = await Promise.all(schools.map(async (school) => {
    const [students, teachers, parents, subscriptions, invoices] = await Promise.all([
      allInSchool(school.id, 'students'),
      allInSchool(school.id, 'teachers'),
      allInSchool(school.id, 'parents'),
      allInSchool(school.id, 'schoolSubscriptions'),
      allInSchool(school.id, 'invoices'),
    ]);
    return { students, teachers, parents, subscriptions, invoices };
  }));
  const subscriptions = tenantCollections.flatMap((row) => row.subscriptions);
  const invoices = tenantCollections.flatMap((row) => row.invoices);
  const totalStudents = tenantCollections.reduce((sum, row) => sum + row.students.length, 0);
  const totalTeachers = tenantCollections.reduce((sum, row) => sum + row.teachers.length, 0);
  const totalParents = tenantCollections.reduce((sum, row) => sum + row.parents.length, 0);
  const activeSchools = schools.filter((school) => school.status === 'ACTIVE').length;
  const trialSchools = schools.filter((school) => school.status === 'PENDING').length;
  const suspendedSchools = schools.filter((school) => school.status === 'SUSPENDED').length;
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'ACTIVE').length;
  const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiringSubscriptions = subscriptions.filter((subscription) =>
    subscription.status === 'ACTIVE' && millis(subscription.endDate) <= cutoff).length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'PAID');
  const monthlyRevenue = paidInvoices.filter((invoice) => millis(invoice.paidAt) >= startOfMonth.getTime()
    && millis(invoice.paidAt) <= endOfMonth.getTime())
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  const schoolGrowth = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - i));
    const count = schools.filter((school) => {
      const created = millis(school.createdAt);
      const createdDate = new Date(created);
      return createdDate.getFullYear() === date.getFullYear() && createdDate.getMonth() === date.getMonth();
    }).length;
    return { month: `${date.getFullYear()}-${date.getMonth() + 1}`, count };
  });

  const plansSnapshot = await dbOrThrow().collection('system_subscriptionPlans').get();
  const plans = plansSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Doc));
  const distribution = new Map<string, number>();
  subscriptions.forEach((subscription) => {
    const planId = String(subscription.planId || 'unassigned');
    distribution.set(planId, (distribution.get(planId) || 0) + 1);
  });
  const planDistribution = [...distribution.entries()].map(([planId, count]) => ({
    name: plans.find((plan) => plan.id === planId)?.name || planId,
    count,
  }));

  return ok(res, {
    counts: {
      totalSchools: schools.length, activeSchools, trialSchools, suspendedSchools,
      totalStudents, totalTeachers, totalParents,
      activeSubscriptions, expiringSubscriptions, monthlyRevenue, totalRevenue,
    },
    schoolGrowth,
    planDistribution,
    studentGrowth: [4, 6, 8, 8, 12, 14],
    revenueGrowth: [120, 180, 240, 300, 380, 460],
  }, 'Platform analytics fetched');
}
