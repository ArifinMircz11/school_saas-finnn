import path from 'path';
import fs from 'fs';
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

type FirebaseAppletConfig = {
  projectId?: string;
  firestoreDatabaseId?: string;
};

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(__dirname, '../../../firebase-applet-config.json');
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseAppletConfig;
  } catch {
    // Do not log file contents or environment secrets.
    console.warn('Firebase applet configuration could not be loaded.');
    return {};
  }
}

const firebaseConfig = loadFirebaseConfig();
const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

export function getFirestoreInstance() {
  if (!projectId || !databaseId) {
    console.warn('Firestore is not configured: FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID are required.');
    return null;
  }

  try {
    let app = admin.apps?.[0];
    if (!app) {
      app = admin.initializeApp({ projectId });
    } else {
      const initializedProjectId = app.options?.projectId;
      if (initializedProjectId && initializedProjectId !== projectId) {
        console.error('Firestore configuration projectId does not match the initialized Firebase Admin app.');
        return null;
      }
    }

    // Never silently fall back to the default database: the configured database is authoritative.
    return getFirestore(app, databaseId);
  } catch {
    // Avoid returning an instance for a different database or logging sensitive runtime details.
    console.error('Firestore client initialization failed for the configured database.');
    return null;
  }
}

export const firestore = getFirestoreInstance();

export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; databaseId: string | null }> {
  if (!databaseId) {
    return { success: false, message: 'Firestore database is not configured.', databaseId: null };
  }

  try {
    const db = getFirestoreInstance();
    if (!db) {
      return { success: false, message: 'Firestore client is not initialized for the configured database.', databaseId };
    }

    // Read-only probe: health checks must not create or mutate documents.
    await db.collection('_health_check').limit(1).get();
    return { success: true, message: 'Firestore read probe succeeded for the configured database.', databaseId };
  } catch {
    // Return a generic error to callers; detailed provider errors may expose environment information.
    return { success: false, message: 'Firestore read probe failed for the configured database.', databaseId };
  }
}
