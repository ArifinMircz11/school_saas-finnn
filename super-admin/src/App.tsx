import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';

// Route-level code splitting keeps the initial bundle small.
// (Schools.tsx exports two components, so each gets its own lazy wrapper.)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SchoolsByStatus = lazy(() =>
  import('./pages/Schools').then((m) => ({ default: m.SchoolsByStatus }))
);
const SchoolDetail = lazy(() =>
  import('./pages/Schools').then((m) => ({ default: m.SchoolDetail }))
);
const CreateSchool = lazy(() => import('./pages/CreateSchool'));
const Plans = lazy(() => import('./pages/Plans'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Users = lazy(() => import('./pages/Users'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Audit = lazy(() => import('./pages/Audit'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));

const Loading = () => <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={
          <AuthGuard role="SUPER_ADMIN">
            <AppLayout />
          </AuthGuard>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schools" element={<SchoolsByStatus />} />
          <Route path="/schools/pending" element={<SchoolsByStatus />} />
          <Route path="/schools/active" element={<SchoolsByStatus />} />
          <Route path="/schools/suspended" element={<SchoolsByStatus />} />
          <Route path="/schools/new" element={<CreateSchool />} />
          <Route path="/schools/:id" element={<SchoolDetail />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/users" element={<Users />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
      </Routes>
    </Suspense>
  );
}