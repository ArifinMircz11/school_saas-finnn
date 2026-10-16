import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { uploadToStorage } from '../middleware/upload';
import { generateCertificateNumber } from '../utils/password';
import { studentDocumentUploadSchema, generateCertificateSchema } from '../validators';
import config from '../config';

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

async function visibleStudentIds(schoolId: string, userId: string): Promise<string[]> {
  const students = await all(schoolId, 'students');
  const student = students.find((item) => item.userId === userId);
  if (!student) throw new ApiError(404, 'Student not found');
  const links = await all(schoolId, 'studentParents');
  const parentIds = links.filter((link) => link.studentId === student.id).map((link) => link.parentId);
  const siblingIds = parentIds.length
    ? links.filter((link) => parentIds.includes(link.parentId)).map((link) => link.studentId)
    : [];
  return [...new Set([student.id, ...siblingIds])];
}

function millis(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

// ---------- STUDENT DOCUMENTS ----------
export async function listStudentDocuments(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { studentId } = req.query as { studentId?: string };
  const isStudentRole = req.auth?.roles.includes('STUDENT');
  let docs = await all(schoolId, 'studentDocuments');
  if (isStudentRole && !studentId) {
    const allowed = new Set(await visibleStudentIds(schoolId, req.auth!.sub));
    docs = docs.filter((doc) => allowed.has(doc.studentId));
  } else if (studentId) {
    docs = docs.filter((doc) => doc.studentId === studentId);
  }
  docs.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  const hydrated = await Promise.all(docs.map(async (doc) => {
    const student = await one(schoolId, 'students', doc.studentId);
    return { ...doc, student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName } : null };
  }));
  return ok(res, hydrated, 'Documents fetched');
}

export async function uploadStudentDocument(req: Request, res: Response) {
  const body = studentDocumentUploadSchema.parse(req.body);
  if (!req.file) throw new ApiError(400, 'Document file required');
  const schoolId = schoolOf(req);
  const student = await one(schoolId, 'students', body.studentId);
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const url = await uploadToStorage(req.file.path, `documents/${student.id}`);
  const id = randomUUID();
  const doc = {
    id, schoolId, studentId: student.id, type: body.type || 'OTHER',
    title: body.title || body.type || 'Document', url, mimeType: req.file.mimetype,
    size: req.file.size, verified: false, uploadedBy: req.auth!.sub, createdAt: new Date(),
  };
  await collection(schoolId, 'studentDocuments').doc(id).create(doc);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'UPLOAD_DOCUMENT', module: 'DOCUMENTS' });
  return created(res, doc, 'Document uploaded');
}

export async function verifyDocument(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const doc = await one(schoolId, 'studentDocuments', req.params.id);
  if (!doc || doc.schoolId !== schoolId) throw new ApiError(404, 'Document not found');
  await collection(schoolId, 'studentDocuments').doc(doc.id).update({ verified: true });
  const updated = { ...doc, verified: true };
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'VERIFY_DOCUMENT', module: 'DOCUMENTS' });
  return ok(res, updated, 'Document verified');
}

export async function deleteDocument(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const doc = await one(schoolId, 'studentDocuments', req.params.id);
  if (!doc || doc.schoolId !== schoolId) throw new ApiError(404, 'Document not found');
  await collection(schoolId, 'studentDocuments').doc(doc.id).delete();
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'DELETE_DOCUMENT', module: 'DOCUMENTS' });
  return ok(res, null, 'Document deleted');
}

// ---------- CERTIFICATES ----------
export async function generateCertificate(req: Request, res: Response) {
  const body = generateCertificateSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const student = await one(schoolId, 'students', body.studentId);
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const number = generateCertificateNumber();
  const id = randomUUID();
  const cert = {
    id, schoolId, studentId: student.id, type: body.type ?? 'CERTIFICATE',
    number, createdBy: req.auth!.sub, pdfUrl: `${config.publicBaseUrl.certificates}/${number}.pdf`,
    issuedAt: new Date(), createdAt: new Date(),
  };
  await collection(schoolId, 'certificates').doc(id).create(cert);
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'GENERATE_CERTIFICATE', module: 'CERTIFICATES', details: { number } });
  return created(res, cert, 'Certificate generated');
}

export async function listCertificates(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { studentId } = req.query as { studentId?: string };
  const isStudentRole = req.auth?.roles.includes('STUDENT');
  let certificates = await all(schoolId, 'certificates');
  if (studentId) certificates = certificates.filter((cert) => cert.studentId === studentId);
  if (isStudentRole && !studentId) {
    const allowed = new Set(await visibleStudentIds(schoolId, req.auth!.sub));
    certificates = certificates.filter((cert) => allowed.has(cert.studentId));
  }
  certificates.sort((a, b) => millis(b.issuedAt) - millis(a.issuedAt));
  return ok(res, await Promise.all(certificates.map(async (cert) => ({
    ...cert, student: await one(schoolId, 'students', cert.studentId),
  }))), 'Certificates fetched');
}
