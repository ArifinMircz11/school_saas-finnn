import { LoginShell } from '@saas/shared-ui';

export default function Login() {
  return <LoginShell appName="Principal" subtitle="School leadership, performance & approvals" roleValidator={(r) => r.includes('PRINCIPAL')} redirectTo="/" />;
}