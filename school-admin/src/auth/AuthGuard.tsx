import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUser } from '../services/api';

export default function AuthGuard({ children, role }: { children: React.ReactNode; role: string }) {
  const location = useLocation();
  const user = getUser();
  if (!user || !user.roles.includes(role)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}