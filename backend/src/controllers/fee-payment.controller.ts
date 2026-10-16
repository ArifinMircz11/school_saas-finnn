import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { collectFeeSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { sendNotification } from '../services/notification.service';

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

function within(value: any, from: Date, to: Date): boolean {
  const timestamp = millis(value);
  return timestamp >= from.getTime() && timestamp <= to.getTime();
}

async function hydrateFee(schoolId: string, fee: Doc) {
  const [structure, payments, student] = await Promise.all([
    one(schoolId, 'feeStructures', fee.structureId),
    byField(schoolId, 'feePayments', 'studentFeeId', fee.id),
    one(schoolId, 'students', fee.studentId),
  ]);
  const category = structure?.categoryId ? await one(schoolId, 'feeCategories', structure.categoryId) : null;
  return {
    ...fee,
    structure: structure ? { ...structure, category } : null,
    payments,
    student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNo: student.admissionNo } : null,
  };
}

export async function collectFee(req: Request, res: Response) {
  const body = collectFeeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const db = dbOrThrow();
  const feeRef = collection(schoolId, 'studentFees').doc(body.studentFeeId);
  const paymentId = randomUUID();
  const receiptNo = `RCP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const now = new Date();

  const result = await db.runTransaction(async (transaction) => {
    const feeSnapshot = await transaction.get(feeRef);
    if (!feeSnapshot.exists) throw new ApiError(404, 'Student fee not found');
    const studentFee: Doc = { id: feeSnapshot.id, ...feeSnapshot.data() };
    if (studentFee.schoolId !== schoolId) throw new ApiError(404, 'Student fee not found');

    const remaining = Number(studentFee.totalAmount) - Number(studentFee.paidAmount) - Number(studentFee.discount);
    if (Number(body.amount) > remaining) throw new ApiError(400, 'Amount exceeds outstanding');
    const newPaid = Number(studentFee.paidAmount) + Number(body.amount);
    const newStatus = newPaid >= Number(studentFee.totalAmount) - Number(studentFee.discount) ? 'PAID' : 'PARTIAL';
    const payment = {
      id: paymentId, schoolId, studentFeeId: studentFee.id, amount: String(body.amount),
      method: body.method || 'CASH', transactionId: body.transactionId ?? null,
      status: 'SUCCESS', collectedBy: req.auth?.sub ?? null, receiptNo, paidAt: now,
    };
    const updated = { ...studentFee, paidAmount: String(newPaid), status: newStatus };
    transaction.create(collection(schoolId, 'feePayments').doc(paymentId), payment);
    transaction.update(feeRef, { paidAmount: String(newPaid), status: newStatus });
    return { payment, studentFee: updated, receiptNo };
  });

  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'COLLECT_FEE', module: 'FEES', details: { receiptNo: result.receiptNo } });
  return created(res, result, 'Fee collected');
}

export async function studentFees(req: Request, res: Response) {
  const { studentId, status } = req.query as { studentId?: string; status?: string };
  const schoolId = schoolOf(req);
  let fees = await all(schoolId, 'studentFees');

  if (req.auth?.roles.includes('STUDENT')) {
    const students = await byField(schoolId, 'students', 'userId', req.auth.sub);
    const student = students[0];
    if (student) {
      const links = await all(schoolId, 'studentParents');
      const parentIds = links.filter((link) => link.studentId === student.id).map((link) => link.parentId);
      const siblingIds = parentIds.length
        ? links.filter((link) => parentIds.includes(link.parentId)).map((link) => link.studentId)
        : [];
      const allowedStudentIds = [...new Set([student.id, ...siblingIds])];
      if (studentId && !allowedStudentIds.includes(studentId)) {
        throw new ApiError(403, 'Forbidden: cannot access another student fee record');
      }
      fees = fees.filter((fee) => allowedStudentIds.includes(fee.studentId));
      if (studentId) fees = fees.filter((fee) => fee.studentId === studentId);
    } else {
      fees = [];
    }
  } else if (studentId) {
    fees = fees.filter((fee) => fee.studentId === studentId);
  }
  if (status) fees = fees.filter((fee) => fee.status === status.toUpperCase());
  fees.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, await Promise.all(fees.map((fee) => hydrateFee(schoolId, fee))), 'Student fees fetched');
}

export async function feeReports(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const [payments, fees] = await Promise.all([all(schoolId, 'feePayments'), all(schoolId, 'studentFees')]);
  const dailyPayments = payments.filter((payment) => payment.status === 'SUCCESS' && within(payment.paidAt, from, to));
  const pending = fees.filter((fee) => ['PENDING', 'PARTIAL'].includes(fee.status));
  const pendingTotal = pending.reduce((sum, fee) => sum + Number(fee.totalAmount || 0), 0);
  const pendingPaid = pending.reduce((sum, fee) => sum + Number(fee.paidAmount || 0), 0);
  const overdueCount = pending.filter((fee) => fee.dueDate && millis(fee.dueDate) < Date.now()).length;
  dailyPayments.sort((a, b) => millis(b.paidAt) - millis(a.paidAt));
  const hydratedPayments = await Promise.all(dailyPayments.map(async (payment) => ({
    ...payment,
    studentFee: await hydrateFee(schoolId, await one(schoolId, 'studentFees', payment.studentFeeId) || {}),
  })));
  return ok(res, {
    daily: dailyPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    paymentsCount: dailyPayments.length,
    pendingAmount: pendingTotal - pendingPaid,
    overdueCount,
    payments: hydratedPayments,
  }, 'Fee report fetched');
}

export async function generateFeeNotifications(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const today = new Date();
  let generated = 0;
  const windows = [7, 3, 0];
  const fees = await all(schoolId, 'studentFees');
  const students = await all(schoolId, 'students');
  const structures = await all(schoolId, 'feeStructures');
  for (const delta of windows) {
    const start = new Date(today);
    const end = new Date(today.getTime() + delta * 24 * 60 * 60 * 1000);
    const due = fees.filter((fee) => ['PENDING', 'PARTIAL'].includes(fee.status) && fee.dueDate && within(fee.dueDate, start, end));
    for (const fee of due) {
      const student = students.find((item) => item.id === fee.studentId);
      const structure = structures.find((item) => item.id === fee.structureId);
      if (!student?.userId || !structure) continue;
      await sendNotification({
        schoolId, userId: student.userId, type: 'FEE',
        title: delta === 0 ? 'Fee Due Today' : `Fee Due in ${delta} days`,
        message: `Fee (${structure.name}) of ${Number(fee.totalAmount) - Number(fee.paidAmount)} is due.`,
      });
      generated++;
    }
  }
  const overdue = fees.filter((fee) => ['PENDING', 'PARTIAL'].includes(fee.status) && fee.dueDate && millis(fee.dueDate) < today.getTime());
  for (const fee of overdue) {
    const student = students.find((item) => item.id === fee.studentId);
    const structure = structures.find((item) => item.id === fee.structureId);
    if (!student?.userId || !structure) continue;
    await sendNotification({ schoolId, userId: student.userId, type: 'FEE', title: 'Fee Overdue', message: `Fee ${structure.name} is overdue.` });
    generated++;
  }
  return ok(res, { generated }, 'Fee notifications generated');
}
