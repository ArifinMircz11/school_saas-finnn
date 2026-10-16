import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { collectFeeSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { sendNotification } from '../services/notification.service';

export async function collectFee(req: Request, res: Response) {
  const body = collectFeeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  
  const result = await prisma.$transaction(async (tx: any) => {
    const studentFee = await tx.studentFee.findUnique({ where: { id: body.studentFeeId }, include: { student: true } });
    if (!studentFee || studentFee.schoolId !== schoolId) throw new ApiError(404, 'Student fee not found');
    const remaining = Number(studentFee.totalAmount) - Number(studentFee.paidAmount) - Number(studentFee.discount);
    if (Number(body.amount) > remaining) throw new ApiError(400, 'Amount exceeds outstanding');
    const receiptNo = `RCP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const payment = await tx.feePayment.create({
      data: { schoolId, studentFeeId: studentFee.id, amount: body.amount, method: body.method || 'CASH', transactionId: body.transactionId, status: 'SUCCESS', collectedBy: req.auth?.sub, receiptNo, paidAt: new Date() },
    });
    const newPaid = Number(studentFee.paidAmount) + Number(body.amount);
    const newStatus = newPaid >= Number(studentFee.totalAmount) - Number(studentFee.discount) ? 'PAID' : 'PARTIAL';
    const updated = await tx.studentFee.update({ where: { id: studentFee.id }, data: { paidAmount: newPaid, status: newStatus } });
    return { payment, studentFee: updated, receiptNo };
  });

  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'COLLECT_FEE', module: 'FEES', details: { receiptNo: result.receiptNo } });
  return created(res, result, 'Fee collected');
}

export async function studentFees(req: Request, res: Response) {
  const { studentId, status } = req.query as { studentId?: string; status?: string };
  const schoolId = schoolOf(req);
  const where: any = { schoolId };
  if (req.auth?.roles.includes('STUDENT')) {
    const student = await prisma.student.findFirst({ where: { userId: req.auth.sub, schoolId, deletedAt: null } });
    if (!student) throw new ApiError(404, 'Student not found');
    const parentIds = (await prisma.studentParent.findMany({ where: { studentId: student.id }, select: { parentId: true } })).map((p: any) => p.parentId);
    const siblingIds = parentIds.length
      ? (await prisma.studentParent.findMany({ where: { parentId: { in: parentIds }, student: { schoolId, deletedAt: null } }, select: { studentId: true } })).map((p: any) => p.studentId)
      : [];
    const allowedStudentIds = [student.id, ...siblingIds];
    if (studentId && !allowedStudentIds.includes(studentId)) throw new ApiError(404, 'Student fee not found');
    where.studentId = studentId || { in: allowedStudentIds };
  } else {
    const hasFeesPermission = req.auth?.roles.includes('SUPER_ADMIN') || (req.auth?.permissions || []).includes('fees.view');
    if (!hasFeesPermission) throw new ApiError(403, 'Forbidden: missing permission fees.view');
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
      if (!student) throw new ApiError(404, 'Student not found');
      where.studentId = studentId;
    }
  }
  if (status) where.status = status.toUpperCase();
  const fees = await prisma.studentFee.findMany({
    where, include: { structure: { include: { category: true } }, payments: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, fees, 'Student fees fetched');
}

export async function feeReports(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const daily = await prisma.feePayment.aggregate({ where: { schoolId, status: 'SUCCESS', paidAt: { gte: from, lte: to } }, _sum: { amount: true }, _count: true });
  const pending = await prisma.studentFee.aggregate({ where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] } }, _sum: { totalAmount: true, paidAmount: true } });
  const overdue = await prisma.studentFee.count({ where: { schoolId, dueDate: { lt: new Date() }, status: { in: ['PENDING', 'PARTIAL'] } } });
  const payments = await prisma.feePayment.findMany({
    where: { schoolId, status: 'SUCCESS', paidAt: { gte: from, lte: to } },
    include: { studentFee: { include: { student: true, structure: true } } },
    orderBy: { paidAt: 'desc' },
  });
  return ok(res, {
    daily: Number(daily._sum.amount || 0), paymentsCount: daily._count,
    pendingAmount: Number(pending._sum.totalAmount || 0) - Number(pending._sum.paidAmount || 0),
    overdueCount: overdue, payments,
  }, 'Fee report fetched');
}

export async function generateFeeNotifications(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date();
  let generated = 0;
  const windows = [7, 3, 0];
  for (const delta of windows) {
    const start = new Date(today);
    const end = new Date(today.getTime() + delta * 24 * 60 * 60 * 1000);
    const due = await prisma.studentFee.findMany({
      where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: start, lte: end } },
      include: { student: true, structure: true },
    });
    for (const fee of due) {
      if (!fee.student.userId) continue;
      const daysLeft = fee.dueDate ? Math.max(0, Math.ceil((fee.dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))) : 0;
      await sendNotification({ schoolId, userId: fee.student.userId, type: 'FEE', title: delta === 0 ? 'Fee Due Today' : `Fee Due in ${delta} days`, message: `Fee (${fee.structure.name}) of ${Number(fee.totalAmount) - Number(fee.paidAmount)} is due.` });
      generated++;
    }
  }
  const overdue = await prisma.studentFee.findMany({
    where: { schoolId, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: today } },
    include: { student: true, structure: true },
  });
  for (const fee of overdue) {
    if (!fee.student.userId) continue;
    await sendNotification({ schoolId, userId: fee.student.userId, type: 'FEE', title: 'Fee Overdue', message: `Fee ${fee.structure.name} is overdue.` });
    generated++;
  }
  return ok(res, { generated }, 'Fee notifications generated');
}