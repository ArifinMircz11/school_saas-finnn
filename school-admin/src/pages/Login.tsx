import { LoginShell } from '@saas/shared-ui';

export default function Login() {
  return (
    <LoginShell appName="School Admin" subtitle="Manage your school" roleValidator={(r) => r.includes('SCHOOL_ADMIN')} redirectTo="/" />
  );
}