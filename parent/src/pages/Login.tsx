import { LoginShell } from '@shared/index';

export default function Login() {
  return <LoginShell appName="Parent Portal" subtitle="Track your children's progress" roleValidator={(r) => r.includes('PARENT')} redirectTo="/" />;
}