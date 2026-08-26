import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';

// Route-level code splitting keeps the initial bundle small.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Children = lazy(() => import('./pages/Children'));
const FeesPage = lazy(() => import('./pages/Fees'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Homework = lazy(() => import('./pages/Homework'));
const Timetable = lazy(() => import('./pages/Timetable'));
const Results = lazy(() => import('./pages/Results'));
const Documents = lazy(() => import('./pages/Documents'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Notices = lazy(() => import('./pages/Notices'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGuard role={['STUDENT', 'PARENT']}><AppLayout /></AuthGuard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/children" element={<Children />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/results" element={<Results />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/certificates" element={<Certificates />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Suspense>
  );
}