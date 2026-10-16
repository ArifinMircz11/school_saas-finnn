import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ok } from '../utils/response';

export async function getPlatformAnalytics(req: Request, res: Response) {
  const totalSchools = await prisma.school.count();
  const activeSchools = await prisma.school.count({ where: { status: 'ACTIVE' } });
  const trialSchools = await prisma.school.count({ where: { status: 'PENDING' } });
  const suspendedSchools = await prisma.school.count({ where: { status: 'SUSPENDED' } });
  const totalStudents = await prisma.student.count();
  const totalTeachers = await prisma.teacher.count();
  const totalParents = await prisma.parent.count();
  const activeSubs = await prisma.schoolSubscription.count({ where: { status: 'ACTIVE' } });
  const expiringSubs = await prisma.schoolSubscription.count({
    where: { status: 'ACTIVE', endDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
  });
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthlyRevenueAgg = await prisma.invoice.aggregate({
    _sum: { amount: true },
    where: { status: 'PAID', paidAt: { gte: startOfMonth, lte: endOfMonth } },
  });
  const totalRevenueAgg = await prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } });

  const recordedSchools = await prisma.school.findMany({ select: { createdAt: true } });
  const schoolGrowth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const count = recordedSchools.filter(
      (s) => new Date(s.createdAt).getFullYear() === d.getFullYear() && new Date(s.createdAt).getMonth() === d.getMonth()
    ).length;
    return { month: `${d.getFullYear()}-${d.getMonth() + 1}`, count };
  });

  const planDistAgg = await prisma.schoolSubscription.groupBy({ by: ['planId'], _count: true });
  const planNames = await prisma.subscriptionPlan.findMany({ select: { id: true, name: true } });
  const planDistribution = planDistAgg.map((p) => ({
    name: planNames.find((n) => n.id === p.planId)?.name || p.planId,
    count: p._count,
  }));

  return ok(res, {
    counts: {
      totalSchools, activeSchools, trialSchools, suspendedSchools,
      totalStudents, totalTeachers, totalParents,
      activeSubscriptions: activeSubs, expiringSubscriptions: expiringSubs,
      monthlyRevenue: Number(monthlyRevenueAgg._sum.amount || 0),
      totalRevenue: Number(totalRevenueAgg._sum.amount || 0),
    },
    schoolGrowth,
    planDistribution,
    studentGrowth: [4, 6, 8, 8, 12, 14], // illustrative trend placeholder
    revenueGrowth: [120, 180, 240, 300, 380, 460],
  }, 'Platform analytics fetched');
}