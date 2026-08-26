import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';

// Route-level code splitting keeps the initial bundle small.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MyClasses = lazy(() => import('./pages/MyClasses'));
const MyStudents = lazy(() => import('./pages/MyStudents'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Homework = lazy(() => import('./pages/Homework'));
const Marks = lazy(() => import('./pages/Marks'));
const MyTimetable = lazy(() => import('./pages/MyTimetable'));
const Notices = lazy(() => import('./pages/Notices'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));

const Loading = () => <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthGuard role="TEACHER"><AppLayout /></AuthGuard>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/classes" element={<MyClasses />} />
          <Route path="/students" element={<MyStudents />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/marks" element={<Marks />} />
          <Route path="/timetable" element={<MyTimetable />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Suspense>
  );
}