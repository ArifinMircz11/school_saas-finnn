import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { ticketSchema } from '../validators';
import { auditLog } from '../utils/audit';
import config from '../config';

// ---------- SUPPORT TICKETS ----------
export async function createTicket(req: Request, res: Response) {
  const body = ticketSchema.parse(req.body);
  const ticket = await prisma.supportTicket.create({
    data: { schoolId: req.auth?.schoolId, userId: req.auth!.sub, subject: body.subject, description: body.description, priority: body.priority || 'MEDIUM' },
  });
  return created(res, ticket, 'Ticket created');
}
export async function listTickets(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const where: any = {};
  if (!isSuper) where.schoolId = req.auth!.schoolId ?? null;
  const tickets = await prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' } });
  return ok(res, tickets, 'Tickets fetched');
}
export async function updateTicket(req: Request, res: Response) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  if (!isSuper && ticket.schoolId !== req.auth?.schoolId) throw new ApiError(403, 'Forbidden: you may only update tickets in your own school');
  const updated = await prisma.supportTicket.update({ where: { id: req.params.id }, data: { status: req.body.status, priority: req.body.priority } });
  return ok(res, updated, 'Ticket updated');
}

// ---------- AUDIT LOGS ----------
export async function listAuditLogs(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const where: any = {};
  if (!isSuper) where.schoolId = req.auth!.schoolId ?? null;
  else if (req.query.schoolId) where.schoolId = req.query.schoolId as string;
  const logs = await prisma.auditLog.findMany({
    where, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return ok(res, logs, 'Audit logs fetched');
}

// ---------- SCHOOL SETTINGS ----------
export async function getSchoolSettings(req: Request, res: Response) {
  const school = await prisma.school.findUnique({
    where: { id: req.auth!.schoolId! },
    select: { settings: true, name: true, logoUrl: true, email: true, phone: true, address: true, city: true, state: true },
  });
  return ok(res, school, 'Settings fetched');
}
export async function updateSchoolSettings(req: Request, res: Response) {
  const existing = await prisma.school.findUnique({ where: { id: req.auth!.schoolId! } });
  if (!existing) throw new ApiError(404, 'School not found');
  const merged = { ...((existing.settings as object) || {}), ...(req.body.settings || {}) };
  const school = await prisma.school.update({
    where: { id: existing.id },
    data: {
      settings: merged, logoUrl: req.body.logoUrl || existing.logoUrl,
      email: req.body.email || existing.email, phone: req.body.phone || existing.phone,
      address: req.body.address || existing.address,
    },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: existing.id, ip: req.ip, action: 'UPDATE_SETTINGS', module: 'SETTINGS' });
  return ok(res, school, 'Settings updated');
}

// ---------- REPORTS ----------
export async function getReports(req: Request, res: Response) {
  const schoolId = req.auth!.schoolId!;
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  // Students report
  const students = await prisma.student.findMany({ where: { schoolId, deletedAt: null }, include: { class: true, section: true }, orderBy: { admissionNo: 'asc' } });
  const byClass = students.reduce((acc: any, s) => { const k = s.class?.name || 'Unassigned'; (acc[k] = acc[k] || []).push(s); return acc; }, {});

  // Fees
  const dailyCollection = await prisma.feePayment.aggregate({ where: { schoolId, paidAt: { gte: from, lte: to } }, _sum: { amount: true }, _count: true });
  const pendingFees = await prisma.studentFee.count({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } } });

  // Attendance
  const attendanceRecords = await prisma.attendance.findMany({ where: { schoolId, date: { gte: from, lte: to } }, select: { status: true, date: true } });
  const dailyPct = attendanceRecords.length ? Math.round((attendanceRecords.filter((r) => r.status === 'PRESENT').length / attendanceRecords.length) * 100) : 0;

  return ok(res, {
    students: { total: students.length, byClass },
    fees: { dailyCollection: Number(dailyCollection._sum.amount || 0), payments: dailyCollection._count, pendingFees },
    attendance: { totalRecords: attendanceRecords.length, dailyPercent: dailyPct },
    period: { from, to },
  }, 'Reports fetched');
}

export async function createReportExport(req: Request, res: Response) {
  // Real PDF/CSV generation would stream a document here.
  const kind = req.body.kind || 'csv';
  return ok(res, { kind, url: `${config.publicBaseUrl.reports}/${req.auth!.schoolId}/export.${kind}` }, 'Export prepared');
}