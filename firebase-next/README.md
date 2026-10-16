# Firebase Next — isolated Firestore implementation

This directory is an additive implementation. It does **not** replace or edit the existing PostgreSQL/Prisma backend, existing Firestore configuration, frontend applications, or existing API routes.

## Scope in this phase

- Separate Node/Express service on port 5100 by default.
- Explicitly targets `FIREBASE_NEXT_PROJECT_ID` + `FIREBASE_NEXT_DATABASE_ID`; it does not reuse the existing `FIREBASE_PROJECT_ID` / `FIRESTORE_DATABASE_ID` configuration.
- Firebase Admin SDK uses Application Default Credentials (ADC), not a committed service-account key.
- Firebase ID token verification, required `tenantId` and `roles` custom claims, server-derived tenant IDs, tenant-filtered reads, and collection-level create permissions.
- Only these collections are exposed: `students`, `teachers`, `classes`, `attendance`, `notices`, `homework`, `exams`, `feeRecords`.
- Direct client Firestore access is denied by `firestore.rules`; all access in this phase is server-mediated.

## Configure a new database

1. In Firebase Console, select/create a **dedicated Firebase project** for this parallel implementation.
2. Enable Cloud Firestore and create a dedicated database. Record its exact database ID.
3. Enable Firebase Authentication providers required by the test environment.
4. Configure a service identity with the minimum required Firestore permissions. For local development, use `gcloud auth application-default login`; in production, prefer an attached service account/workload identity. Never commit a service-account JSON key.
5. Copy `.env.example` to `.env` in this directory and set `FIREBASE_NEXT_PROJECT_ID`, `FIREBASE_NEXT_DATABASE_ID`, and allowed client origins.
6. Set Firebase Authentication custom claims for each test user. Claims must include a non-empty `tenantId` and a `roles` array, for example `{ "tenantId": "school_demo_001", "roles": ["SCHOOL_ADMIN"] }`. Only a trusted administrative process may set these claims; clients must never set their own roles or tenant.
7. Deploy `firestore.rules` to the dedicated database. Keep direct client reads/writes denied.
8. From this directory, run `npm install`, `npm run build`, then `npm start`. For local development use `npm run dev`.
9. Verify `GET http://localhost:5100/health`; it performs a read-only probe and does not create data.
10. With a valid Firebase ID token, test `GET /v1/students` and a permitted `POST /v1/attendance`. Reads are filtered by the token's `tenantId`. The server derives `tenantId` and audit fields rather than accepting them from the client.

## API

- `GET /health` — read-only Firestore connectivity probe.
- `GET /v1/:collection` — list at most 100 records for the authenticated tenant.
- `POST /v1/:collection` — create a record only if the user's role is allowed for that collection.

All `/v1` routes require `Authorization: Bearer <Firebase ID token>`.

## Important limitations

This is an **isolated first implementation**, not yet a full migration of the SaaS application. The existing five dashboards still use the existing centralized API; they are not switched to this service. No PostgreSQL data is copied, and no production Firebase project/database is created or modified by the GitHub change. Existing Prisma models, business workflows, and response contracts must be mapped feature-by-feature before switching any dashboard. This service intentionally has no update/delete endpoints yet.

Before production use, add automated tests, pagination cursors, schema validation per domain entity, audit-log persistence, rate limiting, monitoring, and a trusted custom-claims provisioning flow. Review the tenant/role claims contract against the application's existing JWT/RBAC implementation before connecting real users.
