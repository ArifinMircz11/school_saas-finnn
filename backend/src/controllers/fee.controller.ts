import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { feeCategorySchema, feeStructureSchema, assignFeeSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { sendNotification } from '../services/notification.service';

// ---------- CATEGORIES ----------
export async function listFeeCategories(req: Request, res: Response) {
  const categories = await prisma.feeCategory.findMany({ where: { schoolId: schoolOf(req) }, orderBy: { name: 'asc' } });
  return ok(res, categories, 'Fee categories fetched');
}
export async function createFeeCategory(req: Request, res: Response) {
  const body = feeCategorySchema.parse(req.body);
  const category = await prisma.feeCategory.create({ data: { schoolId: schoolOf(req), name: body.name, description: body.description, frequency: body.frequency } });
  return created(res, category, 'Fee category created');
}

// ---------- STRUCTURES ----------
export async function listFeeStructures(req: Request, res: Response) {
  const structures = await prisma.feeStructure.findMany({ where: { schoolId: schoolOf(req) }, include: { category: true }, orderBy: { createdAt: 'desc' } });
  return ok(res, structures, 'Fee structures fetched');
}
export async function createFeeStructure(req: Request, res: Response) {
  const body = feeStructureSchema.parse(req.body);
  const structure = await prisma.feeStructure.create({
    data: { schoolId: schoolOf(req), name: body.name, categoryId: body.categoryId, amount: body.amount, dueDate: body.dueDate ? new Date(body.dueDate) : null, lateFee: body.lateFee || 0, discount: body.discount || 0, installment: body.installment || 1 },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: schoolOf(req), ip: req.ip, action: 'CREATE_FEE_STRUCTURE', module: 'FEES' });
  return created(res, structure, 'Fee structure created');
}

// ---------- ASSIGN FEES TO STUDENTS ----------
export async function assignFees(req: Request, res: Response) {
  const body = assignFeeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const structure = await prisma.feeStructure.findUnique({ where: { id: body.structureId } });
  if (!structure || structure.schoolId !== schoolId) throw new ApiError(404, 'Fee structure not found');
  const total = Number(structure.amount);
  const discount = Number(structure.discount);
  let assigned = 0;
  for (const studentId of body.studentIds) {
    const existing = await prisma.studentFee.findFirst({ where: { studentId, structureId: structure.id } });
    if (existing) continue;
    await prisma.studentFee.create({ data: { schoolId, studentId, structureId: structure.id, totalAmount: total, discount, paidAmount: 0, status: 'PENDING', dueDate: structure.dueDate } });
    assigned++;
  }
    for (const studentId of body.studentIds) {
    // Parents have no login — notify the student directly (parents use student creds).
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
    if (student?.userId) {
      await sendNotification({ schoolId, userId: student.userId, type: 'FEE', title: 'Fee Assigned', message: `A fee (${structure.name}) of ${total} has been assigned to your ward.` });
    }
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ASSIGN_FEES', module: 'FEES', details: { count: assigned } });
  return ok(res, { assigned }, 'Fees assigned');
}