import { LoginShell } from '@saas/shared-ui';

export default function Login() {
  return <LoginShell appName="Teacher" subtitle="Classes, attendance and marks" roleValidator={(r) => r.includes('TEACHER')} redirectTo="/" />;
}