# PostgreSQL → Cloud Firestore migration

## Scope and safety

The source of truth today is PostgreSQL accessed through Prisma. The target is the configured named Cloud Firestore database. This migration runner copies records; it never deletes or mutates the PostgreSQL source.

**The migration runner copies data only. The API controllers on this branch have been switched to Firestore, but this does not mean the PostgreSQL data has been copied or production traffic has been cut over.**

## Target document layout

- `School` → `schools/{schoolId}`
- Records with a resolved tenant → `schools/{schoolId}/{modelCollection}/{recordId}`
- Platform-level records (for example permissions, plans, email OTPs, and unscoped platform audit/support records) → `system_{modelCollection}/{recordId}`
- Foreign-key fields remain IDs. Relation joins are not materialized; API repositories must resolve them from Firestore.

Document IDs preserve the original PostgreSQL record IDs. The preflight refuses to write any documents if it cannot resolve a tenant for a record. Prisma Decimal values are serialized as strings to avoid silently rounding financial values; consumers must convert/validate these fields deliberately when the Firestore repositories are implemented.

## Required environment

Configure these in the backend runtime environment, not in source control:

- `DATABASE_URL`: read-only credentials to the existing PostgreSQL source are recommended.
- `FIREBASE_PROJECT_ID`: destination Firebase project ID.
- `FIRESTORE_DATABASE_ID`: exact named Firestore database ID.

Firebase Admin credentials must be available through the deployment's supported Application Default Credentials / service account mechanism. Never commit credentials or service-account JSON.

## Commands

From `backend/`:

1. `npm run migrate:firestore:dry-run` — reads PostgreSQL and builds a full migration plan; performs no writes.
2. Inspect the summary and resolve any preflight failures.
3. `npm run migrate:firestore` — writes documents in batches of 400 and records a run summary in `_migrationRuns`.

The apply command is repeatable for the same source IDs, but it overwrites matching destination documents. Do not run it against a populated destination until collisions and ownership have been reviewed. It does not clear destination documents absent from PostgreSQL.

## Implementation status (in progress)

The following backend areas have been switched to Firestore reads/writes on the migration branch while retaining their existing REST routes:
- Login, refresh/logout, account recovery, profile lookup, super-admin bootstrap/impersonation, and user/RBAC persistence
- Academic sessions, classes, sections, subjects, and role dashboard reads
- Student records and guardian links
- Attendance, timetable, homework/submissions, exams/marks/results
- Fee categories, fee structures, fee assignment, payments, fee reports, and fee notifications
- Notices, in-app notifications, and audit log writes

The backend route controllers have been switched to Firestore, including school/subscription/admission/document/principal flows. API startup and the readiness endpoint now probe Firestore rather than connecting to PostgreSQL. Prisma remains installed only to read the source PostgreSQL database during migration and to support legacy seed/schema tooling.

The code change is **not yet a verified production cutover**. No live data migration has been run, and no end-to-end test against the configured production Firestore database has been completed. Do not merge/deploy as production-ready until the dry-run is reviewed, data is copied and reconciled, and all five dashboards plus create/update/review/payment/auth flows pass integration tests.

## Completion gates

- Dry run reports all source records accounted for and zero unresolved tenant records.
- Apply completes with no failed batches.
- Verify source and target counts per model, representative relation IDs, tenant separation, and financial decimal values.
- Confirm runtime API code has no PostgreSQL/Prisma dependency; Prisma should remain only for source migration and legacy seed/schema tooling.
- Run HTTP integration tests for all five dashboards and critical create/update/review/payment/auth workflows against the configured Firestore database.
- Only then deploy the database cutover; retain PostgreSQL until rollback criteria are met.

The configured database identifier is sourced from `FIRESTORE_DATABASE_ID` and the checked-in applet configuration. The script never silently falls back to the default Firestore database.
