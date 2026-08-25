import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUser, hasRole } from '../services/api';

/** Redirect to /login when there is no authenticated user with the target role. */
export default function AuthGuard({ children, role }: { children: React.ReactNode; role: string }) {
  const location = useLocation();
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!hasRole(user, role)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}