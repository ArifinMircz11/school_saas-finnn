import 'dotenv/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.FIREBASE_NEXT_PROJECT_ID;
const uid = process.env.FIREBASE_NEXT_UID;
const tenantId = process.env.FIREBASE_NEXT_TENANT_ID;
const rolesInput = process.env.FIREBASE_NEXT_ROLES || '';

const allowedRoles = new Set([
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'TEACHER',
  'PARENT',
  'STUDENT',
  'STAFF',
]);

async function main() {
  if (!projectId || !uid || !tenantId) {
    throw new Error('Set FIREBASE_NEXT_PROJECT_ID, FIREBASE_NEXT_UID, and FIREBASE_NEXT_TENANT_ID.');
  }

  const roles = [...new Set(rolesInput.split(',').map((role) => role.trim()).filter(Boolean))];
  if (!roles.length || roles.some((role) => !allowedRoles.has(role))) {
    throw new Error(`FIREBASE_NEXT_ROLES must be a comma-separated list of: ${[...allowedRoles].join(', ')}`);
  }

  const appName = 'school-saas-firebase-next-claims';
  const firebaseApp = getApps().find((item) => item.name === appName) || initializeApp({
    credential: applicationDefault(),
    projectId,
  }, appName);

  const auth = getAuth(firebaseApp);
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    tenantId,
    roles,
  });

  console.log(`Updated tenant and role claims for Firebase UID ${uid}. User must refresh their ID token before using the API.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not set Firebase custom claims.');
  process.exitCode = 1;
});
