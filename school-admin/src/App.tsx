import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';

// Route-level code splitting keeps the initial bundle small.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Parents = lazy(() => import('./pages/Parents'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Staff = lazy(() => import('./pages/Staff'));
const Academic = lazy(() => import('./pages/Academic'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Admissions = lazy(() => import('./pages/Admissions'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Fees = lazy(() => import('./pages/Fees'));
const Exams = lazy(() => import('./pages/Exams'));
const Homework = lazy(() => import('./pages/Homework'));
const Timetable = lazy(() => import('./pages/Timetable'));
const Documents = lazy(() => import('./pages/Documents'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Notices = lazy(() => import('./pages/Notices'));
const Reports = lazy(() => import('./pages/Reports'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));

const Loading = () => <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGuard role="SCHOOL_ADMIN"><AppLayout /></AuthGuard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/students" element={<Students />} />
          <Route path="/parents" element={<Parents />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/academic" element={<Academic />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/certificates" element={<Certificates />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}