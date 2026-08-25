import { LoginShell } from '@shared/index';

export default function Login() {
  return <LoginShell appName="Student Portal" subtitle="Access your academic information" roleValidator={(r) => r.includes('STUDENT')} redirectTo="/" />;
}