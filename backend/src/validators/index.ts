import { z } from 'zod';

// ---------- AUTH ----------
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});
export const verifyEmailSchema = z.object({ email: z.string().email(), code: z.string().min(4) });

// ---------- SCHOOLS ----------
export const createSchoolSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  domain: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});
export const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  logoUrl: z.string().optional(),
});
export const schoolStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED', 'REJECTED']),
  reason: z.string().optional(),
});

// ---------- PLANS & SUBSCRIPTIONS ----------
export const planSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  period: z.string(),
  maxStudents: z.coerce.number().int().nonnegative(),
  maxTeachers: z.coerce.number().int().nonnegative(),
  maxAdmins: z.coerce.number().int().nonnegative(),
  maxStorage: z.coerce.number().int().nonnegative(),
  modules: z.record(z.boolean()).optional(),
});
export const subscriptionSchema = z.object({
  schoolId: z.string().min(1),
  planId: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED']).default('TRIAL'),
  trialDays: z.coerce.number().int().nonnegative().default(14),
});
// ---------- ACADEMIC ----------
export const sessionSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const classSchema = z.object({ name: z.string().min(1) });
export const sectionSchema = z.object({ classId: z.string().min(1), name: z.string().min(1) });
export const subjectSchema = z.object({ name: z.string().min(1), code: z.string().optional() });

// ---------- PEOPLE ----------
export const studentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dob: z.string().min(1),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
  photoUrl: z.string().optional(),
  email: z.string().email().optional(),        // student's own login email (unique per student)
  password: z.string().min(6).optional(),      // student login password (auto-generated if omitted)
  parentEmail: z.string().email().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
});
export const teacherSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  sectionIds: z.array(z.string()).optional(),
  subjectIds: z.array(z.string()).optional(),
});
export const parentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  studentIds: z.array(z.string()).optional(),
});

// ---------- FEES ----------
export const feeCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  frequency: z.string().optional(),
});
export const feeStructureSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),
  amount: z.coerce.number().nonnegative(),
  dueDate: z.string().optional(),
  lateFee: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().optional(),
  installment: z.coerce.number().int().positive().optional(),
});
export const assignFeeSchema = z.object({
  studentIds: z.array(z.string().min(1)),
  structureId: z.string().min(1),
});
export const collectFeeSchema = z.object({
  studentFeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.string().optional(),
  transactionId: z.string().optional(),
});
// ---------- ATTENDANCE ----------
export const markAttendanceSchema = z.object({
  date: z.string().min(1),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']),
      remarks: z.string().optional(),
    })
  ),
});

// ---------- HOMEWORK ----------
export const homeworkSchema = z.object({
  sectionId: z.string().optional(),
  subjectId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().min(1),
});

// ---------- EXAMS ----------
export const examSchema = z.object({
  name: z.string().min(1),
  sessionId: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
export const examSubjectSchema = z.object({
  examId: z.string().min(1),
  subjectId: z.string().min(1),
  maxMarks: z.coerce.number().int().positive(),
  passMarks: z.coerce.number().int().nonnegative(),
  date: z.string().optional(),
});
export const enterMarksSchema = z.object({
  examSubjectId: z.string().min(1),
  marks: z.array(
    z.object({ studentId: z.string().min(1), marksObtained: z.coerce.number().nonnegative() })
  ),
});

// ---------- TIMETABLE / NOTICE ----------
export const timetableSchema = z.object({
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  day: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
});
export const noticeSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  audience: z.string().optional(),
});

// ---------- TICKETS ----------
export const ticketSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.string().optional(),
});
export const impersonateSchema = z.object({ userId: z.string().min(1) });

// ---------- USERS & PERMISSIONS ----------
export const userRoleEnum = z.enum(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT', 'STAFF']);

/** New-account / password-change policy: >= 8 chars with at least one letter and one digit. */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number');

/** Create a brand-new User account (school admin must pass users.manage at the route). */
export const createUserSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  roles: z.array(userRoleEnum).optional(),
  permissionKeys: z.array(z.string()).optional(),
  schoolId: z.string().optional(), // super-admin only; ignored for tenant users
  title: z.string().optional(),    // principal profile title
});

/** Partial PATCH of name/phone/status/password. */
export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  password: strongPasswordSchema.optional(),
});

export const setUserRolesSchema = z.object({
  roles: z.array(userRoleEnum),
});

export const setUserPermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});

/** Self-service password change (authenticated), separate from admin user management. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPasswordSchema,
});

// ---------- ADMISSIONS (public form) ----------
export const admissionSchema = z.object({
  schoolCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: z.string().optional(),
  classId: z.string().optional(),
  parentName: z.string().optional(),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().optional(),
});

// ---------- DOCUMENTS & CERTIFICATES ----------
export const studentDocumentUploadSchema = z.object({
  studentId: z.string().min(1),
  type: z.string().optional(),
  title: z.string().optional(),
});
export const generateCertificateSchema = z.object({
  studentId: z.string().min(1),
  type: z.string().optional(),
});

// ---------- PRINCIPAL APPROVALS ----------
export const createApprovalSchema = z.object({
  type: z.string().optional(),
  referenceId: z.string().optional(),
  reference: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
});