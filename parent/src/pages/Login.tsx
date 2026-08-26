import { LoginShell } from '@saas/shared-ui';

export default function Login() {
  return <LoginShell appName="Student & Parent Portal" subtitle="Access your accounts and your children's progress" roleValidator={(r) => r.includes('STUDENT') || r.includes('PARENT')} redirectTo="/" />;
}