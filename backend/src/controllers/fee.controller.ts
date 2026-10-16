import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { feeCategorySchema, feeStructureSchema, assignFeeSchema } from '../validators';
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

async function one(schoolId: string, name: string, id: string) {
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

// ---------- CATEGORIES ----------
export async function listFeeCategories(req: Request, res: Response) {
  const categories = (await all(schoolOf(req), 'feeCategories')).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return ok(res, categories, 'Fee categories fetched');
}

export async function createFeeCategory(req: Request, res: Response) {
  const body = feeCategorySchema.parse(req.body);
  const schoolId = schoolOf(req);
  const duplicate = (await byField(schoolId, 'feeCategories', 'name', body.name)).length > 0;
  if (duplicate) throw new ApiError(409, 'Fee category name already exists');
  const id = randomUUID();
  const category = {
    id, schoolId, name: body.name, description: body.description ?? null,
    frequency: body.frequency || 'YEARLY', createdAt: new Date(),
  };
  await collection(schoolId, 'feeCategories').doc(id).create(category);
  return created(res, category, 'Fee category created');
}

// ---------- STRUCTURES ----------
export async function listFeeStructures(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const structures = (await all(schoolId, 'feeStructures')).sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const hydrated = await Promise.all(structures.map(async (structure) => ({
    ...structure,
    category: structure.categoryId ? await one(schoolId, 'feeCategories', structure.categoryId) : null,
  })));
  return ok(res, hydrated, 'Fee structures fetched');
}

export async function createFeeStructure(req: Request, res: Response) {
  const body = feeStructureSchema.parse(req.body);
  const schoolId = schoolOf(req);
  if (body.categoryId && !(await one(schoolId, 'feeCategories', body.categoryId))) {
    throw new ApiError(404, 'Fee category not found');
  }
  const id = randomUUID();
  const structure = {
    id, schoolId, name: body.name, categoryId: body.categoryId ?? null,
    amount: String(body.amount), dueDate: body.dueDate ? new Date(body.dueDate) : null,
    lateFee: String(body.lateFee || 0), discount: String(body.discount || 0),
    installment: body.installment || 1, createdAt: new Date(),
  };
  await collection(schoolId, 'feeStructures').doc(id).create(structure);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'CREATE_FEE_STRUCTURE', module: 'FEES' });
  return created(res, structure, 'Fee structure created');
}

// ---------- ASSIGN FEES TO STUDENTS ----------
export async function assignFees(req: Request, res: Response) {
  const body = assignFeeSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const structure = await one(schoolId, 'feeStructures', body.structureId);
  if (!structure) throw new ApiError(404, 'Fee structure not found');

  const total = Number(structure.amount);
  const discount = Number(structure.discount || 0);
  let assigned = 0;
  for (const studentId of body.studentIds) {
    const student = await one(schoolId, 'students', studentId);
    if (!student) continue;
    const existing = await byField(schoolId, 'studentFees', 'studentId', studentId);
    if (existing.some((fee) => fee.structureId === structure.id)) continue;
    const id = randomUUID();
    await collection(schoolId, 'studentFees').doc(id).create({
      id, schoolId, studentId, structureId: structure.id,
      totalAmount: String(total), discount: String(discount), paidAmount: '0',
      status: 'PENDING', dueDate: structure.dueDate ?? null, createdAt: new Date(),
    });
    assigned++;
  }

  for (const studentId of body.studentIds) {
    const student = await one(schoolId, 'students', studentId);
    if (student?.userId) {
      await sendNotification({
        schoolId, userId: student.userId, type: 'FEE', title: 'Fee Assigned',
        message: `A fee (${structure.name}) of ${total} has been assigned to your ward.`,
      });
    }
  }
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'ASSIGN_FEES', module: 'FEES', details: { count: assigned } });
  return ok(res, { assigned }, 'Fees assigned');
}
