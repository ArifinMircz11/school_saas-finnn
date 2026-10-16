import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { auditLog } from '../utils/audit';
import { schoolOf } from './student.controller';
import { uploadToStorage } from '../middleware/upload';
import { generateCertificateNumber } from '../utils/password';
import { studentDocumentUploadSchema, generateCertificateSchema } from '../validators';
import config from '../config';

// ---------- STUDENT DOCUMENTS ----------
export async function listStudentDocuments(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { studentId } = req.query as { studentId?: string };
  const isStudentRole = req.auth?.roles.includes('STUDENT');
  const where: any = { schoolId };
  if (isStudentRole && !studentId) {
    // Students see their own documents (and siblings' via shared guardians).
    const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub, schoolId } });
    if (!student) throw new ApiError(404, 'Student not found');
    const parentIds = (await prisma.studentParent.findMany({ where: { studentId: student.id }, select: { parentId: true } })).map((p) => p.parentId);
    const siblingIds = parentIds.length
      ? (await prisma.studentParent.findMany({ where: { parentId: { in: parentIds } }, select: { studentId: true } })).map((p) => p.studentId)
      : [];
    where.studentId = { in: [student.id, ...siblingIds] };
  } else if (studentId) {
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
    if (!student) throw new ApiError(404, 'Student not found');
    if (isStudentRole) {
      const own = await prisma.student.findFirst({ where: { userId: req.auth!.sub, schoolId }, select: { id: true } });
      if (!own || own.id !== studentId) throw new ApiError(404, 'Student not found');
    }
    where.studentId = studentId;
  }
  const docs = await prisma.studentDocument.findMany({ where, include: { student: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } });
  return ok(res, docs, 'Documents fetched');
}

export async function uploadStudentDocument(req: Request, res: Response) {
  const body = studentDocumentUploadSchema.parse(req.body);
  if (!req.file) throw new ApiError(400, 'Document file required');
  const schoolId = schoolOf(req);
  const student = await prisma.student.findUnique({ where: { id: body.studentId } });
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const url = await uploadToStorage(req.file.path, `documents/${student.id}`);
  const doc = await prisma.studentDocument.create({
    data: { schoolId, studentId: student.id, type: body.type || 'OTHER', title: body.title || body.type || 'Document', url, mimeType: req.file.mimetype, size: req.file.size, uploadedBy: req.auth!.sub },
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'UPLOAD_DOCUMENT', module: 'DOCUMENTS' });
  return created(res, doc, 'Document uploaded');
}

export async function verifyDocument(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const doc = await prisma.studentDocument.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.schoolId !== schoolId) throw new ApiError(404, 'Document not found');
  const updated = await prisma.studentDocument.update({ where: { id: doc.id }, data: { verified: true } });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'VERIFY_DOCUMENT', module: 'DOCUMENTS' });
  return ok(res, updated, 'Document verified');
}

export async function deleteDocument(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const doc = await prisma.studentDocument.findUnique({ where: { id: req.params.id } });
  if (!doc || doc.schoolId !== schoolId) throw new ApiError(404, 'Document not found');
  await prisma.studentDocument.delete({ where: { id: doc.id } });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'DELETE_DOCUMENT', module: 'DOCUMENTS' });
  return ok(res, null, 'Document deleted');
}

// ---------- CERTIFICATES ----------
export async function generateCertificate(req: Request, res: Response) {
  const body = generateCertificateSchema.parse(req.body);
  const schoolId = schoolOf(req);
  const student = await prisma.student.findUnique({ where: { id: body.studentId } });
  if (!student || student.schoolId !== schoolId) throw new ApiError(404, 'Student not found');
  const number = generateCertificateNumber();
  const cert = await prisma.certificate.create({
    data: {
      schoolId, studentId: student.id, type: body.type ?? 'CERTIFICATE',
      number, createdBy: req.auth!.sub,
            pdfUrl: `${config.publicBaseUrl.certificates}/${number}.pdf`,
    },
  });
  await auditLog({ userId: req.auth?.sub, schoolId, ip: req.ip, action: 'GENERATE_CERTIFICATE', module: 'CERTIFICATES', details: { number } });
  return created(res, cert, 'Certificate generated');
}

export async function listCertificates(req: Request, res: Response) {
  const schoolId = schoolOf(req);
  const { studentId } = req.query as { studentId?: string };
    const isStudentRole = req.auth?.roles.includes('STUDENT');
  const where: any = { schoolId };
  if (studentId) {
    const target = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
    if (!target) throw new ApiError(404, 'Student not found');
    if (isStudentRole) {
      const own = await prisma.student.findFirst({ where: { userId: req.auth!.sub, schoolId }, select: { id: true } });
      if (!own || own.id !== studentId) throw new ApiError(404, 'Student not found');
    }
    where.studentId = studentId;
  }
  if (isStudentRole && !studentId) {
    // Students see their own certificates (and siblings' via shared guardians).
    const student = await prisma.student.findFirst({ where: { userId: req.auth!.sub, schoolId } });
    if (!student) throw new ApiError(404, 'Student not found');
    const parentIds = (await prisma.studentParent.findMany({ where: { studentId: student.id }, select: { parentId: true } })).map((p) => p.parentId);
    const siblingIds = parentIds.length
      ? (await prisma.studentParent.findMany({ where: { parentId: { in: parentIds }, student: { schoolId } }, select: { studentId: true } })).map((p) => p.studentId)
      : [];
    where.studentId = { in: [student.id, ...siblingIds] };
  }
  const certs = await prisma.certificate.findMany({ where, include: { student: true }, orderBy: { issuedAt: 'desc' } });
  return ok(res, certs, 'Certificates fetched');
}