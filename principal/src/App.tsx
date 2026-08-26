import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';

// Route-level code splitting keeps the initial bundle small.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Classes = lazy(() => import('./pages/Classes'));
const Attendance = lazy(() => import('./pages/Attendance'));
const AcademicPerformance = lazy(() => import('./pages/AcademicPerformance'));
const Exams = lazy(() => import('./pages/Exams'));
const Results = lazy(() => import('./pages/Results'));
const Homework = lazy(() => import('./pages/Homework'));
const Timetable = lazy(() => import('./pages/Timetable'));
const Admissions = lazy(() => import('./pages/Admissions'));
const Fees = lazy(() => import('./pages/Fees'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Notices = lazy(() => import('./pages/Notices'));
const Reports = lazy(() => import('./pages/Reports'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGuard role="PRINCIPAL"><AppLayout /></AuthGuard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentDetail />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/academic" element={<AcademicPerformance />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/results" element={<Results />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Suspense>
  );
}