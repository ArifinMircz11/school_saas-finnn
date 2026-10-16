import assert from 'node:assert/strict';
import { getConfiguredFirestoreDatabaseId, getFirestoreInstance, testFirestoreConnection } from '../config/firestore';

const EXPECTED_DATABASE_ID = 'ai-studio-schoolsaasfinnn-5fae9775-87f1-4cd4-9ed0-dadf91c5bce5';

type TestResult = { test: string; status: 'PASSED' | 'FAILED'; details: string };

export async function runIntegrationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    assert.equal(
      getConfiguredFirestoreDatabaseId(),
      EXPECTED_DATABASE_ID,
      'Configured Firestore database ID does not match the expected named database',
    );
    assert.ok(getFirestoreInstance(), 'Firestore instance is not initialized; check project/database configuration');
    results.push({
      test: 'DB-01: Explicit Named Database Configuration',
      status: 'PASSED',
      details: `Configured named database: ${EXPECTED_DATABASE_ID}`,
    });
  } catch (error) {
    results.push({
      test: 'DB-01: Explicit Named Database Configuration',
      status: 'FAILED',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const db = getFirestoreInstance();
    assert.ok(db, 'Cannot verify tenant path structure because Firestore is not configured');
    const schoolA = 'demo-school-alpha';
    const schoolB = 'demo-school-beta';
    const collA = db.collection('schools').doc(schoolA).collection('notices');
    const collB = db.collection('schools').doc(schoolB).collection('notices');
    assert.equal(collA.path, `schools/${schoolA}/notices`);
    assert.equal(collB.path, `schools/${schoolB}/notices`);
    assert.notEqual(collA.path, collB.path);
    results.push({
      test: 'SEC-01: Tenant Path Construction',
      status: 'PASSED',
      details: 'Tenant paths are distinct and scoped under schools/{schoolId}/notices.',
    });
  } catch (error) {
    results.push({
      test: 'SEC-01: Tenant Path Construction',
      status: 'FAILED',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const conn = await testFirestoreConnection();
    assert.equal(conn.success, true, conn.message);
    assert.equal(conn.databaseId, EXPECTED_DATABASE_ID);
    results.push({
      test: 'DB-02: Runtime Database Connectivity',
      status: 'PASSED',
      details: `Read probe succeeded for ${conn.databaseId}`,
    });
  } catch (error) {
    results.push({
      test: 'DB-02: Runtime Database Connectivity',
      status: 'FAILED',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}

if (require.main === module) {
  runIntegrationTests().then((results) => {
    let allPassed = true;
    for (const result of results) {
      if (result.status === 'PASSED') console.log(`[PASSED] ${result.test}: ${result.details}`);
      else {
        console.error(`[FAILED] ${result.test}: ${result.details}`);
        allPassed = false;
      }
    }
    if (!allPassed) process.exit(1);
  });
}
