import { prisma } from '../src/config/database';
import { ALL_PERMISSIONS } from '../src/config/permissions';
import { hashPassword } from '../src/utils/password';
import { SCHOOL_ADMIN_DEFAULT_PERMISSIONS } from '../src/controllers/user.controller';

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Permissions
  let permCount = 0;
  for (const key of ALL_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { key } });
    if (!existing) {
      await prisma.permission.create({ data: { key } });
      permCount++;
    }
  }
  console.log(`Permissions: ${permCount} created`);

  // 2. Plans
  const plans = [
    {
      name: 'Starter', code: 'starter', price: 0, period: 'MONTHLY', maxStudents: 200, maxTeachers: 25, maxAdmins: 2, maxStorage: 2048,
      modules: { fees: true, attendance: true, homework: true, exams: true, documents: true },
    },
    {
      name: 'Standard', code: 'standard', price: 499, period: 'MONTHLY', maxStudents: 1000, maxTeachers: 100, maxAdmins: 5, maxStorage: 10240,
      modules: { fees: true, attendance: true, homework: true, exams: true, documents: true, certificates: true, tickets: true },
    },
    {
      name: 'Premium', code: 'premium', price: 999, period: 'MONTHLY', maxStudents: 5000, maxTeachers: 500, maxAdmins: 20, maxStorage: 51200,
      modules: { fees: true, attendance: true, homework: true, exams: true, documents: true, certificates: true, tickets: true, transport: true, hostel: true },
    },
  ];
  for (const p of plans) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { code: p.code } });
    if (!existing) {
      await prisma.subscriptionPlan.create({ data: { ...p, modules: p.modules } });
    }
  }
  console.log('Plans ensured (starter, standard, premium)');

  // 3. Bootstrap super admin (only if none exists)
  const superAdmins = await prisma.user.count({ where: { roles: { some: { role: 'SUPER_ADMIN' } } } });
  if (superAdmins === 0 && process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) {
    const passwordHash = await hashPassword(process.env.SUPER_ADMIN_PASSWORD);
    await prisma.user.create({
      data: {
        email: process.env.SUPER_ADMIN_EMAIL.toLowerCase(),
        firstName: 'Platform', lastName: 'Admin', passwordHash, emailVerified: true,
        roles: { create: [{ role: 'SUPER_ADMIN' }] },
      },
    });
    console.log('Super admin bootstrapped from env vars');
  } else {
    console.log('Super admin already exists (or env vars not set). Use POST /api/auth/bootstrap to create one.');
  }

    // 4. Demo school + demo accounts for every dashboard page
  //    Credentials (all share Demo@123 for convenience except students):
  //      super-admin@demo.com / Demo@123  -> Super Admin
  //      admin@demo.com       / Demo@123  -> School Admin
  //      principal@demo.com   / Demo@123  -> Principal
  //      teacher@demo.com     / Demo@123  -> Teacher
  //      student@demo.com     / Demo@123  -> Student 1 (unique login)
  //      student2@demo.com    / Demo@123  -> Student 2 (unique login — sibling)
  //    Parents have NO login. Parents use their child's credentials.
  //    Each sibling has a DISTINCT login so no two students share credentials.
  const demoPassword = 'Demo@123';
  const standardPlan = await prisma.subscriptionPlan.findUnique({ where: { code: 'standard' } });

  const demoSchool = await prisma.school.upsert({
    where: { code: 'DEMO' },
    update: { status: 'ACTIVE', planId: standardPlan?.id ?? null },
    create: {
      name: 'Demo International School',
      code: 'DEMO',
      status: 'ACTIVE',
      planId: standardPlan?.id ?? null,
      enabledModules: { fees: true, attendance: true, homework: true, exams: true, documents: true, certificates: true, tickets: true },
    },
  });

  // Minimal academic structure so the teacher & student dashboards have data.
  const demoClass = await prisma.class.upsert({
    where: { schoolId_name: { schoolId: demoSchool.id, name: 'Grade 10' } },
    update: {},
    create: { schoolId: demoSchool.id, name: 'Grade 10' },
  });
  const demoSec = await prisma.section.upsert({
    where: { classId_name: { classId: demoClass.id, name: 'A' } },
    update: {},
    create: { schoolId: demoSchool.id, classId: demoClass.id, name: 'A' },
  });
  const demoSubject = await prisma.subject.upsert({
    where: { schoolId_name: { schoolId: demoSchool.id, name: 'Mathematics' } },
    update: {},
    create: { schoolId: demoSchool.id, name: 'Mathematics', code: 'MATH' },
  });

  // Idempotently create/update a user and ensure the requested roles exist.
  async function ensureUser(email: string, data: { firstName: string; lastName: string; schoolId?: string; roles: string[] }) {
    const passwordHash = await hashPassword(demoPassword);
    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: {
        firstName: data.firstName, lastName: data.lastName,
        schoolId: data.schoolId ?? null, isActive: true, emailVerified: true, passwordHash,
      },
      create: {
        email: email.toLowerCase(), firstName: data.firstName, lastName: data.lastName,
        schoolId: data.schoolId ?? null, passwordHash, emailVerified: true, isActive: true,
        roles: { create: data.roles.map((role) => ({ role: role as any })) },
      },
    });
    await prisma.userRoleAssignment.createMany({
      data: data.roles.map((role) => ({ userId: user.id, role: role as any })),
      skipDuplicates: true,
    });
    return user;
  }

  // Super Admin (global — no school)
  await ensureUser('super-admin@demo.com', { firstName: 'Platform', lastName: 'Admin', roles: ['SUPER_ADMIN'] });
  // School Admin
  const adminUser = await ensureUser('admin@demo.com', { firstName: 'School', lastName: 'Admin', schoolId: demoSchool.id, roles: ['SCHOOL_ADMIN'] });

  // Teacher (+ profile + class/subject links)
  const teacherUser = await ensureUser('teacher@demo.com', { firstName: 'Demo', lastName: 'Teacher', schoolId: demoSchool.id, roles: ['TEACHER'] });
  const teacher = await prisma.teacher.upsert({
    where: { empCode: 'T-DEMO-001' },
    update: { userId: teacherUser.id, firstName: 'Demo', lastName: 'Teacher' },
    create: { schoolId: demoSchool.id, userId: teacherUser.id, empCode: 'T-DEMO-001', firstName: 'Demo', lastName: 'Teacher', designation: 'Mathematics Teacher' },
  });
  await prisma.teacherSection.upsert({
    where: { teacherId_sectionId: { teacherId: teacher.id, sectionId: demoSec.id } },
    update: {},
    create: { teacherId: teacher.id, sectionId: demoSec.id },
  });
  await prisma.teacherSubject.upsert({
    where: { teacherId_subjectId: { teacherId: teacher.id, subjectId: demoSubject.id } },
    update: {},
    create: { teacherId: teacher.id, subjectId: demoSubject.id },
  });

  // Grant the teacher the permissions their dashboard needs (mark attendance,
  // enter marks, publish results, grade homework) so there are no dead ends.
  const teacherPerms = await prisma.permission.findMany({
    where: { key: { in: [
      'students.view', 'teachers.view', 'attendance.view', 'attendance.mark', 'attendance.update',
      'homework.view', 'homework.create', 'homework.grade', 'exams.view', 'results.view',
      'results.enter', 'results.publish', 'timetable.view', 'notices.view', 'notifications.view',
    ] } },
  });
  await prisma.userPermission.createMany({
    data: teacherPerms.map((p) => ({ userId: teacherUser.id, permissionId: p.id, granted: true })),
    skipDuplicates: true,
  });

  // School Admin — grant the full school-scoped permission set (incl. users.manage)
  // so the admin dashboard has no dead ends and the /users module is usable.
  const adminPerms = await prisma.permission.findMany({
    where: { key: { in: SCHOOL_ADMIN_DEFAULT_PERMISSIONS } },
    select: { id: true },
  });
  await prisma.userPermission.createMany({
    data: adminPerms.map((p) => ({ userId: adminUser.id, permissionId: p.id, granted: true })),
    skipDuplicates: true,
  });

    // Student 1 — unique login (role STUDENT). Parents use these credentials.
  const studentUser = await ensureUser('student@demo.com', { firstName: 'Demo', lastName: 'Student', schoolId: demoSchool.id, roles: ['STUDENT'] });
  const student = await prisma.student.upsert({
    where: { admissionNo: 'ADM-DEMO-001' },
    update: { userId: studentUser.id, firstName: 'Demo', lastName: 'Student', classId: demoClass.id, sectionId: demoSec.id },
    create: { schoolId: demoSchool.id, userId: studentUser.id, admissionNo: 'ADM-DEMO-001', firstName: 'Demo', lastName: 'Student', gender: 'M', dob: new Date('2012-04-15'), classId: demoClass.id, sectionId: demoSec.id, rollNo: 1 },
  });

  // Student 2 — sibling with a DISTINCT login (unique credentials, not shared).
  const studentUser2 = await ensureUser('student2@demo.com', { firstName: 'Demo', lastName: 'Student2', schoolId: demoSchool.id, roles: ['STUDENT'] });
  const student2 = await prisma.student.upsert({
    where: { admissionNo: 'ADM-DEMO-002' },
    update: { userId: studentUser2.id, firstName: 'Demo', lastName: 'Student2', classId: demoClass.id, sectionId: demoSec.id },
    create: { schoolId: demoSchool.id, userId: studentUser2.id, admissionNo: 'ADM-DEMO-002', firstName: 'Demo', lastName: 'Student2', gender: 'F', dob: new Date('2014-06-20'), classId: demoClass.id, sectionId: demoSec.id, rollNo: 2 },
  });

  // Grant STUDENT default permissions to both students.
  const studentPerms = await prisma.permission.findMany({
    where: { key: { in: [
      'students.view', 'attendance.view', 'homework.view', 'exams.view',
      'results.view', 'timetable.view', 'notices.view', 'notifications.view',
      'documents.view', 'certificates.view',
    ] } },
  });
  for (const sUser of [studentUser.id, studentUser2.id]) {
    await prisma.userPermission.createMany({
      data: studentPerms.map((p) => ({ userId: sUser, permissionId: p.id, granted: true })),
      skipDuplicates: true,
    });
  }

      // Shared guardian contact info (data only — guardian has no login account).
  // Both siblings are linked to the same guardian to demonstrate sibling lookup.
  let guardian = await prisma.parent.findFirst({ where: { schoolId: demoSchool.id, phone: '9876543210' } });
  if (!guardian) guardian = await prisma.parent.create({ data: { schoolId: demoSchool.id, firstName: 'Demo', lastName: 'Parent', phone: '9876543210' } });
  await prisma.studentParent.upsert({
    where: { studentId_parentId: { studentId: student.id, parentId: guardian.id } },
    update: { isPrimary: true },
    create: { studentId: student.id, parentId: guardian.id, relationship: 'PARENT', isPrimary: true },
  });
  await prisma.studentParent.create({
    data: { studentId: student2.id, parentId: guardian.id, relationship: 'PARENT', isPrimary: false },
  });

  // Principal (+ profile + default permission set)
  const principalUser = await ensureUser('principal@demo.com', { firstName: 'Demo', lastName: 'Principal', schoolId: demoSchool.id, roles: ['PRINCIPAL'] });
  await prisma.principalProfile.upsert({
    where: { userId: principalUser.id },
    update: { schoolId: demoSchool.id },
    create: { schoolId: demoSchool.id, userId: principalUser.id, title: 'Principal' },
  });
  const principalPerms = await prisma.permission.findMany({
    where: { key: { in: [
      'students.view', 'teachers.view', 'attendance.view', 'results.view', 'admissions.view', 'admissions.review',
      'fees.view', 'certificates.view', 'homework.view', 'exams.view', 'notices.view',
      'reports.view', 'notifications.view', 'principal.analytics.view', 'principal.attendance.analytics.view',
      'principal.academic.performance.view', 'principal.teacher.performance.view', 'principal.admissions.approve',
      'principal.results.approve', 'principal.results.publish', 'principal.leave.approve',
      'principal.certificates.approve', 'principal.fees.overview.view', 'principal.reports.view',
      'principal.approvals.manage',
    ] } },
  });
  await prisma.userPermission.createMany({
    data: principalPerms.map((p) => ({ userId: principalUser.id, permissionId: p.id, granted: true })),
    skipDuplicates: true,
  });

  console.log('Demo school + demo accounts seeded (password: Demo@123)');

  console.log('✅ Seeding complete');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });