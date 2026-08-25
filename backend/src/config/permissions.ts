/**
 * Central permission catalog.
 * Keys are used both in the DB (Permission.key) and in route guards.
 */
export const PERMISSIONS: string[] = [
  // Students
  'students.view', 'students.create', 'students.update', 'students.delete',
  // Parents
  'parents.view', 'parents.create', 'parents.update',
  // Teachers
  'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete',
  // Fees
  'fees.view', 'fees.create', 'fees.collect', 'fees.refund', 'fees.assign',
  // Attendance
  'attendance.view', 'attendance.mark', 'attendance.update',
  // Homework
  'homework.view', 'homework.create', 'homework.grade',
  // Exams & Results
  'exams.view', 'exams.create', 'results.view', 'results.enter', 'results.publish',
  // Timetable
  'timetable.view', 'timetable.manage',
  // Academic
  'academic.manage',
  // Documents
  'documents.view', 'documents.upload', 'documents.download', 'documents.verify',
  // Certificates
  'certificates.view', 'certificates.generate',
  // Notices
  'notices.view', 'notices.create',
  // Admissions
  'admissions.view', 'admissions.review',
  // Subscriptions & schools (super admin)
  'schools.manage', 'subscriptions.manage', 'plans.manage', 'users.manage',
  // Reports
  'reports.view', 'reports.export',
  // Settings
  'settings.manage',
  // Notifications
  'notifications.view',
  // Tickets
  'tickets.manage', 'tickets.view',
  // Audit
  'audit.view',
  // Principal (school leadership — granular & configurable)
  'principal.analytics.view',
  'principal.attendance.analytics.view',
  'principal.academic.performance.view',
  'principal.teacher.performance.view',
  'principal.admissions.approve',
  'principal.results.approve',
  'principal.results.publish',
  'principal.leave.approve',
  'principal.certificates.approve',
  'principal.fees.overview.view',
  'principal.reports.view',
  'principal.approvals.manage',
];

export const ALL_PERMISSIONS = PERMISSIONS;