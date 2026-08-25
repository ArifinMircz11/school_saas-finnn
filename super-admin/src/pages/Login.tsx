import { LoginShell } from '@shared/index';

export default function Login() {
  return (
    <LoginShell
      appName="Super Admin"
      subtitle="School SaaS platform administration"
      roleValidator={(roles) => roles.includes('SUPER_ADMIN')}
      redirectTo="/"
    />
  );
}