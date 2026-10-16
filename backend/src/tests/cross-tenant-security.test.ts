import assert from 'node:assert/strict';
import { signAccessToken, verifyAccessToken } from '../utils/jwt';
import { schoolOf } from '../controllers/student.controller';
import { requireRole, requirePermission } from '../middleware/auth';

type Result = { name: string; passed: boolean; error?: string };

function test(name: string, run: () => void): Result {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function runRoleGuard(roles: string[], requiredRole: string) {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req: any = { auth: { roles } };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  requireRole(requiredRole)(req, res, () => { nextCalled = true; });
  return { statusCode, body, nextCalled };
}

function runPermissionGuard(roles: string[], permissions: string[], requiredPermission: string) {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req: any = { auth: { roles, permissions } };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  requirePermission(requiredPermission)(req, res, () => { nextCalled = true; });
  return { statusCode, body, nextCalled };
}

/**
 * Unit security suite. These checks exercise the real JWT helpers, tenant resolver,
 * and role middleware. They are not a substitute for HTTP/DB integration tests or
 * Firebase Emulator Suite tests.
 */
export function runRealTenantSecuritySuite(): Result[] {
  return [
    test('SEC-UNIT-01: JWT tenant claim is preserved and body tenant is ignored', () => {
      const token = signAccessToken({
        sub: 'admin-alpha-id',
        schoolId: 'tenant-school-alpha',
        roles: ['SCHOOL_ADMIN'],
        permissions: ['students.create'],
      });
      const decoded = verifyAccessToken(token);
      assert.equal(decoded.schoolId, 'tenant-school-alpha');
      const req: any = {
        auth: decoded,
        body: { schoolId: 'tenant-school-beta', name: 'Tampering attempt' },
      };
      assert.equal(schoolOf(req), 'tenant-school-alpha');
    }),
    test('SEC-UNIT-02: tampered JWT signature is rejected', () => {
      const token = signAccessToken({
        sub: 'admin-alpha-id',
        schoolId: 'tenant-school-alpha',
        roles: ['SCHOOL_ADMIN'],
        permissions: [],
      });
      const parts = token.split('.');
      assert.equal(parts.length, 3);
      parts[2] = `${parts[2][0] === 'a' ? 'b' : 'a'}${parts[2].slice(1)}`;
      assert.throws(() => verifyAccessToken(parts.join('.')));
    }),
    test('SEC-UNIT-03: role middleware denies a user without the required role', () => {
      const result = runRoleGuard(['TEACHER'], 'SUPER_ADMIN');
      assert.equal(result.statusCode, 403);
      assert.equal(result.nextCalled, false);
    }),
    test('SEC-UNIT-04: role middleware permits a user with the required role', () => {
      const result = runRoleGuard(['TEACHER'], 'TEACHER');
      assert.equal(result.statusCode, 200);
      assert.equal(result.nextCalled, true);
    }),
    test('SEC-UNIT-05: tenant-scoped controller fails closed without authentication', () => {
      assert.throws(() => schoolOf({} as any), (error: any) => error?.statusCode === 401);
    }),
    test('SEC-UNIT-06: tenant-scoped controller fails closed without school context', () => {
      assert.throws(
        () => schoolOf({ auth: { sub: 'platform-admin', schoolId: null, roles: ['SUPER_ADMIN'], permissions: [], type: 'access' } } as any),
        (error: any) => error?.statusCode === 403,
      );
    }),
    test('SEC-UNIT-07: permission middleware denies missing permission', () => {
      const result = runPermissionGuard(['STUDENT'], ['students.view'], 'users.manage');
      assert.equal(result.statusCode, 403);
      assert.equal(result.nextCalled, false);
    }),
    test('SEC-UNIT-08: permission middleware permits granted permission', () => {
      const result = runPermissionGuard(['SCHOOL_ADMIN'], ['students.view'], 'students.view');
      assert.equal(result.statusCode, 200);
      assert.equal(result.nextCalled, true);
    }),
    test('SEC-UNIT-09: SUPER_ADMIN permission bypass remains functional', () => {
      const result = runPermissionGuard(['SUPER_ADMIN'], [], 'users.manage');
      assert.equal(result.statusCode, 200);
      assert.equal(result.nextCalled, true);
    }),
  ];
}

if (require.main === module) {
  const results = runRealTenantSecuritySuite();
  let allPassed = true;
  for (const result of results) {
    if (result.passed) console.log(`[PASSED] ${result.name}`);
    else {
      console.error(`[FAILED] ${result.name}: ${result.error}`);
      allPassed = false;
    }
  }
  if (!allPassed) process.exit(1);
}
