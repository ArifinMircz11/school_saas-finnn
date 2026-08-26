import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUser } from '../services/api';

export default function AuthGuard({ children, role }: { children: React.ReactNode; role: string | string[] }) {
  const location = useLocation();
  const user = getUser();
  const allowed = Array.isArray(role) ? role : [role];
  if (!user || !user.roles.some((r) => allowed.includes(r))) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}