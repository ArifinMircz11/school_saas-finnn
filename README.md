# School Management SaaS

A production-ready, multi-tenant **School Management SaaS platform** with five role-based frontend applications and one centralized backend.

```
school-management-saas/
├── backend/        # Centralized Node.js + Express + TypeScript + Prisma REST API (PostgreSQL)
├── super-admin/    # Vite React app — platform administration (superadmin.yoursaas.com)
├── school-admin/   # Vite React app — manage one school (admin.school.yoursaas.com)
├── principal/      # Vite React app — school leadership, performance & approvals (principal.school.yoursaas.com)
├── teacher/        # Vite React app — teachers (teacher.school.yoursaas.com)
└── parent/         # Vite React app — ONE portal for BOTH students & parents (portal.school.yoursaas.com)
```

Each dashboard is a **completely self-contained** React/Vite/TypeScript application (its own routes, layout,
sidebar, auth flow, and an **inlined copy of the shared UI + API client** under `src/shared/`) so each one can be
built, deployed and linked independently. They all talk to the **same centralized backend**.

> **Students & Parents share a single dashboard and a single login.** There is one portal (`parent/`) that serves
> both the `STUDENT` and `PARENT` roles. **Parents use the student's credentials** — there is no separate parent
> account. Guardian contact information is stored on the student record as data only. A parent logging in sees each
> of their children and can switch between them with the **Select Child** picker; the backend returns one unified
> dashboard payload for both roles.

## Features

- **Multi-tenant isolation** — tenant is resolved from the authenticated session, never trusted from the client.
- **Auth** — JWT access + refresh tokens, login/logout, forgot/reset password, email verification, session management.
- **RBAC + permission system** — roles `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, `PARENT`, `STUDENT`, `STAFF` plus granular permissions (`students.view`, `fees.collect`, `results.publish`, `principal.results.approve`, …).
- **Admissions** — public form → document upload → school review → approve → auto-create student + guardian record (parents log in with the student's credentials).
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
cp .env.example .env        # edit DATABASE_URL, JWT secrets, Cloudinary, email providers, public URLs
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
cd parent       && npm install && npm run dev  # port 5176  (students AND parents log in here)
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
| Student & Parent portal | `student@demo.com` | `Demo@123`|  ← Student 1 (parents use their child's credentials)
| Student & Parent portal | `student2@demo.com` | `Demo@123`|  ← Student 2 (sibling — unique login)

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
7. Open the **Student & Parent portal** (`parent/` app) — log in with the **student's credentials**
   (`student@demo.com` / `Demo@123`). **Every student has a unique login, even siblings** (`student2@demo.com`
   is the seeded sibling). Students see their own academic profile, grades, fees and homework; parents use
   one child's credentials and can switch between all their children on the dashboard. The dashboard also
   shows the **Parents / Guardians** section and a **performance report analysis** (subject averages,
   overall average and exam trend derived from published results).

## Backend architecture

Commands flow: `Frontend → Express route → controller → service → Prisma → PostgreSQL`. Authorization is enforced
server-side on every route via `requireAuth`, `requireRole`, `requirePermission`, and tenant checks.

### Configuring APIs for production

All URLs are resolved from environment variables at startup — no backend URL is hard-coded:

- Each dashboard reads `import.meta.env.VITE_API_URL` to reach the centralized
  backend. Copy `<app>/.env.example` to `.env` (or `.env.production`) and set
  `VITE_API_URL=https://api.yoursaas.com/api`. In dev each app's `.env.example`
  points at `http://localhost:5000/api`. When the variable is unset the client
  falls back to a relative (same-origin) base, so production deployments work
  with a single same-origin build if desired.

#### Email delivery

Emails are sent via **REST API**, not SMTP. Resend is the primary provider; if a
Resend request fails (or no Resend key is configured) the service automatically
falls back to **Brevo (Sendinblue)** over its REST endpoint. The same fallback is
used by `POST /api/auth/forgot-password`, `verify-email`, etc. If neither key is
set, emails are logged as a dev stub (`[mail stub]`) and never fail the request.

Set these in `backend/.env`:

```
EMAIL_FROM=noreply@yoursaas.com      # fallback "from" address
RESEND_API_KEY=re_…                  # primary provider
RESEND_FROM=                         # overrides EMAIL_FROM
RESEND_BASE_URL=https://api.resend.com
BREVO_API_KEY=…                      # automatic fallback provider
BREVO_FROM=                          # overrides EMAIL_FROM
BREVO_FROM_NAME=School SaaS
BREVO_BASE_URL=https://api.brevo.com
```

## Extensibility

The modular structure (controllers/services/routes + Prisma models) is designed so new modules — Transport, Hostel,
Library, Payroll, Inventory, Bus Tracking, Online Classes, SMS/WhatsApp, Mobile Apps — can be added without rebuilding
core architecture. Add a Prisma model, a controller/service/routes group, and a new dashboard/route section.

## Security notes

- Authorization is enforced by the backend. The frontends only select *which* operations to expose.
- Tenant (`schoolId`) is always derived from the token / database lookup.
- All sensitive operations write an audit log entry.