import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { ApiError, ok, created } from '../utils/response';
import { createSchoolSchema, updateSchoolSchema, schoolStatusSchema } from '../validators';
import { auditLog } from '../utils/audit';
import { hashPassword } from '../utils/password';

export async function listSchools(req: Request, res: Response) {
  const { status, q } = req.query as { status?: string; q?: string };
  const where: any = { deletedAt: null };
  if (status) where.status = String(status).toUpperCase();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }
  const schools = await prisma.school.findMany({
    where,
    include: { plan: true, _count: { select: { students: true, teachers: true, subscriptions: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, schools, 'Schools fetched');
}

export async function getSchool(req: Request, res: Response) {
  const school = await prisma.school.findUnique({
    where: { id: req.params.id },
    include: {
      plan: true, subscriptions: { include: { plan: true, invoices: true } },
      _count: { select: { students: true, teachers: true, parents: true, users: true } },
    },
  });
  if (!school || school.deletedAt) throw new ApiError(404, 'School not found');
  return ok(res, school, 'School fetched');
}

export async function createSchool(req: Request, res: Response) {
  const body = createSchoolSchema.parse(req.body);
  const existing = await prisma.school.findUnique({ where: { code: body.code } });
  if (existing) throw new ApiError(409, 'School code already exists');
  const school = await prisma.school.create({
    data: {
      name: body.name, code: body.code, domain: body.domain,
      email: body.email, phone: body.phone, address: body.address,
      city: body.city, state: body.state, country: body.country,
      status: 'PENDING', settings: { academicYear: new Date().getFullYear().toString() },
    },
  });
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'CREATE_SCHOOL', module: 'SCHOOLS', details: { code: school.code } });
  return created(res, school, 'School created; pending approval');
}

export async function updateSchool(req: Request, res: Response) {
  const body = updateSchoolSchema.parse(req.body);
  const school = await prisma.school.update({ where: { id: req.params.id }, data: body });
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'UPDATE_SCHOOL', module: 'SCHOOLS' });
  return ok(res, school, 'School updated');
}

export async function updateSchoolStatus(req: Request, res: Response) {
  const { status } = schoolStatusSchema.parse(req.body);
  const prev = await prisma.school.findUnique({ where: { id: req.params.id } });
  if (!prev) throw new ApiError(404, 'School not found');
  const school = await prisma.school.update({ where: { id: req.params.id }, data: { status } });
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: `SET_SCHOOL_STATUS:${status}`, module: 'SCHOOLS', details: { prev: prev.status } });
  return ok(res, school, `School status set to ${status}`);
}

export async function archiveSchool(req: Request, res: Response) {
  const school = await prisma.school.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'ARCHIVE_SCHOOL', module: 'SCHOOLS' });
  return ok(res, school, 'School archived');
}

/** Create a school and its school-admin account in one transaction. */
export async function createSchoolWithAdmin(req: Request, res: Response) {
  const body = createSchoolSchema.parse(req.body);
  const adminBody = (req.body as any).admin || {};
  if (!adminBody.email || !adminBody.password) {
    throw new ApiError(400, 'admin.email and admin.password required');
  }
  // Hash BEFORE entering the transaction: bcrypt is slow and would otherwise
  // hold the interactive transaction open past the ~5s interactive timeout
  // on hosted Postgres.
  const passwordHash = await hashPassword(adminBody.password);
  const school = await prisma.$transaction(async (tx) => {
    const s = await tx.school.create({
      data: {
        name: body.name, code: body.code, domain: body.domain,
        email: body.email, phone: body.phone, address: body.address,
        city: body.city, state: body.state, country: body.country,
        status: 'ACTIVE', settings: { academicYear: new Date().getFullYear().toString() } ,
      },
    });
    const admin = await tx.user.create({
      data: {
        schoolId: s.id, email: adminBody.email.toLowerCase(),
        firstName: adminBody.firstName || 'School', lastName: adminBody.lastName || 'Admin',
        passwordHash, emailVerified: true,
        roles: { create: [{ role: 'SCHOOL_ADMIN' }] } ,
      },
    });
    const permRows = await tx.permission.findMany({ select: { id: true } });
    if (permRows.length) {
      await tx.userPermission.createMany({
        data: permRows.map((p) => ({ userId: admin.id, permissionId: p.id, granted: true })),
      });
    }
    return s;
  });
  await auditLog({ userId: req.auth?.sub, schoolId: school.id, ip: req.ip, action: 'CREATE_SCHOOL_WITH_ADMIN', module: 'SCHOOLS' });
  return created(res, school, 'School and admin account created');
}