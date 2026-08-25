# School Management SaaS

A production-ready, multi-tenant **School Management SaaS platform** with six completely separate role-based frontend applications and one centralized backend.

```
school-management-saas/
├── backend/        # Centralized Node.js + Express + TypeScript + Prisma REST API (PostgreSQL)
├── super-admin/    # Vite React app — platform administration (superadmin.yoursaas.com)
├── school-admin/   # Vite React app — manage one school (admin.school.yoursaas.com)
├── principal/      # Vite React app — school leadership, performance & approvals (principal.school.yoursaas.com)
├── teacher/        # Vite React app — teachers (teacher.school.yoursaas.com)
├── parent/         # Vite React app — parents (parent.school.yoursaas.com)
├── student/        # Vite React app — students (student.school.yoursaas.com)
└── shared/         # Shared design system + API client used by all dashboards
```

Each dashboard is a **completely separate** React/Vite/TypeScript/Tailwind-style application with its own routes, layout, sidebar, auth flow and features. They all talk to the **same centralized backend**.

## Features

- **Multi-tenant isolation** — tenant is resolved from the authenticated session, never trusted from the client.
- **Auth** — JWT access + refresh tokens, login/logout, forgot/reset password, email verification, session management.
- **RBAC + permission system** — roles `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, `PARENT`, `STUDENT`, `STAFF` plus granular permissions (`students.view`, `fees.collect`, `results.publish`, `principal.results.approve`, …).
- **Admissions** — public form → document upload → school review → approve → auto-create student + parent.
- **Students / Parents / Teachers / Staff** management.
- **Fees** — categories, structures, assignments, payments, receipts, overdue, automatic fee notifications (7d/3d/due/overdue).
- **Attendance** — present/absent/late/leave with daily/monthly extraction + parental/student view.
- **Homework** — create/publish, student submissions, teacher grading.
- **Exams & Results** — exams, exam subjects, mark entry, publish results.
- **Timetable** — with teacher/section conflict detection.
- **Notices & centralized Notifications** with a bell + unread count in every dashboard.
- **Principal Dashboard** — separate app for school leadership: executive overview, at-risk students, school-wide
  attendance analytics, academic performance (class/subject/exam-wise, grades, pass %, top & weak students),
  teacher performance & workload, examination publication status, admission monitoring, fee overview
  (read-only financial summaries), a centralized **leave & approvals** center (approve / reject / request changes
  with full audit logging), notices, reports (PDF/Excel/CSV export) and analytics — all derived from existing
  data and strictly tenant-scoped to the principal's school. Principal permissions are granular and configured
  at the school level via a `PrincipalPermission` policy.
- **Documents & Certificates** — secure file storage (Cloudinary or object storage), verification, download; certificate/TC generation & history.
- **Reports** — students, fees, attendance, examinations; CSV/PDF export endpoints.
- **Subscriptions** — plans, subscriptions, trials, invoices, usage (`850/1000 students`).
- **Audit logging** of every sensitive operation.
- **Security** — password hashing (bcrypt), secure headers, CORS, rate limiting, file validation, soft deletion.

## Prerequisites

- Node.js 18+
- PostgreSQL (local or hosted)

## Getting Started

### 1. Backend

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL, JWT secrets, Cloudinary, SMTP
npm install
npx prisma generate         # generate the Prisma client from prisma/schema.prisma
npx prisma db push          # create the tables in PostgreSQL
npm run seed                # seed permissions + plans; optionally bootstrap a super admin
npm run dev                 # start the API at http://localhost:5000/api
```

> To create the first super admin, set `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` env vars before `npm run seed`,
> or call `POST /api/auth/bootstrap`.

Public admission form (no auth, requires an ACTIVE school's `code`):

```
POST /api/public/admissions
{ schoolCode, firstName, lastName, dob, gender, classId, parentName, parentEmail, parentPhone }
```

### 2. Dashboards (each is deployable independently)

```bash
cd super-admin && npm install && npm run dev   # port 5173
cd school-admin && npm install && npm run dev  # port 5174
cd principal     && npm install && npm run dev  # port 5178
cd teacher      && npm install && npm run dev  # port 5175
cd parent       && npm install && npm run dev  # port 5176
cd student      && npm install && npm run dev  # port 5177
```

Set `VITE_API_URL` per app to point at the centralized API in production.

After the first `npm run seed`, the following **demo accounts** are available so you can log into every dashboard immediately
(all share the password `Demo@123`; they belong to the seeded `DEMO` school except the super admin):

| Dashboard            | Email                 | Password  |
|----------------------|-----------------------|-----------|
| Super Admin          | `super-admin@demo.com`| `Demo@123`|
| School Admin         | `admin@demo.com`      | `Demo@123`|
| Principal            | `principal@demo.com`  | `Demo@123`|
| Teacher              | `teacher@demo.com`    | `Demo@123`|
| Parent               | `parent@demo.com`     | `Demo@123`|
| Student              | `student@demo.com`    | `Demo@123`|

### 3. Suggested first-run flow

1. Bootstrap a **super admin** → log in to the Super Admin app.
2. Create a school + admin account (Super Admin → Schools → New School).
3. Log in to the **School Admin** app → create session, classes/sections, add teachers/students/parents, fee structures.
4. Create a **Principal** account (School Admin → Users → assign the `PRINCIPAL` role). This auto-creates a principal
   profile and grants the default principal permission set. The Principal **cannot** be created as a standalone
   super-admin; a principal always belongs to a single school.
5. Log in to the **Principal** app → monitor attendance & academic performance, review/approve admissions &
   pending approvals, request result publication, and generate reports.
6. Log in as a **teacher** → mark attendance, publish homework, enter marks.
7. Log out, log in as a **parent** → view child, fees, results, documents, certificates.
8. Log in as a **student** → view grades/fees/homework.

## Backend architecture

Commands flow: `Frontend → Express route → controller → service → Prisma → PostgreSQL`. Authorization is enforced
server-side on every route via `requireAuth`, `requireRole`, `requirePermission`, and tenant checks.

### Configuring APIs for production

Each dashboard reads `import.meta.env.VITE_API_URL` to reach the centralized backend.

## Extensibility

The modular structure (controllers/services/routes + Prisma models) is designed so new modules — Transport, Hostel,
Library, Payroll, Inventory, Bus Tracking, Online Classes, SMS/WhatsApp, Mobile Apps — can be added without rebuilding
core architecture. Add a Prisma model, a controller/service/routes group, and a new dashboard/route section.

## Security notes

- Authorization is enforced by the backend. The frontends only select *which* operations to expose.
- Tenant (`schoolId`) is always derived from the token / database lookup.
- All sensitive operations write an audit log entry.