import { randomUUID } from 'node:crypto';
import { getFirestoreInstance } from '../config/firestore';

type RecordData = Record<string, any> & { _docPath?: string };

function dbOrThrow() {
  const db = getFirestoreInstance();
  if (!db) throw new Error('Firestore is not configured');
  return db;
}

function toRecord(doc: any): RecordData {
  return { ...doc.data(), id: doc.id, _docPath: doc.ref.path };
}

async function findAcrossTenantAndSystem(collectionName: string, field: string, value: unknown): Promise<RecordData[]> {
  const db = dbOrThrow();
  const [tenantSnapshot, systemSnapshot] = await Promise.all([
    db.collectionGroup(collectionName).where(field, '==', value).get(),
    db.collection(`system_${collectionName}`).where(field, '==', value).get(),
  ]);
  return [
    ...tenantSnapshot.docs.map(toRecord),
    ...systemSnapshot.docs.map(toRecord),
  ];
}

export async function findUserByEmail(email: string): Promise<RecordData | null> {
  const db = dbOrThrow();
  const [tenant, system] = await Promise.all([
    db.collectionGroup('users').where('email', '==', email).limit(1).get(),
    db.collection('system_users').where('email', '==', email).limit(1).get(),
  ]);
  const found = tenant.docs[0] || system.docs[0];
  return found ? toRecord(found) : null;
}

export async function findUserById(id: string): Promise<RecordData | null> {
  const db = dbOrThrow();
  const global = await db.collection('system_users').doc(id).get();
  if (global.exists) return toRecord(global);
  const tenant = await db.collectionGroup('users').where('id', '==', id).limit(1).get();
  return tenant.empty ? null : toRecord(tenant.docs[0]);
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const rows = await findAcrossTenantAndSystem('userRoleAssignments', 'userId', userId);
  return rows.map((row) => String(row.role));
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const db = dbOrThrow();
  const rows = await findAcrossTenantAndSystem('userPermissions', 'userId', userId);
  const granted = rows.filter((row) => row.granted === true);
  const permissions = await Promise.all(granted.map(async (row) => {
    const permission = await db.collection('system_permissions').doc(String(row.permissionId)).get();
    return permission.exists ? permission.get('key') as string : null;
  }));
  return permissions.filter((value): value is string => typeof value === 'string');
}

export async function findUserProfile(collectionName: string, userId: string): Promise<RecordData | null> {
  const db = dbOrThrow();
  const snapshot = await db.collectionGroup(collectionName).where('userId', '==', userId).limit(1).get();
  return snapshot.empty ? null : toRecord(snapshot.docs[0]);
}

export async function updateUser(user: RecordData, patch: Record<string, unknown>): Promise<void> {
  if (!user._docPath) throw new Error('User document path is missing');
  await dbOrThrow().doc(user._docPath).update(patch);
}

export async function createRefreshToken(
  userId: string,
  schoolId: string | null,
  values: Record<string, unknown>,
): Promise<void> {
  const db = dbOrThrow();
  const id = randomUUID();
  const data = { ...values, id, userId, schoolId: schoolId ?? null };
  const ref = schoolId
    ? db.collection('schools').doc(schoolId).collection('refreshTokens').doc(id)
    : db.collection('system_refreshTokens').doc(id);
  await ref.create(data);
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<RecordData | null> {
  const rows = await findAcrossTenantAndSystem('refreshTokens', 'tokenHash', tokenHash);
  return rows[0] ?? null;
}

export async function revokeRefreshTokensByHash(tokenHash: string): Promise<void> {
  const rows = await findAcrossTenantAndSystem('refreshTokens', 'tokenHash', tokenHash);
  const db = dbOrThrow();
  const batch = db.batch();
  let count = 0;
  for (const row of rows) {
    if (!row._docPath) continue;
    batch.update(db.doc(row._docPath), { revokedAt: new Date() });
    count++;
    if (count === 450) {
      await batch.commit();
      count = 0;
    }
  }
  if (count) await batch.commit();
}

export async function revokeUserRefreshTokens(userId: string): Promise<void> {
  const rows = await findAcrossTenantAndSystem('refreshTokens', 'userId', userId);
  const active = rows.filter((row) => row.revokedAt == null && row._docPath);
  const db = dbOrThrow();
  for (let start = 0; start < active.length; start += 450) {
    const batch = db.batch();
    active.slice(start, start + 450).forEach((row) => batch.update(db.doc(row._docPath!), { revokedAt: new Date() }));
    await batch.commit();
  }
}

export function dateFromFirestore(value: any): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}


export async function findEmailOtp(
  filters: { email?: string; code?: string; purpose?: string },
): Promise<RecordData | null> {
  const db = dbOrThrow();
  const field = filters.email !== undefined ? 'email' : 'code';
  const value = filters.email !== undefined ? filters.email : filters.code;
  if (value === undefined) return null;
  const snapshot = await db.collection('system_emailOtps').where(field, '==', value).get();
  const found = snapshot.docs.find((doc) => {
    const data = doc.data();
    return (filters.email === undefined || data.email === filters.email)
      && (filters.code === undefined || data.code === filters.code)
      && (filters.purpose === undefined || data.purpose === filters.purpose);
  });
  return found ? toRecord(found) : null;
}

export async function upsertEmailOtp(
  email: string,
  code: string,
  purpose: string,
  expiresAt: Date,
): Promise<void> {
  const existing = await findEmailOtp({ email });
  const db = dbOrThrow();
  if (existing?._docPath) {
    await db.doc(existing._docPath).update({ code, purpose, expiresAt });
    return;
  }
  const id = randomUUID();
  await db.collection('system_emailOtps').doc(id).create({
    id, email, code, purpose, expiresAt, createdAt: new Date(),
  });
}

export async function deleteEmailOtp(record: RecordData): Promise<void> {
  if (!record._docPath) throw new Error('Email OTP document path is missing');
  await dbOrThrow().doc(record._docPath).delete();
}

export async function findSchoolById(id: string): Promise<Record<string, any> | null> {
  const snapshot = await dbOrThrow().collection('schools').doc(id).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  return { id: snapshot.id, name: data.name, logoUrl: data.logoUrl, status: data.status };
}
