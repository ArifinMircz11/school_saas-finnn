# School Management SaaS

A production-ready, multi-tenant **School Management SaaS platform** with five role-based frontend applications and a centralized backend.

```
school-management-saas/
├── backend/        # Centralized Node.js + Express + TypeScript API (PostgreSQL/Prisma + Google Cloud Firestore)
├── packages/
│   ├── api-client/ # Shared HTTP client, token refresh & React Query hooks (@saas/api-client)
│   └── shared-ui/  # Shared design tokens, primitives, layout & login shell (@saas/shared-ui)
├── super-admin/    # Vite React app — platform administration (superadmin.yoursaas.com)
├── school-admin/   # Vite React app — manage one school (admin.school.yoursaas.com)
├── principal/      # Vite React app — school leadership, performance & approvals (principal.school.yoursaas.com)
├── teacher/        # Vite React app — teachers (teacher.school.yoursaas.com)
└── parent/         # Vite React app — ONE portal for BOTH students & parents (portal.school.yoursaas.com)
```

Each dashboard is a self-contained React/Vite/TypeScript application consuming shared libraries via npm workspaces (`@saas/api-client` and `@saas/shared-ui`). All dashboards communicate with the **same centralized backend API**.

> **Students & Parents share a single dashboard and a single login.** There is one portal (`parent/`) that serves
> both the `STUDENT` and `PARENT` roles. **Parents use the student's credentials** — there is no separate parent
> account. Guardian contact information is stored on the student record as data only. A parent logging in sees each
> of their children and can switch between them with the **Select Child** picker; the backend returns one unified
> dashboard payload for both roles.

## Features

- **Multi-tenant isolation** — tenant (`schoolId`) is resolved server-side from the authenticated session, never trusted from the client.
- **Auth** — JWT access + refresh tokens, login/logout, forgot/reset password, email verification, session management.
- **RBAC + permission system** — roles `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, `PARENT`, `STUDENT`, `STAFF` plus granular permissions (`students.view`, `fees.collect`, `results.publish`, `principal.results.approve`, …).
- **Admissions** — public form → document upload → school review → approve → auto-create student + guardian record (parents log in with student credentials).
- **Students / Parents / Teachers / Staff** management.
- **Fees & Payments** — categories, structures, assignments, payments, receipts, overdue tracking, automated notifications. Protected by **atomic database transactions** to prevent race conditions.
- **Attendance** — present/absent/late/leave with daily/monthly extraction + parental/student view.
- **Homework** — create/publish, student submissions, teacher grading.
- **Exams & Results** — exams, exam subjects, mark entry, publish results.
- **Timetable** — with teacher and section conflict detection.
- **Notices & Centralized Notifications** — role-targeted announcements and notification center with unread counters.
- **Principal Dashboard** — executive overview, at-risk students, attendance analytics, academic performance, approvals workflow, teacher workload, and reports.
- **Documents & Certificates** — secure file storage (Cloudinary or object storage), verification, download; certificate/TC generation & history.
- **Reports** — students, fees, attendance, examinations; CSV/PDF export endpoints.
- **Subscriptions** — plans, subscriptions, trials, invoices, student usage limits.
- **Audit logging** — audit trail recording for every sensitive operation.
- **Security** — password hashing (bcrypt), secure HTTP headers, CORS, rate limiting, file validation, soft deletion.

## Database & Cloud Architecture

The platform supports a robust database architecture:
1. **Primary Relational Store (PostgreSQL via Prisma)**: Handles operational entities with relational constraints, foreign keys, compound indexes, and ACID transactions.
2. **Google Cloud Firestore Integration (Firebase Admin SDK)**: Configured for cloud document storage and staged module migration.
   - Project: `sample-firebase-ai-app-5c298`
   - Named Database: `ai-studio-schoolsaasfinnn-5fae9775-87f1-4cd4-9ed0-dadf91c5bce5`
   - Initialized via `backend/src/config/firestore.ts` with strict fail-fast validation (no silent default database or project fallbacks).
   - Diagnostic Endpoint: `GET /api/firestore-health` (rate-limited, protected by `requireAuth` + `requireRole('SUPER_ADMIN')` with sanitized error reporting).

## Prerequisites

- Node.js 20+
- PostgreSQL (local, hosted, or Cloud SQL)
- npm 9+ (workspaces enabled)

## Getting Started

### 1. Backend

```bash
cd backend
cp .env.example .env        # configure DATABASE_URL, JWT secrets, email providers, etc.
npm install
npm run prisma:generate     # generate Prisma Client
npm run prisma:push         # push schema to PostgreSQL
npm run seed                # seed permissions, subscription plans, and demo accounts
npm run dev                 # starts API on port 3000 (or PORT env var)
```

Run Firestore integration diagnostics:
```bash
npm run test:firestore      # verifies named database selection and tenant boundaries
```

### 2. Dashboards (deployable independently or concurrently)

```bash
npm --workspace super-admin run dev   # Super Admin dashboard
npm --workspace school-admin run dev  # School Admin dashboard
npm --workspace principal run dev     # Principal dashboard
npm --workspace teacher run dev      # Teacher dashboard
npm --workspace parent run dev       # Student & Parent portal
```

### 3. Demo Accounts

All demo accounts belong to the seeded `DEMO` school (except the platform Super Admin) and share the default password `Demo@123`:

| Dashboard            | Email                 | Password  | Role |
|----------------------|-----------------------|-----------|------|
| Super Admin          | `super-admin@demo.com`| `Demo@123`| Platform Super Admin |
| School Admin         | `admin@demo.com`      | `Demo@123`| School Administrator |
| Principal            | `principal@demo.com`  | `Demo@123`| Principal / Leadership |
| Teacher              | `teacher@demo.com`    | `Demo@123`| Teacher |
| Student & Parent     | `student@demo.com`    | `Demo@123`| Student 1 (Parent uses child's credentials) |
| Student & Parent     | `student2@demo.com`   | `Demo@123`| Student 2 (Sibling login) |

## Email Delivery

Emails are sent via **REST API** with automatic provider failover:
- **Resend** is the primary provider.
- **Brevo (Sendinblue)** serves as the automatic fallback provider.
- If neither key is configured in dev, emails are safely logged to console (`[mail stub]`) without breaking request flows.

```env
EMAIL_FROM=noreply@yoursaas.com
RESEND_API_KEY=re_...
BREVO_API_KEY=...
```

## Security & Architecture Highlights

- **Atomic Financial Transactions**: `collectFee()` runs inside an interactive database transaction (`prisma.$transaction`) to guarantee that payment records and outstanding fee balances remain consistent under concurrent requests.
- **Strict Tenant & Student Ownership**: `schoolOf(req)` enforces tenant boundaries from verified JWT claims. In `studentFees()`, queries specifying `studentId` are validated against the student's authorized family records to prevent cross-student fee leakage.
- **Build Quality**: Verified with pure TypeScript compilation (`tsc`) across all packages and dashboards without swallowing errors.