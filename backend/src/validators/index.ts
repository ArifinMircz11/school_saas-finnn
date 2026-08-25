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
  startTime: z.string().min(1),
  endTime: z.string().min(1),
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