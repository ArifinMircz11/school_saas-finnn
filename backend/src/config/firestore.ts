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
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({ projectId: projectId });
    }
    return getFirestore();
  } catch (e: any) {
    console.warn('Could not get firestore instance:', e?.message || e);
  }
  return null;
}

export const firestore = getFirestoreInstance();

// Test connection helper
export async function testFirestoreConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const db = getFirestoreInstance();
    if (!db) {
      return { success: false, message: 'Firestore client not initialized' };
    }
    const testDocRef = db.collection('_health_check').doc('connection_test');
    await testDocRef.set({ testedAt: new Date().toISOString() }, { merge: true });
    const docSnap = await testDocRef.get();
    if (docSnap.exists) {
      return { success: true, message: 'Successfully connected to Google Cloud Firestore and verified read/write access.' };
    }
    return { success: false, message: 'Test document write succeeded but read verification failed.' };
  } catch (error: any) {
    return { success: false, message: `Firestore connection test failed: ${error?.message || error}` };
  }
}
