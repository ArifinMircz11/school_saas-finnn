import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { ticketSchema } from '../validators';
import { auditLog } from '../utils/audit';
import config from '../config';
import { findUserById } from '../repositories/firestore-auth.repository';

type Doc = Record<string, any>;

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new ApiError(503, 'Firestore is not configured');
  return db;
}

function collection(schoolId: string, name: string) {
  return dbOrThrow().collection('schools').doc(schoolId).collection(name);
}

async function allInSchool(schoolId: string, name: string): Promise<Doc[]> {
  const snapshot = await collection(schoolId, name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function oneSchool(schoolId: string, id: string): Promise<Doc | null> {
  const snapshot = await dbOrThrow().collection('schools').doc(schoolId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
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

// ---------- SUPPORT TICKETS ----------
export async function createTicket(req: Request, res: Response) {
  const body = ticketSchema.parse(req.body);
  const schoolId = req.auth?.schoolId ?? null;
  const id = randomUUID();
  const ticket = {
    id, schoolId, userId: req.auth!.sub, subject: body.subject, description: body.description,
    status: 'OPEN', priority: body.priority || 'MEDIUM', createdAt: new Date(), updatedAt: new Date(),
  };
  const ref = schoolId
    ? collection(schoolId, 'supportTickets').doc(id)
    : dbOrThrow().collection('system_supportTickets').doc(id);
  await ref.create(ticket);
  return created(res, ticket, 'Ticket created');
}

async function allTickets(): Promise<Doc[]> {
  const db = dbOrThrow();
  const [tenant, system] = await Promise.all([
    db.collectionGroup('supportTickets').get(),
    db.collection('system_supportTickets').get(),
  ]);
  return [...tenant.docs, ...system.docs].map((doc) => ({ id: doc.id, ...doc.data(), _docPath: doc.ref.path }));
}

export async function listTickets(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const schoolId = req.auth!.schoolId ?? null;
  let tickets: Doc[];
  if (isSuper) {
    tickets = await allTickets();
  } else if (schoolId) {
    tickets = await allInSchool(schoolId, 'supportTickets');
  } else {
    const snapshot = await dbOrThrow().collection('system_supportTickets').get();
    tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  tickets = tickets.filter((ticket) => isSuper || ticket.schoolId === schoolId);
  tickets.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return ok(res, tickets.map(({ _docPath, ...ticket }) => ticket), 'Tickets fetched');
}

export async function updateTicket(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const ticket = (await allTickets()).find((item) => item.id === req.params.id);
  if (!ticket || !ticket._docPath) throw new ApiError(404, 'Ticket not found');
  if (!isSuper && ticket.schoolId !== (req.auth?.schoolId ?? null)) {
    throw new ApiError(403, 'Forbidden: you may only update tickets in your own school');
  }
  const patch = {
    ...(req.body.status !== undefined ? { status: req.body.status } : {}),
    ...(req.body.priority !== undefined ? { priority: req.body.priority } : {}),
    updatedAt: new Date(),
  };
  await dbOrThrow().doc(ticket._docPath).update(patch);
  const { _docPath, ...data } = ticket;
  return ok(res, { ...data, ...patch }, 'Ticket updated');
}

// ---------- AUDIT LOGS ----------
export async function listAuditLogs(req: Request, res: Response) {
  const isSuper = req.auth?.roles.includes('SUPER_ADMIN');
  const schoolId = req.auth!.schoolId ?? null;
  const db = dbOrThrow();
  const [tenant, system] = await Promise.all([
    db.collectionGroup('auditLogs').get(),
    db.collection('system_auditLogs').get(),
  ]);
  let logs = [...tenant.docs, ...system.docs].map((doc) => ({ id: doc.id, ...doc.data() }) as Doc);
  if (!isSuper) logs = logs.filter((log) => log.schoolId === schoolId);
  else if (req.query.schoolId) logs = logs.filter((log) => log.schoolId === req.query.schoolId);
  logs.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const hydrated = await Promise.all(logs.slice(0, 200).map(async (log) => {
    const user = log.userId ? await findUserById(log.userId) : null;
    return {
      ...log,
      user: user ? { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } : null,
    };
  }));
  return ok(res, hydrated, 'Audit logs fetched');
}

// ---------- SCHOOL SETTINGS ----------
export async function getSchoolSettings(req: Request, res: Response) {
  const schoolId = req.auth!.schoolId;
  if (!schoolId) throw new ApiError(403, 'School context required');
  const school = await oneSchool(schoolId, schoolId);
  if (!school) throw new ApiError(404, 'School not found');
  return ok(res, {
    settings: school.settings, name: school.name, logoUrl: school.logoUrl, email: school.email,
    phone: school.phone, address: school.address, city: school.city, state: school.state,
  }, 'Settings fetched');
}

export async function updateSchoolSettings(req: Request, res: Response) {
  const schoolId = req.auth!.schoolId;
  if (!schoolId) throw new ApiError(403, 'School context required');
  const ref = dbOrThrow().collection('schools').doc(schoolId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, 'School not found');
  const existing = snapshot.data() || {};
  const merged = { ...(existing.settings || {}), ...(req.body.settings || {}) };
  const patch = {
    settings: merged,
    logoUrl: req.body.logoUrl || existing.logoUrl || null,
    email: req.body.email || existing.email || null,
    phone: req.body.phone || existing.phone || null,
    address: req.body.address || existing.address || null,
    updatedAt: new Date(),
  };
  await ref.update(patch);
  const school = { id: snapshot.id, ...existing, ...patch };
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'UPDATE_SETTINGS', module: 'SETTINGS' });
  return ok(res, school, 'Settings updated');
}

// ---------- REPORTS ----------
export async function getReports(req: Request, res: Response) {
  const schoolId = req.auth!.schoolId;
  if (!schoolId) throw new ApiError(403, 'School context required');
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const [students, feePayments, studentFees, attendanceRecords] = await Promise.all([
    allInSchool(schoolId, 'students'), allInSchool(schoolId, 'feePayments'),
    allInSchool(schoolId, 'studentFees'), allInSchool(schoolId, 'attendances'),
  ]);
  const activeStudents = students.filter((student) => student.deletedAt == null)
    .sort((a, b) => String(a.admissionNo).localeCompare(String(b.admissionNo)));
  const hydratedStudents = await Promise.all(activeStudents.map(async (student) => ({
    ...student,
    class: student.classId ? await collection(schoolId, 'classes').doc(student.classId).get().then((doc) => doc.exists ? { id: doc.id, ...doc.data() } : null) : null,
    section: student.sectionId ? await collection(schoolId, 'sections').doc(student.sectionId).get().then((doc) => doc.exists ? { id: doc.id, ...doc.data() } : null) : null,
  })));
  const byClass = hydratedStudents.reduce((acc: any, student) => {
    const key = student.class?.name || 'Unassigned';
    (acc[key] = acc[key] || []).push(student);
    return acc;
  }, {});
  const dailyPayments = feePayments.filter((payment) => within(payment.paidAt, from, to));
  const pendingFees = studentFees.filter((fee) => ['PENDING', 'PARTIAL'].includes(fee.status)).length;
  const filteredAttendance = attendanceRecords.filter((record) => within(record.date, from, to));
  const dailyPct = filteredAttendance.length
    ? Math.round((filteredAttendance.filter((record) => record.status === 'PRESENT').length / filteredAttendance.length) * 100)
    : 0;
  return ok(res, {
    students: { total: activeStudents.length, byClass },
    fees: {
      dailyCollection: dailyPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      payments: dailyPayments.length, pendingFees,
    },
    attendance: { totalRecords: filteredAttendance.length, dailyPercent: dailyPct },
    period: { from, to },
  }, 'Reports fetched');
}

export async function createReportExport(req: Request, res: Response) {
  const kind = req.body.kind || 'csv';
  return ok(res, { kind, url: `${config.publicBaseUrl.reports}/${req.auth!.schoolId}/export.${kind}` }, 'Export prepared');
}
