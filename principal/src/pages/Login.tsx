import { LoginShell } from '@shared/index';

export default function Login() {
  return <LoginShell appName="Principal" subtitle="School leadership, performance & approvals" roleValidator={(r) => r.includes('PRINCIPAL')} redirectTo="/" />;
}