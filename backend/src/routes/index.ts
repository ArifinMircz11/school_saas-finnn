import { Router } from 'express';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { authLimiter, publicLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { upload } from '../middleware/upload';

import * as authCore from '../controllers/auth.controller';
import * as authAccount from '../controllers/auth.account.controller';
import * as authSuper from '../controllers/auth.superadmin.controller';
import * as admissions from '../controllers/admission.controller';
import * as dashboard from '../controllers/dashboard.controller';
import * as academic from '../controllers/academic.controller';
import * as students from '../controllers/student.controller';
import * as teacherParent from '../controllers/teacher-parent.controller';
import * as fees from '../controllers/fee.controller';
import * as feePayments from '../controllers/fee-payment.controller';
import * as attendance from '../controllers/attendance.controller';
import * as homework from '../controllers/homework.controller';
import * as exams from '../controllers/exam.controller';
import * as timetable from '../controllers/timetable.controller';
import * as notices from '../controllers/notice.controller';
import * as docs from '../controllers/document.controller';
import * as misc from '../controllers/misc.controller';
import * as schools from '../controllers/school.controller';
import * as subscriptions from '../controllers/subscription.controller';
import * as analytics from '../controllers/analytics.controller';
import * as users from '../controllers/user.controller';
import * as principal from '../controllers/principal.controller';

const router = Router();
export default router;

// ---------- AUTH (public) ----------
router.post('/auth/login', authLimiter, asyncHandler(authCore.login));
router.post('/auth/refresh', asyncHandler(authCore.refresh));
router.post('/auth/logout', asyncHandler(authCore.logout));
router.post('/auth/forgot-password', authLimiter, asyncHandler(authAccount.forgotPassword));
router.post('/auth/reset-password', asyncHandler(authAccount.resetPassword));
router.post('/auth/verify-email/request', asyncHandler(authAccount.requestEmailVerification));
router.post('/auth/verify-email', asyncHandler(authAccount.verifyEmail));
router.post('/auth/bootstrap', asyncHandler(authSuper.bootstrapSuperAdmin));

// Public admission form (anyone can apply)
router.post('/public/admissions', publicLimiter, asyncHandler(admissions.submitAdmission));
// Public admission document upload. NOTE: there is currently NO public admission
  // frontend app in this monorepo, so this endpoint is backend-API only (consumed by
  // any future / unauthenticated admission form). It is intentionally NOT listed as a
  // supported feature of the five dashboards because no UI calls it yet. Use the school
  // dashboard's Documents page (/documents/upload) for authenticated document uploads.
  router.post('/public/admissions/:id/documents', publicLimiter, upload.single('document') as any, asyncHandler(admissions.uploadAdmissionDocument));

// ---------- Authenticated base ----------
router.use(requireAuth);

router.get('/auth/me', asyncHandler(authAccount.me));
router.post('/auth/change-password', asyncHandler(authAccount.changePassword));
router.post('/auth/impersonate', requireRole('SUPER_ADMIN'), asyncHandler(authSuper.loginAs));
router.get('/dashboard', asyncHandler(dashboard.getDashboard));

const superOnly = requireRole('SUPER_ADMIN');
// ---------- Academic ----------
router.get('/academic/profile', asyncHandler(academic.getAcademicProfile));
router.get('/academic/sessions', asyncHandler(academic.listSessions));
router.post('/academic/sessions', requirePermission('academic.manage'), asyncHandler(academic.createSession));
router.post('/academic/sessions/:id/activate', requirePermission('academic.manage'), asyncHandler(academic.setActiveSession));
router.get('/academic/classes', asyncHandler(academic.listClasses));
router.post('/academic/classes', requirePermission('academic.manage'), asyncHandler(academic.createClass));
router.post('/academic/sections', requirePermission('academic.manage'), asyncHandler(academic.createSection));
router.get('/academic/subjects', asyncHandler(academic.listSubjects));
router.post('/academic/subjects', requirePermission('academic.manage'), asyncHandler(academic.createSubject));

// ---------- Students / Parents / Teachers / Staff ----------
router.get('/students', requirePermission('students.view'), asyncHandler(students.listStudents));
router.get('/students/:id', requirePermission('students.view'), asyncHandler(students.getStudent));
router.post('/students', requirePermission('students.create'), asyncHandler(students.createStudent));
router.patch('/students/:id', requirePermission('students.update'), asyncHandler(students.updateStudent));
router.delete('/students/:id', requirePermission('students.delete'), asyncHandler(students.deleteStudent));

router.get('/parents', requirePermission('parents.view'), asyncHandler(teacherParent.listParents));
router.post('/parents', requirePermission('parents.create'), asyncHandler(teacherParent.createParent));
router.get('/teachers', requirePermission('teachers.view'), asyncHandler(teacherParent.listTeachers));
router.post('/teachers', requirePermission('teachers.create'), asyncHandler(teacherParent.createTeacher));
router.get('/staff', requirePermission('teachers.view'), asyncHandler(teacherParent.listStaff));

// ---------- Admissions ----------
router.get('/admissions', requirePermission('admissions.view'), asyncHandler(admissions.listAdmissions));
router.post('/admissions/:id/review', requirePermission('admissions.review'), asyncHandler(admissions.reviewAdmission));

// ---------- Fees ----------
router.get('/fees/categories', requirePermission('fees.view'), asyncHandler(fees.listFeeCategories));
router.post('/fees/categories', requirePermission('fees.create'), asyncHandler(fees.createFeeCategory));
router.get('/fees/structures', requirePermission('fees.view'), asyncHandler(fees.listFeeStructures));
router.post('/fees/structures', requirePermission('fees.create'), asyncHandler(fees.createFeeStructure));
router.post('/fees/assign', requirePermission('fees.assign'), asyncHandler(fees.assignFees));
router.get('/fees/students', asyncHandler(feePayments.studentFees));
router.post('/fees/collect', requirePermission('fees.collect'), asyncHandler(feePayments.collectFee));
router.get('/fees/reports', requirePermission('reports.view'), asyncHandler(feePayments.feeReports));
router.post('/fees/notifications', requirePermission('fees.collect'), asyncHandler(feePayments.generateFeeNotifications));

// ---------- Attendance ----------
router.get('/attendance', requirePermission('attendance.view'), asyncHandler(attendance.getAttendance));
router.post('/attendance/mark', requirePermission('attendance.mark'), asyncHandler(attendance.markAttendance));
router.get('/attendance/summary', requirePermission('attendance.view'), asyncHandler(attendance.attendanceSummary));

// ---------- Homework ----------
router.get('/homework', requirePermission('homework.view'), asyncHandler(homework.listHomework));
router.post('/homework', requireRole('TEACHER', 'SCHOOL_ADMIN'), upload.single('attachment') as any, asyncHandler(homework.createHomework));
router.post('/homework/:id/submit', upload.single('attachment') as any, asyncHandler(homework.submitHomework));
router.post('/homework/submissions/:id/grade', requirePermission('homework.grade'), asyncHandler(homework.gradeHomework));

// ---------- Exams & Results ----------
router.get('/exams', requirePermission('exams.view'), asyncHandler(exams.listExams));
router.post('/exams', requirePermission('exams.create'), asyncHandler(exams.createExam));
router.post('/exams/subjects', requirePermission('exams.create'), asyncHandler(exams.addExamSubject));
router.get('/marks', requirePermission('results.view'), asyncHandler(exams.listMarks));
router.post('/marks', requirePermission('results.enter'), asyncHandler(exams.enterMarks));
router.get('/results', requirePermission('results.view'), asyncHandler(exams.studentResults));
router.post('/results/publish', requirePermission('results.publish'), asyncHandler(exams.publishResults));

// ---------- Timetable ----------
router.get('/timetable', requirePermission('timetable.view'), asyncHandler(timetable.getTimetable));
router.post('/timetable', requirePermission('timetable.manage'), asyncHandler(timetable.createTimetableEntry));

// ---------- Notices & Notifications ----------
router.get('/notices', requirePermission('notices.view'), asyncHandler(notices.listNotices));
router.post('/notices', requirePermission('notices.create'), asyncHandler(notices.createNotice));
router.get('/notifications', asyncHandler(notices.myNotifications));
router.get('/notifications/unread', asyncHandler(notices.unreadCount));
router.post('/notifications/:id/read', asyncHandler(notices.markRead));
router.post('/notifications/read-all', asyncHandler(notices.markAllRead));

// ---------- Documents & Certificates ----------
router.get('/documents', asyncHandler(docs.listStudentDocuments));
router.post('/documents/upload', requirePermission('documents.upload'), upload.single('document') as any, asyncHandler(docs.uploadStudentDocument));
router.post('/documents/:id/verify', requirePermission('documents.verify'), asyncHandler(docs.verifyDocument));
router.delete('/documents/:id', requirePermission('documents.upload'), asyncHandler(docs.deleteDocument));
router.get('/certificates', asyncHandler(docs.listCertificates));
router.post('/certificates/generate', requirePermission('certificates.generate'), asyncHandler(docs.generateCertificate));
// ---------- Reports / Settings / Tickets / Audit ----------
router.get('/reports', asyncHandler(misc.getReports));
router.post('/reports/export', requirePermission('reports.export'), asyncHandler(misc.createReportExport));
router.get('/settings', requirePermission('settings.manage'), asyncHandler(misc.getSchoolSettings));
router.put('/settings', requirePermission('settings.manage'), asyncHandler(misc.updateSchoolSettings));
router.get('/tickets', asyncHandler(misc.listTickets));
router.post('/tickets', asyncHandler(misc.createTicket));
router.patch('/tickets/:id', asyncHandler(misc.updateTicket));
router.get('/audit-logs', requirePermission('audit.view'), asyncHandler(misc.listAuditLogs));

// ---------- Users & Permissions ----------
// All user-management routes are gated behind 'users.manage'. These four were
// previously open to any authenticated user (only tenant-checked inside the
// controller), which let a Parent/Student target their own account to grant
// themselves SCHOOL_ADMIN or any permission. The route guard is the primary
// control; requireAuth is applied above for everything after this point.
// /permissions/seed is additionally restricted to SUPER_ADMIN (defense in depth
// on top of the in-controller role check).
router.get('/users', requirePermission('users.manage'), asyncHandler(users.listUsers));
router.post('/users', requirePermission('users.manage'), asyncHandler(users.createUser));
router.patch('/users/:id', requirePermission('users.manage'), asyncHandler(users.updateUser));
router.post('/users/:id/roles', requirePermission('users.manage'), asyncHandler(users.setUserRoles));
router.get('/permissions', requirePermission('users.manage'), asyncHandler(users.listPermissions));
router.post('/users/:id/permissions', requirePermission('users.manage'), asyncHandler(users.setUserPermissions));
router.post('/permissions/seed', superOnly, asyncHandler(users.seedPermissions));

// ---------- SUPER ADMIN ONLY ----------
router.get('/schools', superOnly, asyncHandler(schools.listSchools));
router.get('/schools/:id', superOnly, asyncHandler(schools.getSchool));
router.post('/schools', superOnly, asyncHandler(schools.createSchool));
router.post('/schools/full', superOnly, asyncHandler(schools.createSchoolWithAdmin));
router.patch('/schools/:id', superOnly, asyncHandler(schools.updateSchool));
router.patch('/schools/:id/status', superOnly, asyncHandler(schools.updateSchoolStatus));
router.delete('/schools/:id', superOnly, asyncHandler(schools.archiveSchool));
router.get('/schools/:id/usage', superOnly, asyncHandler(subscriptions.getSchoolUsage));

router.get('/plans', asyncHandler(subscriptions.listPlans));
router.post('/plans', superOnly, asyncHandler(subscriptions.createPlan));
router.patch('/plans/:id', superOnly, asyncHandler(subscriptions.updatePlan));
router.delete('/plans/:id', superOnly, asyncHandler(subscriptions.deletePlan));
router.get('/subscriptions', superOnly, asyncHandler(subscriptions.listSubscriptions));
router.post('/subscriptions', superOnly, asyncHandler(subscriptions.createSubscription));
router.get('/invoices', superOnly, asyncHandler(subscriptions.listInvoices));
router.get('/analytics', superOnly, asyncHandler(analytics.getPlatformAnalytics));

// ---------- PRINCIPAL (school leadership; tenant-scoped, read-mostly) ----------
router.get('/principal/profile', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.getPrincipalProfile));
router.get('/principal/overview', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.principalOverview));
router.get('/principal/students', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.listPrincipalStudents));
router.get('/principal/students/:id', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.getPrincipalStudent));
router.get('/principal/at-risk', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.atRiskStudents));
router.get('/principal/teachers', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.listPrincipalTeachers));
router.get('/principal/attendance/analytics', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.attendanceAnalytics));
router.get('/principal/academic/performance', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.academicPerformance));
router.get('/principal/exams', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.listPrincipalExams));
router.get('/principal/admissions', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.admissionMonitoring));
router.get('/principal/fees/overview', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.feeOverview));
router.get('/principal/homework', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.homeworkMonitor));
router.get('/principal/analytics', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.principalAnalytics));
router.get('/principal/approvals', requireRole('PRINCIPAL', 'SCHOOL_ADMIN'), asyncHandler(principal.listApprovals));
router.post('/principal/approvals', requirePermission('principal.approvals.manage'), asyncHandler(principal.createApproval));
router.post('/principal/approvals/:id/review', requirePermission('principal.approvals.manage'), asyncHandler(principal.reviewApproval));