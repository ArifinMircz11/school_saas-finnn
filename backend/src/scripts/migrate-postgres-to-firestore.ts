import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { getFirestoreInstance } from '../config/firestore';

type Row = Record<string, unknown>;
type ModelRows = { model: string; rows: Row[] };

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 400;

// Relations used only to resolve a tenant for join/child tables that do not
// carry schoolId themselves. IDs are resolved against the source model, never
// guessed from a document ID alone.
const TENANT_RELATIONS: Record<string, Array<[field: string, model: string]>> = {
  UserRoleAssignment: [['userId', 'User']],
  UserPermission: [['userId', 'User']],
  RefreshToken: [['userId', 'User']],
  StudentParent: [['studentId', 'Student']],
  TeacherSection: [['teacherId', 'Teacher'], ['sectionId', 'Section']],
  TeacherSubject: [['teacherId', 'Teacher'], ['subjectId', 'Subject']],
  AdmissionDocument: [['admissionId', 'Admission']],
  StudentFee: [['studentId', 'Student']],
  FeePayment: [['studentFeeId', 'StudentFee']],
  HomeworkSubmission: [['homeworkId', 'Homework'], ['studentId', 'Student']],
  ExamSubject: [['examId', 'Exam']],
  ExamResult: [['examSubjectId', 'ExamSubject'], ['studentId', 'Student']],
  PrincipalProfile: [['userId', 'User']],
  ApprovalRequest: [['schoolId', 'School']],
};

// These are intentionally global platform data. Unknown records without a
// resolvable tenant stop the migration instead of leaking into a global bucket.
const GLOBAL_MODELS = new Set(['Permission', 'SubscriptionPlan', 'EmailOtp']);

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
function collectionName(model: string): string {
  const base = lowerFirst(model);
  if (base.endsWith('y')) return base.slice(0, -1) + 'ies';
  if (base.endsWith('s')) return base + 'es';
  return base + 's';
}
function toFirestoreValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && (value as any).constructor?.name === 'Decimal') {
    // Keep exact decimal precision during migration; do not silently round money.
    return (value as { toString(): string }).toString();
  }
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(toFirestoreValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Row)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, toFirestoreValue(child)]));
  }
  return value;
}

async function main() {
  const db = getFirestoreInstance();
  if (!db) throw new Error('Firestore is not configured. Set FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to read the PostgreSQL source.');

  const modelRows: ModelRows[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = (prisma as any)[lowerFirst(model.name)];
    if (!delegate?.findMany) throw new Error(`No Prisma delegate for model ${model.name}`);
    const rows = await delegate.findMany();
    modelRows.push({ model: model.name, rows: rows as Row[] });
  }

  const byModelAndId = new Map<string, Row>();
  const schoolByModelAndId = new Map<string, string>();
  for (const { model, rows } of modelRows) {
    for (const row of rows) {
      if (typeof row.id === 'string') {
        byModelAndId.set(`${model}:${row.id}`, row);
        if (typeof row.schoolId === 'string' && row.schoolId) {
          schoolByModelAndId.set(`${model}:${row.id}`, row.schoolId);
        } else if (model === 'School') {
          schoolByModelAndId.set(`School:${row.id}`, row.id);
        }
      }
    }
  }

  const unresolved: string[] = [];
  const planned: Array<{ path: string; data: Row; model: string }> = [];
  for (const { model, rows } of modelRows) {
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id) {
        unresolved.push(`${model}: record has no string id`);
        continue;
      }

      let schoolId = typeof row.schoolId === 'string' && row.schoolId ? row.schoolId : undefined;
      if (model === 'School') {
        planned.push({ path: `schools/${row.id}`, data: toFirestoreValue(row) as Row, model });
        continue;
      }

      if (!schoolId) {
        for (const [field, relatedModel] of TENANT_RELATIONS[model] || []) {
          const relatedId = row[field];
          if (typeof relatedId === 'string') {
            schoolId = schoolByModelAndId.get(`${relatedModel}:${relatedId}`);
            if (!schoolId) {
              const related = byModelAndId.get(`${relatedModel}:${relatedId}`);
              if (related && typeof related.schoolId === 'string') schoolId = related.schoolId;
            }
          }
          if (schoolId) break;
        }
      }

      const name = collectionName(model);
      if (schoolId) {
        planned.push({
          path: `schools/${schoolId}/${name}/${row.id}`,
          data: toFirestoreValue(row) as Row,
          model,
        });
      } else if (GLOBAL_MODELS.has(model) || (model === 'User' && row.schoolId == null)) {
        planned.push({
          path: `system_${name}/${row.id}`,
          data: toFirestoreValue(row) as Row,
          model,
        });
      } else {
        unresolved.push(`${model}/${row.id}: cannot resolve schoolId; refusing unsafe global placement`);
      }
    }
  }

  const summary = new Map<string, number>();
  for (const item of planned) summary.set(item.model, (summary.get(item.model) || 0) + 1);
  console.log(`Source records: ${modelRows.reduce((n, item) => n + item.rows.length, 0)}`);
  console.log(`Planned records: ${planned.length}`);
  for (const [model, count] of [...summary.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${model}: ${count}`);
  }

  if (unresolved.length) {
    console.error(`Preflight failed with ${unresolved.length} unresolved records:`);
    for (const issue of unresolved.slice(0, 100)) console.error(`  - ${issue}`);
    if (unresolved.length > 100) console.error(`  ... and ${unresolved.length - 100} more`);
    throw new Error('No documents were written because preflight did not pass.');
  }
  if (!APPLY) {
    console.log('DRY RUN only. No Firestore documents were written. Re-run with --apply to execute.');
    return;
  }

  let written = 0;
  for (let start = 0; start < planned.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of planned.slice(start, start + BATCH_SIZE)) {
      batch.set(db.doc(item.path), item.data, { merge: false });
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, planned.length - start);
    console.log(`Migrated ${written}/${planned.length}`);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  await db.collection('_migrationRuns').doc(runId).set({
    source: 'postgresql-prisma',
    targetDatabaseId: process.env.FIRESTORE_DATABASE_ID || null,
    completedAt: new Date(),
    recordCount: written,
    models: Object.fromEntries(summary),
    decimalPolicy: 'Decimal values serialized as strings to preserve exact precision',
  });
  console.log(`Migration completed. Source PostgreSQL data was not modified. Run: ${runId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Migration failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
