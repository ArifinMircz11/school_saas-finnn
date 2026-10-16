const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
import path from 'path';
import fs from 'fs';

let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), '../firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Could not load firebase-applet-config.json:', e);
}

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'sample-firebase-ai-app-5c298';
const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || 'ai-studio-schoolsaasfinnn-5fae9775-87f1-4cd4-9ed0-dadf91c5bce5';

if (!admin.apps || !admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: projectId,
    });
    console.log('✅ Firebase Admin SDK initialized for project:', projectId);
  } catch (error: any) {
    console.error('❌ Firebase Admin SDK initialization error:', error?.message || error);
  }
}

export function getFirestoreInstance() {
  try {
    const app = admin.apps && admin.apps.length > 0 ? admin.apps[0] : admin.initializeApp({ projectId: projectId });
    return getFirestore(app, databaseId);
  } catch (e: any) {
    console.warn('Could not get firestore instance with databaseId:', databaseId, e?.message || e);
    try {
      return getFirestore();
    } catch (err) {
      return null;
    }
  }
}

export const firestore = getFirestoreInstance();

// Test connection helper
export async function testFirestoreConnection(): Promise<{ success: boolean; message: string; databaseId: string }> {
  try {
    const db = getFirestoreInstance();
    if (!db) {
      return { success: false, message: 'Firestore client not initialized', databaseId };
    }
    const testDocRef = db.collection('_health_check').doc('connection_test');
    await testDocRef.set({ testedAt: new Date().toISOString() }, { merge: true });
    const docSnap = await testDocRef.get();
    if (docSnap.exists) {
      return { success: true, message: 'Successfully connected to Google Cloud Firestore and verified read/write access.', databaseId };
    }
    return { success: false, message: 'Test document write succeeded but read verification failed.', databaseId };
  } catch (error: any) {
    return { success: false, message: `Firestore connection test failed: ${error?.message || error}`, databaseId };
  }
}
